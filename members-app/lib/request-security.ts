import { NextResponse } from "next/server";

/** Reject browser mutations initiated from a different origin. */
export function rejectCrossOriginMutation(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return NextResponse.json({ error: "A same-origin request is required." }, { status: 403 });
  }

  try {
    if (new URL(origin).origin === new URL(request.url).origin) return null;
  } catch {
    // Treat malformed Origin values as cross-origin.
  }

  return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
}
