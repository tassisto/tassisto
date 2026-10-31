import { NextResponse } from "next/server";
import { getFirebaseUser } from "../../../firebase-auth";
import { isSiteOwner } from "../../../../lib/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getFirebaseUser(request);
  if (!user) return NextResponse.json({ error: "Sign in with email to continue." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ...user, isAdmin: isSiteOwner(user) }, { headers: { "Cache-Control": "no-store" } });
}
