import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureTechniqueCalendar, getDb } from "../../../db";
import { members, sessionRequests } from "../../../db/schema";
import { getFirebaseUser } from "../../firebase-auth";
import { isSiteOwner } from "../../../lib/access";
import { rejectCrossOriginMutation } from "../../../lib/request-security";
import { parseMoroccoLocalDateTime } from "../../../lib/morocco-datetime";

export const dynamic = "force-dynamic";
const SESSION_MINUTES = 75;
const TECHNIQUES = new Set([
  "Sitting & supine guard",
  "Leg entries & wrestle-ups",
  "Off-balancing",
  "Guard retention & escapes",
  "Guard passing",
  "Upper body attacks",
  "Lower body attacks",
  "K-guard",
  "De la Riva / reverse De la Riva",
  "Octopus guard",
  "Back attacks",
  "Other technique",
]);

export async function GET(request: Request) {
  await ensureTechniqueCalendar();
  const user = await getFirebaseUser(request);
  const db = getDb();
  const [pendingSlots, requests] = await Promise.all([
    db.select({ startsAt: sessionRequests.startsAt }).from(sessionRequests)
      .where(sql`${sessionRequests.status} = 'pending' AND ${sessionRequests.startsAt} > ${new Date().toISOString()}`)
      .orderBy(asc(sessionRequests.startsAt)),
    user
      ? db.select({ id: sessionRequests.id, technique: sessionRequests.technique, details: sessionRequests.details, startsAt: sessionRequests.startsAt, location: sessionRequests.location, status: sessionRequests.status, sessionId: sessionRequests.sessionId })
        .from(sessionRequests).where(eq(sessionRequests.memberId, user.userId)).orderBy(asc(sessionRequests.startsAt))
      : Promise.resolve([]),
  ]);
  return NextResponse.json({ pendingSlots, requests }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const user = await getFirebaseUser(request);
  if (!user) return NextResponse.json({ error: "Sign in before requesting a technique session." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const technique = typeof body?.technique === "string" ? body.technique.trim() : "";
  const details = typeof body?.details === "string" ? body.details.trim().replace(/\s+/g, " ").slice(0, 500) : "";
  const location = typeof body?.location === "string" ? body.location.trim().replace(/\s+/g, " ").slice(0, 160) : "";
  const startsAt = parseMoroccoLocalDateTime(body?.date, body?.time);
  if (!TECHNIQUES.has(technique) || !startsAt || startsAt.getTime() <= Date.now() || location.length < 2) {
    return NextResponse.json({ error: "Choose a technique, a future date and time in Morocco, and a location." }, { status: 400 });
  }
  if (technique === "Other technique" && details.length < 3) {
    return NextResponse.json({ error: "Describe the technique you would like to work on." }, { status: 400 });
  }

  await ensureTechniqueCalendar();
  const db = getDb();
  const owner = isSiteOwner(user);
  if (owner) {
    const now = new Date().toISOString();
    await db.insert(members).values({ userId: user.userId, email: user.email, displayName: user.displayName, status: "approved", approvedAt: now })
      .onConflictDoUpdate({ target: members.userId, set: { status: "approved", approvedAt: now, deletedAt: null } });
  }
  const [member] = await db.select({ status: members.status, deletedAt: members.deletedAt })
    .from(members).where(eq(members.userId, user.userId)).limit(1);
  if (!owner && (member?.status !== "approved" || member.deletedAt)) {
    return NextResponse.json({ error: "Your member access must be approved before requesting a session." }, { status: 403 });
  }

  const startsAtIso = startsAt.toISOString();
  const endsAtIso = new Date(startsAt.getTime() + SESSION_MINUTES * 60_000).toISOString();
  const result = await db.run(sql`
    INSERT INTO session_requests (member_id, technique, details, starts_at, location, status)
    SELECT ${user.userId}, ${technique}, ${details || null}, ${startsAtIso}, ${location}, 'pending'
    WHERE NOT EXISTS (
      SELECT 1 FROM sessions
      WHERE archived_at IS NULL
        AND julianday(starts_at) < julianday(${endsAtIso})
        AND julianday(starts_at) + ${SESSION_MINUTES / 1440} > julianday(${startsAtIso})
    )
    AND NOT EXISTS (
      SELECT 1 FROM session_requests
      WHERE status = 'pending'
        AND julianday(starts_at) < julianday(${endsAtIso})
        AND julianday(starts_at) + ${SESSION_MINUTES / 1440} > julianday(${startsAtIso})
    )
  `);
  if (Number(result.meta.changes) !== 1) {
    return NextResponse.json({ error: "That time is already reserved or awaiting approval. Choose another time." }, { status: 409 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const user = await getFirebaseUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to cancel your request." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Choose a valid request." }, { status: 400 });
  await ensureTechniqueCalendar();
  const result = await getDb().update(sessionRequests)
    .set({ status: "cancelled", reviewedAt: new Date().toISOString() })
    .where(sql`${sessionRequests.id} = ${id} AND ${sessionRequests.memberId} = ${user.userId} AND ${sessionRequests.status} = 'pending'`);
  if (Number(result.meta.changes) !== 1) return NextResponse.json({ error: "This pending request was not found." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
