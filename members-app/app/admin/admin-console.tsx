"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { authFetch, clearSession, currentUser, resendVerification, sendPasswordReset, signIn, type AppUser } from "../firebase-client";
import { sessionEndTime } from "../../lib/session-time";

type RosterMember = { userId: string; displayName: string; attendanceStatus: "on_time" | "late" | "absent" | null };
type TrainingSession = { id: number; title: string; focus: string; startsAt: string; location: string; capacity: number; isOpen: boolean; archivedAt: string | null; attendanceClosedAt: string | null; booked: number; roster: RosterMember[] };
type Member = { userId: string; displayName: string; email: string; status: string; deletedAt: string | null };
type TechniqueRequest = { id: number; memberId: string; displayName: string; email: string; technique: string; details: string | null; startsAt: string; location: string; createdAt: string };
type AdminData = { sessions?: TrainingSession[]; members?: Member[]; techniqueRequests?: TechniqueRequest[]; error?: string; ok?: boolean };

function dateInput(value: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Casablanca", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}
function sessionTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Casablanca", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}

export function AdminConsole() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [techniqueRequests, setTechniqueRequests] = useState<TechniqueRequest[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TrainingSession | null>(null);

  const load = useCallback(async () => {
    const response = await authFetch("/api/admin", { cache: "no-store" });
    const data = await response.json() as AdminData;
    if (!response.ok) throw new Error(data.error ?? "Could not load the administrator area.");
    setSessions(data.sessions ?? []);
    setMembers(data.members ?? []);
    setTechniqueRequests(data.techniqueRequests ?? []);
  }, []);

  useEffect(() => { void currentUser().then(setUser).catch(error => setNotice(error.message)).finally(() => setChecked(true)); }, []);
  useEffect(() => { if (user?.isAdmin) void load().catch(error => setNotice(error.message)); }, [load, user]);

  async function submitSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    try { setUser(await signIn(email, password)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not sign in."); }
    finally { setBusy(false); }
  }
  async function recover(verify = false) {
    if (!email.trim()) { setNotice("Enter your email first."); return; }
    if (verify && !password) { setNotice("Enter your password to resend verification."); return; }
    setBusy(true);
    try {
      if (verify) await resendVerification(email, password); else await sendPasswordReset(email);
      setNotice(verify ? "Verification email sent. Verify your email, then sign in." : "Password reset requested. Check your inbox and spam folder.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not send email."); }
    finally { setBusy(false); }
  }
  async function update(body: Record<string, unknown>, success: string) {
    setBusy(true); setNotice("");
    try {
      const response = await authFetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as AdminData;
      if (!response.ok) throw new Error(data.error ?? "Could not save your change.");
      await load(); setNotice(success); return true;
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save your change."); return false; }
    finally { setBusy(false); }
  }
  async function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (await update({ action: editing ? "update-session" : "create-session", ...(editing ? { sessionId: editing.id } : {}), title: form.get("title"), focus: form.get("focus"), date: form.get("date"), time: form.get("time"), location: form.get("location") }, editing ? "Session updated." : "Technique session scheduled.")) {
      formElement.reset(); setEditing(null);
    }
  }
  function editSession(session: TrainingSession) {
    setEditing(session); document.getElementById("session-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function signOut() { clearSession(); setUser(null); setSessions([]); setMembers([]); setTechniqueRequests([]); setNotice(""); }

  if (!checked) return <main className="section shell"><p>Checking sign-in…</p></main>;
  if (!user) return <main className="admin-login-shell"><section className="consent-modal auth-modal"><span className="eyebrow">Administrator access</span><h1 className="admin-login-title">Welcome back</h1><p className="auth-description">Sign in with the administrator email to review technique requests and manage the calendar.</p><form className="auth-form" onSubmit={submitSignIn}><label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="button auth-submit" disabled={busy}>{busy ? "Please wait…" : "Sign in"}</button></form><div className="auth-recovery"><button className="auth-text-button" disabled={busy} onClick={() => void recover()}>Forgot password?</button><button className="auth-text-button" disabled={busy} onClick={() => void recover(true)}>Resend verification email</button></div>{notice && <p className="auth-feedback" role="status">{notice}</p>}<p className="auth-switch"><a href="/">← Back to members site</a></p></section></main>;
  if (!user.isAdmin) return <main className="admin-access-denied shell"><span className="eyebrow">Tassisto Jiu Jitsu</span><h1>Admin access only</h1><p>Your account does not have administrator access.</p><button className="small-button" onClick={signOut}>Sign out</button><a className="button" href="/">Return to members site</a></main>;

  const pendingMembers = members.filter(member => member.status === "pending" && !member.deletedAt);
  const otherMembers = members.filter(member => member.status !== "pending" || member.deletedAt);
  return <div className="admin-console-page">
    <header className="admin-console-header shell"><a className="brand" href="/"><img src="/assets/tassisto-be-logo-transparent.png" alt="" /><span><b>Tassisto Jiu Jitsu</b><small>Administrator area</small></span></a><div className="admin-console-account"><span>{user.displayName}<small>{user.email}</small></span><button className="small-button" onClick={signOut}>Sign out</button></div></header>
    <main className="section shell admin">
      <div className="section-head"><span className="eyebrow">Administrator area</span><h1 className="admin-console-title">Training <em>& members</em></h1><p>Review technique requests, approve membership and schedule sessions. Each session occupies a 75-minute calendar slot.</p></div>
      {notice && <p className="notice admin-notice" role="status">{notice}</p>}

      <section className="admin-list technique-requests" aria-labelledby="technique-requests-heading">
        <h3 id="technique-requests-heading">Technique requests <span>{techniqueRequests.length} awaiting review</span></h3>
        {techniqueRequests.length === 0 ? <p className="muted">No technique requests are waiting for approval.</p> : techniqueRequests.map(request => <article className="published-session" key={request.id}>
          <div className="request-row"><div><b>{request.technique}</b><small>{request.displayName} · {request.email}<br />{dateInput(request.startsAt)} · {sessionTime(request.startsAt)} · {request.location}{request.details ? <><br />{request.details}</> : null}</small></div></div>
          <div className="admin-session-actions"><button disabled={busy} onClick={() => void update({ action: "review-technique-request", requestId: request.id, status: "approved" }, "Approved and added to the calendar; the member has a place.")}>Approve & schedule</button><button className="subtle" disabled={busy} onClick={() => void update({ action: "review-technique-request", requestId: request.id, status: "rejected" }, "Request declined; that time is available again.")}>Decline</button></div>
        </article>)}
      </section>

      <section className="admin-list admin-members" aria-labelledby="member-heading">
        <h3 id="member-heading">Member access requests <span>{pendingMembers.length}</span></h3>
        {pendingMembers.length === 0 ? <p className="muted">No pending member access requests.</p> : pendingMembers.map(member => <div className="request-row" key={member.userId}><div><b>{member.displayName}</b><small>{member.email}</small></div><div className="row-actions"><button disabled={busy} onClick={() => void update({ action: "member-status", userId: member.userId, status: "approved" }, "Member approved. They can request technique sessions.")}>Approve</button><button className="subtle" disabled={busy} onClick={() => void update({ action: "member-status", userId: member.userId, status: "rejected" }, "Request declined.")}>Decline</button></div></div>)}
        <h3 className="published-title">Members <span>{otherMembers.filter(member => member.status === "approved" && !member.deletedAt).length} approved</span></h3>
        {otherMembers.length === 0 ? <p className="muted">No other members yet.</p> : otherMembers.map(member => <div className="request-row" key={member.userId}><div><b>{member.displayName}</b><small>{member.email} · {member.deletedAt ? "Removed" : member.status}</small></div>{member.status === "approved" && !member.deletedAt ? <button className="subtle" disabled={busy} onClick={() => { if (window.confirm("Revoke this member's access and release their future reservations?")) void update({ action: "member-status", userId: member.userId, status: "rejected" }, "Member access revoked and future reservations released."); }}>Revoke access</button> : !member.deletedAt ? <button disabled={busy} onClick={() => void update({ action: "member-status", userId: member.userId, status: "approved" }, "Member approved.")}>Approve</button> : null}</div>)}
      </section>

      <div className="admin-grid">
        <form className="admin-form" id="session-editor" key={editing?.id ?? "new"} onSubmit={saveSession}>
          <h3>{editing ? "Edit scheduled technique session" : "Schedule a technique session"}</h3>
          <p className="muted">This reserves the time on the member calendar. Member requests that overlap this 75-minute slot will be rejected.</p>
          <label>Session title<input name="title" defaultValue={editing?.title ?? ""} placeholder="e.g. K-guard entries" required maxLength={90} /></label>
          <label>Focus<input name="focus" defaultValue={editing?.focus ?? "No-Gi Jiu-Jitsu"} required maxLength={120} /></label>
          <label>Date (DD/MM/YYYY)<input name="date" defaultValue={editing ? dateInput(editing.startsAt) : ""} inputMode="numeric" placeholder="DD/MM/YYYY" pattern="[0-9٠-٩۰-۹]{2}/[0-9٠-٩۰-۹]{2}/[0-9٠-٩۰-۹]{4}" required /></label>
          <label>Time in Morocco (24-hour)<input name="time" defaultValue={editing ? sessionTime(editing.startsAt) : "19:30"} inputMode="numeric" placeholder="HH:mm" pattern="[0-9٠-٩۰-۹]{2}:[0-9٠-٩۰-۹]{2}" required /></label>
          <label>Location<input name="location" defaultValue={editing?.location ?? "Taroudant"} required maxLength={160} /></label>
          <div className="modal-actions">{editing && <button type="button" className="outline-button" disabled={busy} onClick={() => setEditing(null)}>Cancel edit</button>}<button className="button" disabled={busy}>{editing ? "Save session" : "Schedule session"}</button></div>
        </form>

        <section className="admin-list" aria-labelledby="sessions-heading">
          <h3 id="sessions-heading">Scheduled sessions <span>{sessions.filter(session => !session.archivedAt).length}</span></h3>
          {sessions.length === 0 ? <p className="muted">No sessions are scheduled. Member requests appear above for your approval.</p> : sessions.map(session => <article className={"published-session" + (session.archivedAt ? " is-archived" : "")} key={session.id}>
            <div className="request-row"><div><b>{session.title}{session.archivedAt ? " · Removed" : ""}</b><small>{dateInput(session.startsAt)} · {sessionTime(session.startsAt)} · {session.location}<br />{session.booked} / 10 booked · {session.focus}</small></div></div>
            <div className="admin-session-actions">{!session.archivedAt && new Date(session.startsAt).getTime() > Date.now() && <button disabled={busy} onClick={() => editSession(session)}>Edit</button>}{!session.archivedAt && <button disabled={busy} onClick={() => void update({ action: "toggle-session", sessionId: session.id, isOpen: !session.isOpen }, session.isOpen ? "Bookings closed." : "Bookings reopened.")}>{session.isOpen ? "Close bookings" : "Reopen bookings"}</button>}{session.archivedAt ? <button disabled={busy} onClick={() => void update({ action: "restore-session", sessionId: session.id }, "Session restored.")}>Restore</button> : <button disabled={busy} onClick={() => { if (window.confirm("Remove this session from the calendar? Members will no longer be able to book it.")) void update({ action: "archive-session", sessionId: session.id }, "Session removed from the calendar."); }}>Remove session</button>}</div>
            <details className="attendance-details"><summary>Reservations & attendance · {session.roster.length}</summary>{session.roster.length === 0 ? <p className="muted">No reservations yet.</p> : session.roster.map(person => <div className="attendance-row" key={person.userId}><span>{person.displayName}</span>{sessionEndTime(session.startsAt).getTime() <= Date.now() ? <div className="attendance-actions">{(["on_time", "late", "absent"] as const).map(status => <button key={status} className={person.attendanceStatus === status ? "present" : "subtle"} disabled={busy || !!session.attendanceClosedAt} aria-pressed={person.attendanceStatus === status} onClick={() => void update({ action: "attendance", sessionId: session.id, userId: person.userId, status }, "Attendance saved.")}>{status === "on_time" ? "On time" : status === "late" ? "Late" : "Absent"}</button>)}</div> : <span className="muted">Reserved</span>}</div>)}{sessionEndTime(session.startsAt).getTime() <= Date.now() && (session.attendanceClosedAt ? <p className="muted">Attendance finalized.</p> : <button className="button" disabled={busy || session.roster.some(person => !person.attendanceStatus)} onClick={() => void update({ action: "close-attendance", sessionId: session.id }, "Attendance finalized. Scores have been updated.")}>Finalize attendance</button>)}</details>
          </article>)}
        </section>
      </div>
      <p className="admin-console-back"><a className="quiet-link" href="/">← Return to members site</a></p>
    </main>
  </div>;
}
