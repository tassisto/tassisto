export type AppUser = { userId: string; displayName: string; email: string; isAdmin: boolean };
type FirebaseConfig = { apiKey: string; authDomain: string; projectId: string; appId: string };
type StoredSession = { idToken: string; refreshToken: string; expiresAt: number };
const SESSION_KEY = "tassisto.firebase.session";

async function config(): Promise<FirebaseConfig> {
  const response = await fetch("/api/auth/config", { cache: "no-store" });
  if (!response.ok) throw new Error("Firebase Authentication is not configured yet.");
  return response.json() as Promise<FirebaseConfig>;
}
function readSession(): StoredSession | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as StoredSession | null; } catch { return null; }
}
function saveSession(value: StoredSession) { localStorage.setItem(SESSION_KEY, JSON.stringify(value)); }
export function clearSession() { localStorage.removeItem(SESSION_KEY); }

async function refresh(session: StoredSession, cfg: FirebaseConfig): Promise<StoredSession> {
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
  });
  const data = await response.json() as { id_token?: string; refresh_token?: string; expires_in?: string; error?: { message?: string } };
  if (!response.ok || !data.id_token || !data.refresh_token) throw new Error(data.error?.message ?? "Sign in again to continue.");
  const updated = { idToken: data.id_token, refreshToken: data.refresh_token, expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
  saveSession(updated);
  return updated;
}
export async function getIdToken(): Promise<string | null> {
  const session = readSession();
  if (!session) return null;
  if (session.expiresAt > Date.now() + 60_000) return session.idToken;
  try { return (await refresh(session, await config())).idToken; } catch { clearSession(); return null; }
}
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = await getIdToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
async function authenticate(endpoint: "signInWithPassword" | "signUp", email: string, password: string) {
  const cfg = await config();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password, returnSecureToken: true }),
  });
  const data = await response.json() as { idToken?: string; refreshToken?: string; expiresIn?: string; error?: { message?: string } };
  if (!response.ok || !data.idToken || !data.refreshToken) throw new Error(humanizeFirebaseError(data.error?.message));
  saveSession({ idToken: data.idToken, refreshToken: data.refreshToken, expiresAt: Date.now() + Number(data.expiresIn ?? 3600) * 1000 });
  if(endpoint === "signUp") {
    const verify = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: data.idToken }),
    });
    if(!verify.ok) throw new Error("Account created, but Firebase could not send the verification email. Try signing in and requesting another verification email.");
    return null;
  }
  const lookup = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(cfg.apiKey), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:data.idToken})});
  const account = await lookup.json() as {users?: Array<{emailVerified?:boolean}>};
  if(!lookup.ok) throw new Error('Could not check your account. Please try again.');
  if(!account.users?.[0]?.emailVerified) throw new Error('Verify your email first. Check your inbox and spam folder, or resend the verification email below.');
  const user = await currentUser();
  if(!user) throw new Error('Could not load your member account. Please try again.');
  return user;
}
export function signIn(email: string, password: string) { return authenticate("signInWithPassword", email, password); }
export function createAccount(email: string, password: string) { return authenticate("signUp", email, password); }
export async function resendVerification(email:string,password:string) {
  const cfg=await config();
  const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(cfg.apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password,returnSecureToken:true})});
  const data=await response.json() as {idToken?:string;error?:{message?:string}};
  if(!response.ok||!data.idToken) throw new Error(humanizeFirebaseError(data.error?.message));
  const sent=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key='+encodeURIComponent(cfg.apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestType:'VERIFY_EMAIL',idToken:data.idToken})});
  if(!sent.ok) throw new Error('Could not send verification email. Please try again later.');
}
export async function sendPasswordReset(email: string) {
  const cfg = await config();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestType: "PASSWORD_RESET", email: email.trim() }),
  });
  const data = await response.json() as { error?: { message?: string } };
  if (!response.ok) throw new Error(humanizeFirebaseError(data.error?.message));
}
export async function currentUser(): Promise<AppUser | null> {
  const token = await getIdToken();
  if (!token) return null;
  const response = await fetch("/api/auth/session", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) { if(response.status===401) clearSession(); else throw new Error("Member sign-in is temporarily unavailable. Please try again."); return null; }
  return response.json() as Promise<AppUser>;
}
function humanizeFirebaseError(code?: string) {
  const messages: Record<string, string> = {
    CONFIGURATION_NOT_FOUND: "Sign-in is not configured for this site. Please contact the organizer.",
    API_KEY_INVALID: "Sign-in is not configured correctly. Please contact the organizer.",
    EMAIL_EXISTS: "An account already uses this email. Sign in instead.",
    EMAIL_NOT_FOUND: "No account was found for this email.",
    INVALID_PASSWORD: "The email or password is incorrect.",
    INVALID_LOGIN_CREDENTIALS: "The email or password is incorrect.",
    WEAK_PASSWORD: "Choose a password with at least 6 characters.",
    OPERATION_NOT_ALLOWED: "Email sign-in is not enabled. Please contact the organizer.",
    INVALID_EMAIL: "Enter a valid email address.",
    USER_DISABLED: "This account is disabled.",
    TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Try again later.",
  };
  return messages[(code ?? "").split(" : ")[0]] ?? "Could not authenticate. Check your details and try again.";
}
