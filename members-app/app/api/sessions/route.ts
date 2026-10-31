import { asc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getFirebaseUser } from "../../firebase-auth";
import { ensureTechniqueCalendar, ensureSessionArchiveColumn, getDb } from "../../../db";
import { bookings, members, sessionRequests, sessions } from "../../../db/schema";
import { getSiteOwnerEmail } from "../../../lib/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureTechniqueCalendar();
  await ensureSessionArchiveColumn();
  const db = getDb();
  const user = await getFirebaseUser(request);
  const now = new Date().toISOString();
  const [allSessions, allBookings, pendingSlots, myRequests] = await Promise.all([
    db.select().from(sessions).where(isNull(sessions.archivedAt)).orderBy(asc(sessions.startsAt)),
    db.select({ sessionId: bookings.sessionId, userId: bookings.userId, email: members.email }).from(bookings).innerJoin(members, eq(bookings.userId, members.userId)),
    db.select({ startsAt: sessionRequests.startsAt }).from(sessionRequests).where(sql`${sessionRequests.status} = 'pending' AND ${sessionRequests.startsAt} > ${now}`).orderBy(asc(sessionRequests.startsAt)),
    user ? db.select({ id: sessionRequests.id, technique: sessionRequests.technique, details: sessionRequests.details, startsAt: sessionRequests.startsAt, location: sessionRequests.location, status: sessionRequests.status, sessionId: sessionRequests.sessionId }).from(sessionRequests).where(eq(sessionRequests.memberId, user.userId)).orderBy(asc(sessionRequests.startsAt)) : Promise.resolve([]),
  ]);
  const ownerEmail = getSiteOwnerEmail();
  return NextResponse.json({
    sessions: allSessions.filter((session) => new Date(session.startsAt).getTime() > Date.now()).map((session) => {
      const memberBookings = allBookings.filter((booking) => booking.sessionId === session.id && (!ownerEmail || booking.email.trim().toLowerCase() !== ownerEmail));
      const count = memberBookings.length;
      return { ...session, capacity: 10, booked: count, spotsLeft: Math.max(0, 10 - count), isBooked: !!user && allBookings.some((booking) => booking.sessionId === session.id && booking.userId === user.userId) };
    }),
    pendingSlots,
    requests: myRequests,
  }, { headers: { "Cache-Control": "no-store" } });
}
