import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { members } from "../db/schema";

export type FirebaseUser = {
  userId: string;
  displayName: string;
  email: string;
};

export function firebaseWebConfig() {
  const { FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_APP_ID } = env;
  if (!FIREBASE_API_KEY || !FIREBASE_AUTH_DOMAIN || !FIREBASE_PROJECT_ID || !FIREBASE_APP_ID) return null;
  return { apiKey: FIREBASE_API_KEY, authDomain: FIREBASE_AUTH_DOMAIN, projectId: FIREBASE_PROJECT_ID, appId: FIREBASE_APP_ID };
}

export async function getFirebaseUser(request: Request): Promise<FirebaseUser | null> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const config = firebaseWebConfig();
  if (!token || !config) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { users?: Array<{ localId?: string; email?: string; displayName?: string; emailVerified?: boolean }> };
    const account = data.users?.[0];
    if (!account?.localId || !account.email || !account.emailVerified) return null;
    const email = account.email.trim().toLowerCase();
    // A verified Firebase email can reclaim its existing membership from the
    // earlier sign-in system. Keep its stable member ID and booking history.
    const matches = await getDb().select({userId: members.userId, displayName: members.displayName})
      .from(members).where(sql`lower(trim(${members.email})) = ${email}`).limit(2);
    if (matches.length > 1) return null;
    return { userId: matches[0]?.userId ?? account.localId, email, displayName: matches[0]?.displayName || account.displayName?.trim() || email };
  } catch {
    return null;
  }
}
