"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "./firebase-client";

type Language = "en" | "fr" | "ar";
type MemberStatus = "pending" | "approved" | "rejected" | "deleted" | null;
type TrainingSession = { id: number; title: string; focus: string; startsAt: string; location: string; capacity: number; booked: number; spotsLeft: number; isOpen: boolean; isBooked: boolean };
type PendingSlot = { startsAt: string };
type TechniqueRequest = { id: number; technique: string; details: string | null; startsAt: string; location: string; status: string; sessionId: number | null };
type CalendarData = { sessions?: TrainingSession[]; pendingSlots?: PendingSlot[]; requests?: TechniqueRequest[]; error?: string };

const techniques = [
  "Sitting & supine guard", "Leg entries & wrestle-ups", "Off-balancing", "Guard retention & escapes",
  "Guard passing", "Upper body attacks", "Lower body attacks", "K-guard",
  "De la Riva / reverse De la Riva", "Octopus guard", "Back attacks", "Other technique",
];

const copy = {
  en: {
    calendar: "Technique calendar", choose: "Choose a date to request a 75-minute session. Scheduled sessions and pending requests reserve their time.",
    previous: "Previous month", next: "Next month", today: "Today", schedule: "Scheduled", pending: "Pending request",
    requestTitle: "Request a technique session", requestText: "Choose what you want to work on and a preferred start time in Morocco. Your request is not booked until the admin approves it.",
    selectDay: "Select a future date on the calendar to request a session.", signIn: "Sign in to request a session.", memberApproval: "Your member access must be approved before you can request a session.",
    technique: "Technique", chooseTechnique: "Choose a technique", details: "Anything to focus on? (optional)", otherDetails: "Describe the technique you want to work on", date: "Date", time: "Preferred time (Morocco)", location: "Location", locationHint: "Taroudant",
    send: "Send request to admin", sending: "Sending…", pendingTitle: "Your pending requests", awaiting: "Awaiting admin approval", cancel: "Cancel request", cancelSuccess: "Request cancelled. That time is available again.",
    requestSuccess: "Request sent. The admin will review the technique and time before it is added to the calendar.", requestError: "Could not send the request.", scheduledDetail: "This time is reserved on the calendar.", book: "Reserve a place", cancelBooking: "Cancel my place", booked: "Your place is reserved.", requestAnother: "Request another time on this date", full: "No places left", closed: "Bookings are closed", spots: "places left", noSessions: "No sessions are currently scheduled.", otherBusy: "This time is already reserved or awaiting approval.",
    pendingForDay: "Pending requests reserve their time until the admin reviews them.", statusApproved: "Approved and scheduled", statusRejected: "Declined", statusCancelled: "Cancelled", statusPending: "Awaiting approval",
  },
  fr: {
    calendar: "Calendrier technique", choose: "Choisis une date pour demander une séance de 75 minutes. Les séances prévues et les demandes en attente réservent leur créneau.",
    previous: "Mois précédent", next: "Mois suivant", today: "Aujourd’hui", schedule: "Prévu", pending: "Demande en attente",
    requestTitle: "Demander une séance technique", requestText: "Choisis le sujet et l’heure souhaitée, heure du Maroc. La séance n’est planifiée qu’après validation de l’administrateur.",
    selectDay: "Choisis une date future dans le calendrier pour demander une séance.", signIn: "Connecte-toi pour demander une séance.", memberApproval: "L’accès membre doit être approuvé avant de demander une séance.",
    technique: "Technique", chooseTechnique: "Choisis une technique", details: "Un point particulier à travailler ? (facultatif)", otherDetails: "Décris la technique à travailler", date: "Date", time: "Heure souhaitée (Maroc)", location: "Lieu", locationHint: "Taroudant",
    send: "Envoyer la demande à l’administrateur", sending: "Envoi…", pendingTitle: "Tes demandes en attente", awaiting: "En attente de validation", cancel: "Annuler la demande", cancelSuccess: "Demande annulée. Le créneau est de nouveau disponible.",
    requestSuccess: "Demande envoyée. L’administrateur vérifiera le sujet et l’heure avant d’ajouter la séance au calendrier.", requestError: "Impossible d’envoyer la demande.", scheduledDetail: "Ce créneau est réservé dans le calendrier.", book: "Réserver une place", cancelBooking: "Annuler ma place", booked: "Ta place est réservée.", requestAnother: "Demander une autre heure ce jour-là", full: "Complet", closed: "Inscriptions fermées", spots: "places restantes", noSessions: "Aucune séance n’est prévue pour le moment.", otherBusy: "Ce créneau est déjà réservé ou en attente de validation.",
    pendingForDay: "Les demandes en attente réservent leur créneau jusqu’à leur examen par l’administrateur.", statusApproved: "Approuvée et planifiée", statusRejected: "Refusée", statusCancelled: "Annulée", statusPending: "En attente de validation",
  },
  ar: {
    calendar: "تقويم التقنيات", choose: "اختر تاريخًا لطلب حصة مدتها 75 دقيقة. الحصص المجدولة والطلبات المعلّقة تحجز وقتها.",
    previous: "الشهر السابق", next: "الشهر التالي", today: "اليوم", schedule: "مجدولة", pending: "طلب معلّق",
    requestTitle: "اطلب حصة تقنية", requestText: "اختر التقنية والوقت المفضّل بتوقيت المغرب. لن تُضاف الحصة إلى التقويم حتى يوافق المسؤول.",
    selectDay: "اختر تاريخًا مستقبليًا من التقويم لطلب حصة.", signIn: "سجّل الدخول لطلب حصة.", memberApproval: "يجب الموافقة على عضويتك قبل طلب حصة.",
    technique: "التقنية", chooseTechnique: "اختر تقنية", details: "ما الذي تريد التركيز عليه؟ (اختياري)", otherDetails: "صف التقنية التي تريد العمل عليها", date: "التاريخ", time: "الوقت المفضّل (المغرب)", location: "المكان", locationHint: "تارودانت",
    send: "أرسل الطلب إلى المسؤول", sending: "جارٍ الإرسال…", pendingTitle: "طلباتك المعلّقة", awaiting: "بانتظار موافقة المسؤول", cancel: "إلغاء الطلب", cancelSuccess: "أُلغي الطلب وأصبح الوقت متاحًا.",
    requestSuccess: "أُرسل الطلب. سيراجع المسؤول التقنية والوقت قبل إضافتهما إلى التقويم.", requestError: "تعذّر إرسال الطلب.", scheduledDetail: "هذا الوقت محجوز في التقويم.", book: "احجز مكانًا", cancelBooking: "ألغِ مكاني", booked: "مكانك محجوز.", requestAnother: "اطلب وقتًا آخر في هذا التاريخ", full: "لا توجد أماكن متبقية", closed: "الحجز مغلق", spots: "أماكن متبقية", noSessions: "لا توجد حصص مجدولة حاليًا.", otherBusy: "هذا الوقت محجوز بالفعل أو بانتظار الموافقة.",
    pendingForDay: "تحجز الطلبات المعلّقة وقتها إلى أن يراجعها المسؤول.", statusApproved: "تمت الموافقة والجدولة", statusRejected: "مرفوض", statusCancelled: "ملغى", statusPending: "بانتظار الموافقة",
  },
};

function moroccoParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "00";
  return { year: Number(part("year")), month: Number(part("month")) - 1, day: Number(part("day")), key: `${part("year")}-${part("month")}-${part("day")}` };
}
function keyFor(value: string) { return moroccoParts(new Date(value)).key; }
function dateForInput(key: string) { const [year, month, day] = key.split("-"); return `${day}/${month}/${year}`; }
function timeFor(value: string, locale: string) { return new Intl.DateTimeFormat(locale, { timeZone: "Africa/Casablanca", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)); }
function dateFor(value: string, locale: string) { return new Intl.DateTimeFormat(locale, { timeZone: "Africa/Casablanca", dateStyle: "full" }).format(new Date(value)); }

export function TechniqueCalendar({ language, isSignedIn, memberStatus, isAdmin, onSignIn }: { language: Language; isSignedIn: boolean; memberStatus: MemberStatus; isAdmin: boolean; onSignIn: () => void }) {
  const t = copy[language];
  const locale = language === "fr" ? "fr-FR" : language === "ar" ? "ar-MA" : "en-GB";
  const today = moroccoParts(new Date());
  const [month, setMonth] = useState(() => new Date(Date.UTC(today.year, today.month, 1, 12)));
  const [selectedDay, setSelectedDay] = useState(today.key);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [pendingSlots, setPendingSlots] = useState<PendingSlot[]>([]);
  const [requests, setRequests] = useState<TechniqueRequest[]>([]);
  const [technique, setTechnique] = useState("");
  const [details, setDetails] = useState("");
  const [time, setTime] = useState("19:30");
  const [location, setLocation] = useState("Taroudant");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await authFetch("/api/sessions", { cache: "no-store" });
    const data = await response.json() as CalendarData;
    if (!response.ok) throw new Error(data.error ?? "Could not load the calendar.");
    setSessions(data.sessions ?? []); setPendingSlots(data.pendingSlots ?? []); setRequests(data.requests ?? []);
  }, []);
  useEffect(() => { void load().catch(error => setNotice(error.message)); const timer = window.setInterval(() => void load().catch(() => undefined), 60_000); return () => window.clearInterval(timer); }, [isSignedIn, load, memberStatus]);

  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 12));
  const leading = (first.getUTCDay() + 6) % 7;
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), index - leading + 1, 12))), [leading, month]);
  const sessionsByDay = useMemo(() => {
    const map = new Map<string, TrainingSession[]>();
    for (const session of sessions) { const key = keyFor(session.startsAt); map.set(key, [...(map.get(key) ?? []), session]); }
    return map;
  }, [sessions]);
  const pendingByDay = useMemo(() => {
    const map = new Map<string, PendingSlot[]>();
    for (const slot of pendingSlots) { const key = keyFor(slot.startsAt); map.set(key, [...(map.get(key) ?? []), slot]); }
    return map;
  }, [pendingSlots]);
  const selectedSession = sessions.find(session => session.id === selectedSessionId && keyFor(session.startsAt) === selectedDay);
  const requestsByDay = requests.filter(request => request.status === "pending" && keyFor(request.startsAt) === selectedDay);
  const selectedDate = new Date(`${selectedDay}T12:00:00Z`);
  const isFutureDay = selectedDay >= today.key;

  async function requestSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await authFetch("/api/technique-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ technique, details: form.get("details"), date: dateForInput(selectedDay), time, location: form.get("location") }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? t.requestError);
      setNotice(t.requestSuccess); setTechnique(""); setDetails(""); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : t.requestError); }
    finally { setBusy(false); }
  }
  async function cancelRequest(id: number) {
    setBusy(true); setNotice("");
    try {
      const response = await authFetch("/api/technique-requests", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? t.requestError);
      setNotice(t.cancelSuccess); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : t.requestError); }
    finally { setBusy(false); }
  }
  async function booking(sessionId: number, cancel = false) {
    setBusy(true); setNotice("");
    try {
      const response = await authFetch("/api/bookings", { method: cancel ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? t.requestError);
      setNotice(cancel ? t.cancelBooking : t.booked); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : t.requestError); }
    finally { setBusy(false); }
  }

  const weekdayNames = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + index, 12))));
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(month);
  return <section className="technique-calendar" id="sessions" aria-label={t.calendar}>
    <div className="technique-calendar-heading"><div><span className="pill">{t.calendar}</span><p>{t.choose}</p></div><div className="calendar-controls"><button type="button" className="outline-button" aria-label={t.previous} onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1, 12)))}>‹</button><h3>{monthLabel}</h3><button type="button" className="outline-button" aria-label={t.next} onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1, 12)))}>›</button><button type="button" className="outline-button today-button" onClick={() => { setMonth(new Date(Date.UTC(today.year, today.month, 1, 12))); setSelectedDay(today.key); setSelectedSessionId(null); }}>{t.today}</button></div></div>
    <div className="calendar-grid technique-calendar-grid">{weekdayNames.map((day, index) => <div className="weekday" key={`${day}-${index}`}>{day}</div>)}{days.map((day, index) => {
      const year = day.getUTCFullYear(), monthIndex = day.getUTCMonth(), dayNum = day.getUTCDate();
      const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const events = sessionsByDay.get(key) ?? [];
      const pending = pendingByDay.get(key) ?? [];
      const inMonth = monthIndex === month.getUTCMonth();
      return <button type="button" className={`calendar-day technique-calendar-day${inMonth ? "" : " outside"}${key === today.key ? " is-today" : ""}${key === selectedDay ? " selected-day" : ""}`} key={`${key}-${index}`} disabled={key < today.key} onClick={() => { setSelectedDay(key); setSelectedSessionId(sessionsByDay.get(key)?.[0]?.id ?? null); setNotice(""); }}>
        <span className="day-number">{new Intl.NumberFormat(locale, { useGrouping: false }).format(dayNum)}</span>
        {events.slice(0, 1).map(session => <span className="calendar-event" key={session.id}><span>{session.title}</span><small>{timeFor(session.startsAt, locale)}</small></span>)}
        {pending.slice(0, 1).map((slot, slotIndex) => <span className="calendar-pending" key={`${slot.startsAt}-${slotIndex}`}>{t.pending}<small>{timeFor(slot.startsAt, locale)}</small></span>)}
        {events.length + pending.length > 1 && <span className="more-events">+{events.length + pending.length - 1}</span>}
      </button>;
    })}</div>
    <div className="technique-day-panel">
      <div className="technique-day-heading"><div><span className="eyebrow">{new Intl.DateTimeFormat(locale, { timeZone: "Africa/Casablanca", dateStyle: "full" }).format(selectedDate)}</span><h3>{selectedSession ? selectedSession.title : t.requestTitle}</h3></div></div>
      {selectedSession ? <div className="technique-session-detail"><p>{selectedSession.focus}</p><p>{dateFor(selectedSession.startsAt, locale)} · {timeFor(selectedSession.startsAt, locale)} · {selectedSession.location}</p><p>{selectedSession.spotsLeft} {t.spots} / {selectedSession.capacity}</p>{!isSignedIn ? <button className="button" onClick={onSignIn}>{t.signIn}</button> : selectedSession.isBooked ? <button className="outline-button" disabled={busy} onClick={() => void booking(selectedSession.id, true)}>{t.cancelBooking}</button> : memberStatus === "approved" || isAdmin ? <button className="button" disabled={busy || !selectedSession.isOpen || selectedSession.spotsLeft < 1} onClick={() => void booking(selectedSession.id)}>{selectedSession.spotsLeft < 1 ? t.full : selectedSession.isOpen ? t.book : t.closed}</button> : <p>{t.memberApproval}</p>}<button type="button" className="outline-button" onClick={() => setSelectedSessionId(null)}>{t.requestAnother}</button></div> : <>
        <p className="technique-request-intro">{t.requestText}</p>
        {!isFutureDay ? <p className="muted">{t.selectDay}</p> : !isSignedIn ? <button className="button" onClick={onSignIn}>{t.signIn}</button> : memberStatus !== "approved" && !isAdmin ? <p className="muted">{t.memberApproval}</p> : <form className="technique-request-form" onSubmit={requestSession}>
          <label>{t.technique}<select value={technique} onChange={event => setTechnique(event.target.value)} required><option value="">{t.chooseTechnique}</option>{techniques.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>{technique === "Other technique" ? t.otherDetails : t.details}<textarea name="details" value={details} onChange={event => setDetails(event.target.value)} rows={2} maxLength={500} required={technique === "Other technique"} /></label>
          <div className="technique-request-fields"><label>{t.date}<input type="date" value={selectedDay} min={today.key} onChange={event => { if (event.target.value) { setSelectedDay(event.target.value); setSelectedSessionId(null); } }} required /></label><label>{t.time}<input type="time" value={time} onChange={event => setTime(event.target.value)} required /></label></div>
          <label>{t.location}<input name="location" value={location} onChange={event => setLocation(event.target.value)} placeholder={t.locationHint} maxLength={160} required /></label>
          <button className="button" disabled={busy || !technique}>{busy ? t.sending : t.send}</button>
        </form>}
        {requestsByDay.length > 0 && <div className="pending-requests"><h4>{t.pendingTitle}</h4>{requestsByDay.map(request => <div className="pending-request-row" key={request.id}><span><b>{request.technique}</b><small>{timeFor(request.startsAt, locale)} · {request.location} · {t.awaiting}</small></span><button type="button" className="outline-button" disabled={busy} onClick={() => void cancelRequest(request.id)}>{t.cancel}</button></div>)}</div>}
        {(pendingByDay.get(selectedDay)?.length ?? 0) > 0 && <p className="calendar-hint">{t.pendingForDay}</p>}
      </>}
    </div>
    {notice && <p className="notice" role="status">{notice}</p>}
  </section>;
}
