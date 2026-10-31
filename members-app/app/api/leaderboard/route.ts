import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { bookings, members, sessions } from "../../../db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const rows = await db.select({ userId: members.userId, publicName: members.publicName, bookingId: bookings.id, attendanceStatus: bookings.attendanceStatus, attendanceClosedAt: sessions.attendanceClosedAt })
    .from(members)
    .leftJoin(bookings, eq(bookings.userId, members.userId))
    .leftJoin(sessions, eq(sessions.id, bookings.sessionId))
    .where(eq(members.status, "approved"));

  const scores = new Map<string, { publicName: string | null; score: number }>();
  for (const row of rows) {
    const current = scores.get(row.userId) ?? { publicName: row.publicName, score: 0 };
    if (row.bookingId !== null && row.attendanceStatus === "on_time" && row.attendanceClosedAt !== null) current.score += 1;
    scores.set(row.userId, current);
  }

  const rankedEntries = [...scores.values()]
    .filter((entry) => entry.score > 0 && entry.publicName !== null)
    .sort((a, b) => b.score - a.score || (a.publicName ?? "").localeCompare(b.publicName ?? ""))
    .slice(0, 10);
  let currentRank = 0;
  let previousScore = -1;
  const ranked = rankedEntries.map((entry, index) => {
    if (entry.score !== previousScore) currentRank = index + 1;
    previousScore = entry.score;
    return { position: index + 1, rank: currentRank, name: entry.publicName, score: entry.score };
  });
  return NextResponse.json({ entries: ranked }, { headers: { "Cache-Control": "no-store" } });
}
