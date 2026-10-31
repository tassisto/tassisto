import { asc, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureTechniqueCalendar, ensureSessionArchiveColumn, getDb } from "../../../db";
import { sessions } from "../../../db/schema";

export const dynamic = "force-dynamic";

// Only public dates are exposed; no identity, attendance or reservation data.
export async function GET() {
  await ensureTechniqueCalendar();
  await ensureSessionArchiveColumn();
  const rows = await getDb().select({ startsAt: sessions.startsAt, location: sessions.location }).from(sessions).where(isNull(sessions.archivedAt)).orderBy(asc(sessions.startsAt));
  return NextResponse.json({ sessions: rows.filter(row => /taroudant|تارودانت/i.test(row.location)).map(row => ({ startsAt: row.startsAt })) }, { headers: {
    "Access-Control-Allow-Origin": "https://tassisto.be",
    "Cache-Control": "public, max-age=60",
  } });
}
