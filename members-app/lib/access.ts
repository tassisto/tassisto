import { getFirebaseUser } from "../app/firebase-auth";
import { env } from "cloudflare:workers";

// Sites provides a Site-scoped user ID, so account IDs from the Sites control
// plane cannot be compared directly. Match the verified identity email supplied
// by Sites against the owner's private runtime setting instead.
export function isSiteOwner(user: { email: string } | null | undefined) {
  const ownerEmail = getSiteOwnerEmail();
  return Boolean(user && ownerEmail && user.email.trim().toLocaleLowerCase("en-US") === ownerEmail);
}

export function getSiteOwnerEmail() {
  return env.SITE_OWNER_EMAIL?.trim().toLocaleLowerCase("en-US") ?? null;
}

export async function requireSiteOwner(request: Request) {
  const user = await getFirebaseUser(request);
  return isSiteOwner(user) ? user : null;
}
