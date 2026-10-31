import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureTechniqueCalendar, ensureSessionArchiveColumn, getDb } from "../../../db";
import { bookings, members, sessionRequests, sessions } from "../../../db/schema";
import { requireSiteOwner } from "../../../lib/access";
import { rejectCrossOriginMutation } from "../../../lib/request-security";
import { parseMoroccoLocalDateTime } from "../../../lib/morocco-datetime";
import { sessionEndTime } from "../../../lib/session-time";

export const dynamic = "force-dynamic";
const MEMBER_LIMIT = 10;

export async function GET(request: Request) {
  const owner = await requireSiteOwner(request);
  if (!owner) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  await ensureTechniqueCalendar();
  const db = getDb();
  const [requests, techniqueRequests, allSessions, allBookings, memberCount, allMembers] = await Promise.all([
    db.select().from(members).where(eq(members.status, "pending")).orderBy(desc(members.requestedAt)),
    db.select({ id: sessionRequests.id, memberId: sessionRequests.memberId, displayName: members.displayName, email: members.email, technique: sessionRequests.technique, details: sessionRequests.details, startsAt: sessionRequests.startsAt, location: sessionRequests.location, createdAt: sessionRequests.createdAt })
      .from(sessionRequests).innerJoin(members, eq(sessionRequests.memberId, members.userId)).where(eq(sessionRequests.status, "pending")).orderBy(asc(sessionRequests.startsAt)),
    db.select().from(sessions).orderBy(asc(sessions.startsAt)),
    db.select({ sessionId: bookings.sessionId, userId: bookings.userId, displayName: members.displayName, email: members.email, attendedAt: bookings.attendedAt, attendanceStatus: bookings.attendanceStatus }).from(bookings).innerJoin(members, eq(bookings.userId, members.userId)),
    db.select({ registered: sql<number>`count(*)` }).from(members).where(sql`${members.status} IN ('pending', 'approved') AND ${members.deletedAt} IS NULL AND lower(${members.email}) != lower(${owner.email})`),
    db.select().from(members).orderBy(asc(members.displayName)),
  ]);
  const registered = Number(memberCount[0]?.registered ?? 0);
  return NextResponse.json({
    requests,
    techniqueRequests,
    members: allMembers.filter(member => member.email.trim().toLowerCase() !== owner.email.trim().toLowerCase()),
    memberCapacity: { limit: MEMBER_LIMIT, registered, remaining: Math.max(0, MEMBER_LIMIT - registered) },
    sessions: allSessions.map((session) => {
      const roster = allBookings.filter((booking) => booking.sessionId === session.id);
      const memberRoster = roster.filter((booking) => booking.email.trim().toLowerCase() !== owner.email.trim().toLowerCase());
      return { ...session, capacity: 10, booked: memberRoster.length, roster: roster.map(({ userId, displayName, attendedAt, attendanceStatus }) => ({ userId, displayName, attendedAt, attendanceStatus })) };
    }),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const owner = await requireSiteOwner(request);
  if (!owner) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  await ensureTechniqueCalendar();
  await ensureSessionArchiveColumn();
  const db = getDb();

  if (body?.action === "member-status") {
    const userId = typeof body.userId === "string" ? body.userId : "";
    const status = body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : null;
    if (!userId || !status) return NextResponse.json({ error: "Invalid member update." }, { status: 400 });
    const [target] = await db.select({ status: members.status, email: members.email, deletedAt: members.deletedAt }).from(members).where(eq(members.userId, userId)).limit(1);
    if (!target) return NextResponse.json({ error: "Member request not found." }, { status: 404 });
    const isOwnerRecord = target.email.trim().toLowerCase() === owner.email.trim().toLowerCase();
    const alreadyUsesSlot = !target.deletedAt && (target.status === "pending" || target.status === "approved") && !isOwnerRecord;
    if (status === "approved" && !alreadyUsesSlot && !isOwnerRecord) {
      const [count] = await db.select({ registered: sql<number>`count(*)` }).from(members)
        .where(sql`${members.status} IN ('pending', 'approved') AND ${members.deletedAt} IS NULL AND lower(${members.email}) != lower(${owner.email})`);
      if (Number(count?.registered ?? 0) >= MEMBER_LIMIT) return NextResponse.json({ error: "All 10 member registration places are currently taken." }, { status: 409 });
    }
    if (isOwnerRecord) return NextResponse.json({ error: "The administrator cannot be revoked." }, { status: 400 });
    if (status === "rejected") {
      const now = new Date().toISOString();
      await db.delete(bookings).where(sql`${bookings.userId} = ${userId} AND EXISTS (SELECT 1 FROM sessions WHERE sessions.id = bookings.session_id AND sessions.starts_at > ${now})`);
    }
    await db.update(members).set({ status, approvedAt: status === "approved" ? new Date().toISOString() : null, ...(status === "approved" ? { deletedAt: null } : {}) }).where(eq(members.userId, userId));
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "review-technique-request") {
    const requestId = Number(body.requestId);
    const decision = body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : null;
    if (!Number.isInteger(requestId) || requestId < 1 || !decision) return NextResponse.json({ error: "Choose a valid technique request decision." }, { status: 400 });
    const [techniqueRequest] = await db.select().from(sessionRequests).where(eq(sessionRequests.id, requestId)).limit(1);
    if (!techniqueRequest || techniqueRequest.status !== "pending") return NextResponse.json({ error: "This request is no longer pending." }, { status: 404 });
    if (decision === "rejected") {
      await db.update(sessionRequests).set({ status: "rejected", reviewedAt: new Date().toISOString() }).where(and(eq(sessionRequests.id, requestId), eq(sessionRequests.status, "pending")));
      return NextResponse.json({ ok: true });
    }
    if (new Date(techniqueRequest.startsAt).getTime() <= Date.now()) return NextResponse.json({ error: "This requested time has already passed." }, { status: 409 });
    const durationDays = 75 / 1440;
    const created = await db.run(sql`
      INSERT INTO sessions (title, focus, starts_at, location, capacity, is_open)
      SELECT 'No-Gi · ' || technique, COALESCE(details, 'Technique session'), starts_at, location, 10, 1
      FROM session_requests
      WHERE id = ${requestId} AND status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM sessions
          WHERE archived_at IS NULL
            AND julianday(sessions.starts_at) < julianday(session_requests.starts_at) + ${durationDays}
            AND julianday(sessions.starts_at) + ${durationDays} > julianday(session_requests.starts_at)
        )
        AND NOT EXISTS (
          SELECT 1 FROM session_requests other
          WHERE other.id != session_requests.id AND other.status = 'pending'
            AND julianday(other.starts_at) < julianday(session_requests.starts_at) + ${durationDays}
            AND julianday(other.starts_at) + ${durationDays} > julianday(session_requests.starts_at)
        )
    `);
    const sessionId = Number(created.meta.last_row_id);
    if (Number(created.meta.changes) !== 1 || !Number.isInteger(sessionId) || sessionId < 1) {
      return NextResponse.json({ error: "This time now conflicts with another session or pending request. Review the calendar before approving." }, { status: 409 });
    }
    await db.batch([
      db.insert(bookings).values({ sessionId, userId: techniqueRequest.memberId }).onConflictDoNothing(),
      db.update(sessionRequests).set({ status: "approved", reviewedAt: new Date().toISOString(), sessionId })
        .where(and(eq(sessionRequests.id, requestId), eq(sessionRequests.status, "pending"))),
    ]);
    return NextResponse.json({ ok: true, sessionId });
  }

  if (body?.action === "create-session") {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 90) : "";
    const focus = typeof body.focus === "string" ? body.focus.trim().slice(0, 120) : "No-Gi Jiu-Jitsu";
    const startsAt = parseMoroccoLocalDateTime(body.date, body.time);
    const location = typeof body.location === "string" ? body.location.trim().slice(0, 160) : "";
    if (title.length < 3 || !startsAt || startsAt.getTime() <= Date.now() || location.length < 2) {
      return NextResponse.json({ error: "Enter a valid future date as DD/MM/YYYY, time as HH:mm in Morocco time, a session title and a location." }, { status: 400 });
    }
    const startsAtIso = startsAt.toISOString();
    const endsAtIso = new Date(startsAt.getTime() + 75 * 60_000).toISOString();
    const result = await db.run(sql`
      INSERT INTO sessions (title, focus, starts_at, location, capacity, is_open)
      SELECT ${title}, ${focus}, ${startsAtIso}, ${location}, 10, 1
      WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE archived_at IS NULL AND julianday(starts_at) < julianday(${endsAtIso}) AND julianday(starts_at) + ${75 / 1440} > julianday(${startsAtIso}))
        AND NOT EXISTS (SELECT 1 FROM session_requests WHERE status = 'pending' AND julianday(starts_at) < julianday(${endsAtIso}) AND julianday(starts_at) + ${75 / 1440} > julianday(${startsAtIso}))
    `);
    if (Number(result.meta.changes) !== 1) return NextResponse.json({ error: "That time overlaps a scheduled session or a member request. Choose another time." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "update-session") {
    const sessionId = Number(body.sessionId);
    const title = typeof body.title === "string" ? body.title.trim().slice(0,90) : "";
    const focus = typeof body.focus === "string" ? body.focus.trim().slice(0,120) : "";
    const location = typeof body.location === "string" ? body.location.trim().slice(0,160) : "";
    const startsAt = parseMoroccoLocalDateTime(body.date, body.time);
    if (!Number.isInteger(sessionId) || title.length < 3 || !focus || location.length < 2 || !startsAt || startsAt.getTime() <= Date.now()) return NextResponse.json({error:"Enter a valid future session date, time, title, focus and location."},{status:400});
    const [existing] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (!existing) return NextResponse.json({error:"Session not found."},{status:404});
    if (existing.attendanceClosedAt || new Date(existing.startsAt).getTime() <= Date.now()) return NextResponse.json({error:"Past sessions cannot be rescheduled."},{status:409});
    const startsAtIso = startsAt.toISOString();
    const endsAtIso = new Date(startsAt.getTime() + 75 * 60_000).toISOString();
    const result = await db.run(sql`
      UPDATE sessions SET title = ${title}, focus = ${focus}, location = ${location}, starts_at = ${startsAtIso}
      WHERE id = ${sessionId} AND NOT EXISTS (
        SELECT 1 FROM sessions other WHERE other.id != ${sessionId} AND other.archived_at IS NULL
          AND julianday(other.starts_at) < julianday(${endsAtIso}) AND julianday(other.starts_at) + ${75 / 1440} > julianday(${startsAtIso})
      ) AND NOT EXISTS (
        SELECT 1 FROM session_requests WHERE status = 'pending'
          AND julianday(starts_at) < julianday(${endsAtIso}) AND julianday(starts_at) + ${75 / 1440} > julianday(${startsAtIso})
      )
    `);
    if (Number(result.meta.changes) !== 1) return NextResponse.json({ error: "That time overlaps a scheduled session or member request." }, { status: 409 });
    return NextResponse.json({ok:true});
  }

  if (body?.action === "toggle-session") {
    const sessionId = Number(body.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1 || typeof body.isOpen !== "boolean") return NextResponse.json({ error: "Invalid session update." }, { status: 400 });
    await db.update(sessions).set({ isOpen: body.isOpen }).where(eq(sessions.id, sessionId));
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "archive-session" || body?.action === "restore-session") {
    const sessionId = Number(body.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) return NextResponse.json({ error: "Choose a valid session." }, { status: 400 });
    const [session] = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (!session) return NextResponse.json({ error: "This session no longer exists." }, { status: 404 });
    await db.update(sessions).set(body.action === "archive-session"
      ? { archivedAt: new Date().toISOString(), isOpen: false }
      : { archivedAt: null }).where(eq(sessions.id, sessionId));
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "attendance") {
    const sessionId = Number(body.sessionId);
    const userId = typeof body.userId === "string" ? body.userId : "";
    const attendanceStatus = body.status === "on_time" || body.status === "late" || body.status === "absent" ? body.status : null;
    if (!Number.isInteger(sessionId) || sessionId < 1 || !userId || !attendanceStatus) return NextResponse.json({ error: "Choose on time, late, or absent." }, { status: 400 });
    const [session] = await db.select({ startsAt: sessions.startsAt, attendanceClosedAt: sessions.attendanceClosedAt }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (!session || sessionEndTime(session.startsAt).getTime() > Date.now()) return NextResponse.json({ error: "Attendance can be recorded after the 1 hour 15 minute session has finished." }, { status: 400 });
    if (session.attendanceClosedAt) return NextResponse.json({ error: "Attendance is closed for this session." }, { status: 409 });
    const [booking] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.sessionId, sessionId), eq(bookings.userId, userId))).limit(1);
    if (!booking) return NextResponse.json({ error: "No reservation was found for this member." }, { status: 404 });
    await db.update(bookings).set({ attendanceStatus, attendedAt: attendanceStatus === "on_time" ? new Date().toISOString() : null }).where(eq(bookings.id, booking.id));
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "close-attendance") {
    const sessionId = Number(body.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) return NextResponse.json({ error: "Choose a valid session." }, { status: 400 });
    const [session] = await db.select({ startsAt: sessions.startsAt, attendanceClosedAt: sessions.attendanceClosedAt }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (!session) return NextResponse.json({ error: "This session no longer exists." }, { status: 404 });
    if (sessionEndTime(session.startsAt).getTime() > Date.now()) return NextResponse.json({ error: "Attendance can be closed after the 1 hour 15 minute session has finished." }, { status: 400 });
    if (session.attendanceClosedAt) return NextResponse.json({ ok: true, alreadyClosed: true });
    const [unmarked] = await db.select({ count: sql<number>`count(*)` }).from(bookings).where(and(eq(bookings.sessionId, sessionId), isNull(bookings.attendanceStatus)));
    if (Number(unmarked?.count ?? 0) > 0) return NextResponse.json({ error: "Mark each reserved member on time, late, or absent before closing attendance." }, { status: 409 });
    await db.update(sessions).set({ attendanceClosedAt: new Date().toISOString() }).where(eq(sessions.id, sessionId));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown admin action." }, { status: 400 });
}
