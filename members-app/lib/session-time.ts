export const SESSION_DURATION_MINUTES = 75;
export const SESSION_DURATION_MS = SESSION_DURATION_MINUTES * 60_000;

export function sessionEndTime(startsAt: string | Date): Date {
  return new Date(new Date(startsAt).getTime() + SESSION_DURATION_MS);
}
