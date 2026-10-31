import { NextResponse } from "next/server";
import { firebaseWebConfig } from "../../../firebase-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = firebaseWebConfig();
  if (!config) return NextResponse.json({ error: "Firebase Authentication is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(config, { headers: { "Cache-Control": "public, max-age=300" } });
}
