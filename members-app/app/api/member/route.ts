import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getFirebaseUser } from "../../firebase-auth";
import { getDb } from "../../../db";
import { bookings, members, sessions } from "../../../db/schema";
import { getSiteOwnerEmail, isSiteOwner } from "../../../lib/access";
import { rejectCrossOriginMutation } from "../../../lib/request-security";

export const dynamic = "force-dynamic";
const MEMBER_LIMIT = 10;

async function memberCapacity(db: ReturnType<typeof getDb>) {
  const ownerEmail = getSiteOwnerEmail() ?? "";
  const [row] = await db.select({ registered: sql<number>`count(*)` }).from(members)
    .where(sql`${members.status} IN ('pending', 'approved') AND ${members.deletedAt} IS NULL AND lower(${members.email}) != lower(${ownerEmail})`);
  const registered = Number(row?.registered ?? 0);
  return { limit: MEMBER_LIMIT, registered, remaining: Math.max(0, MEMBER_LIMIT - registered) };
}

export async function GET(request: Request) {
  const user = await getFirebaseUser(request);
  const db = getDb();
  const capacity = await memberCapacity(db);
  if (!user) return NextResponse.json({ member: null, memberCapacity: capacity }, { headers: { "Cache-Control": "no-store" } });
  const [member] = isSiteOwner(user) ? [{ status: "approved", displayName: user.displayName, email: user.email, publicName: null, deletedAt: null }] : await db.select({ status: members.status, displayName: members.displayName, email: members.email, publicName: members.publicName, deletedAt: members.deletedAt }).from(members).where(eq(members.userId, user.userId)).limit(1);
  const pastBookings = await db.select({ id: bookings.id }).from(bookings).innerJoin(sessions, eq(bookings.sessionId, sessions.id)).where(and(eq(bookings.userId, user.userId), eq(bookings.attendanceStatus, "on_time"), isNotNull(sessions.attendanceClosedAt)));
  return NextResponse.json({ member: member ? { ...member, attendedSessions: pastBookings.length } : null, memberCapacity: capacity }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const user = await getFirebaseUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to update your profile." }, { status: 401 });
  if (isSiteOwner(user)) return NextResponse.json({ error: "The organizer profile cannot join the member leaderboard." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (typeof body?.publicName !== "string") return NextResponse.json({ error: "Choose a nickname or leave it blank." }, { status: 400 });
  const publicName = body.publicName.trim().replace(/\s+/g, " ");
  if (publicName && (publicName.length < 2 || publicName.length > 24 || /[@\r\n\t]/.test(publicName))) {
    return NextResponse.json({ error: "Nickname must be 2–24 characters and cannot contain an email address." }, { status: 400 });
  }
  const db = getDb();
  const [member] = await db.select({ userId: members.userId }).from(members).where(and(eq(members.userId, user.userId), eq(members.status, "approved"), isNull(members.deletedAt))).limit(1);
  if (!member) return NextResponse.json({ error: "Only approved members can update a leaderboard nickname." }, { status: 403 });
  await db.update(members).set({ publicName: publicName || null }).where(eq(members.userId, user.userId));
  return NextResponse.json({ ok: true, publicName: publicName || null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const user = await getFirebaseUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to request member access." }, { status: 401 });
  if (isSiteOwner(user)) return NextResponse.json({ member: { status: "approved" } });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.consent !== true) return NextResponse.json({ error: "Consent is required before member details can be stored." }, { status: 400 });
  const db = getDb();
  const consentedAt = new Date().toISOString();
  const ownerEmail = getSiteOwnerEmail() ?? "";
  await db.run(sql`INSERT INTO members (user_id, email, display_name, status, consented_at, consent_version, deleted_at)
    SELECT ${user.userId}, ${user.email}, ${user.displayName}, 'pending', ${consentedAt}, 'member-data-v1-2026-10-25', NULL
    WHERE (SELECT COUNT(*) FROM members WHERE status IN ('pending', 'approved') AND deleted_at IS NULL AND lower(email) != lower(${ownerEmail})) < ${MEMBER_LIMIT}
    ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, status = 'pending', requested_at = ${consentedAt}, approved_at = NULL, consented_at = ${consentedAt}, consent_version = 'member-data-v1-2026-10-25', deleted_at = NULL
    WHERE members.status IN ('rejected', 'deleted')`);
  const [member] = await db.select({ status: members.status }).from(members).where(eq(members.userId, user.userId)).limit(1);
  if (!member || member.status === "rejected" || member.status === "deleted") {
    const capacity = await memberCapacity(db);
    if (capacity.remaining === 0) return NextResponse.json({ error: "All 10 member registration places are currently taken.", memberCapacity: capacity }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ member }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const user = await getFirebaseUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to remove your member profile." }, { status: 401 });
  if (isSiteOwner(user)) return NextResponse.json({ error: "The organizer profile cannot be removed here." }, { status: 403 });
  const db = getDb();
  const [member] = await db.select({ status: members.status }).from(members).where(eq(members.userId, user.userId)).limit(1);
  if (!member || member.status === "deleted") return NextResponse.json({ error: "No active member profile was found." }, { status: 404 });
  const deletedAt = new Date().toISOString();
  await db.delete(bookings).where(sql`${bookings.userId} = ${user.userId} AND EXISTS (SELECT 1 FROM sessions WHERE sessions.id = bookings.session_id AND sessions.starts_at > ${deletedAt})`);
  await db.update(members).set({ status: "deleted", deletedAt, approvedAt: null }).where(eq(members.userId, user.userId));
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
