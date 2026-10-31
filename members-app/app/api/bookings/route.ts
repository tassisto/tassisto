import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getFirebaseUser } from "../../firebase-auth";
import { ensureTechniqueCalendar, ensureSessionArchiveColumn, getDb } from "../../../db";
import { bookings, members, sessions } from "../../../db/schema";
import { getSiteOwnerEmail, isSiteOwner } from "../../../lib/access";
import { rejectCrossOriginMutation } from "../../../lib/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const user = await getFirebaseUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to reserve a spot." }, { status: 401 });
  await ensureTechniqueCalendar();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const sessionId = Number(body?.sessionId);
  if (!Number.isInteger(sessionId) || sessionId < 1) return NextResponse.json({ error: "Choose a valid session." }, { status: 400 });

  await ensureSessionArchiveColumn();
  const db = getDb();
  const now = new Date().toISOString();
  const isOwner = isSiteOwner(user);
  const ownerEmail = getSiteOwnerEmail();
  // The organizer is shown as an approved member in the interface. Create the
  // matching row first so the bookings foreign key accepts their reservation.
  if (isOwner) {
    await db.insert(members).values({ userId: user.userId, email: user.email, displayName: user.displayName, status: "approved", approvedAt: now }).onConflictDoUpdate({ target: members.userId, set: { status: "approved", approvedAt: now, deletedAt: null } });
  }
  const result = await db.run(sql`
    INSERT INTO bookings (session_id, user_id)
    SELECT ${sessionId}, ${user.userId}
    WHERE (${isOwner} OR EXISTS (SELECT 1 FROM members WHERE user_id = ${user.userId} AND status = 'approved' AND deleted_at IS NULL))
      AND EXISTS (SELECT 1 FROM sessions WHERE id = ${sessionId} AND is_open = 1 AND archived_at IS NULL AND starts_at > ${now})
      AND EXISTS (SELECT 1 FROM members WHERE user_id = ${user.userId} AND status = 'approved' AND deleted_at IS NULL)
      AND (${isOwner} OR (SELECT COUNT(*) FROM bookings
          INNER JOIN members ON members.user_id = bookings.user_id
          WHERE bookings.session_id = ${sessionId}
            AND (${ownerEmail} IS NULL OR lower(members.email) != lower(${ownerEmail}))) < 10)
    ON CONFLICT(session_id, user_id) DO NOTHING
  `);
  if (Number(result.meta.changes) === 1) return NextResponse.json({ ok: true });

  const [member] = await db.select({ status: members.status }).from(members).where(eq(members.userId, user.userId)).limit(1);
  if (!isOwner && member?.status !== "approved") return NextResponse.json({ error: "Your member access must be approved before booking." }, { status: 403 });
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session || !session.isOpen || new Date(session.startsAt).getTime() <= Date.now()) return NextResponse.json({ error: "This session is closed." }, { status: 409 });
  const [existing] = await db.select({ id: bookings.id }).from(bookings).where(sql`${bookings.sessionId} = ${sessionId} AND ${bookings.userId} = ${user.userId}`).limit(1);
  if (existing) return NextResponse.json({ error: "You already have a spot in this session." }, { status: 409 });
  return NextResponse.json({ error: "This session is full." }, { status: 409 });
}

export async function DELETE(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const user = await getFirebaseUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to manage your reservation." }, { status: 401 });
  await ensureTechniqueCalendar();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const sessionId = Number(body?.sessionId);
  if (!Number.isInteger(sessionId) || sessionId < 1) return NextResponse.json({ error: "Choose a valid session." }, { status: 400 });
  await ensureSessionArchiveColumn();
  const db = getDb();
  const [session] = await db.select({ startsAt: sessions.startsAt }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) return NextResponse.json({ error: "This session no longer exists." }, { status: 404 });
  if (new Date(session.startsAt).getTime() <= Date.now()) return NextResponse.json({ error: "Reservations can only be cancelled before the session starts." }, { status: 409 });
  const result = await db.delete(bookings).where(sql`${bookings.sessionId} = ${sessionId} AND ${bookings.userId} = ${user.userId}`);
  if (Number(result.meta.changes) < 1) return NextResponse.json({ error: "No reservation found for this session." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
