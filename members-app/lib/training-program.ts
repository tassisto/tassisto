import { parseMoroccoLocalDateTime } from "./morocco-datetime";

// Organizer-requested first daily No-Gi series. Times are Africa/Casablanca.
export const dailyTrainingProgram = [
  "Sitting guard / leg entries / wrestle up",
  "Supine guard / off balance",
  "Guard retention / mount, back, side control and kipping escapes",
  "Guard passing",
  "Upper body attacks",
  "Lower body attacks",
  "K-guard",
  "De la Riva",
  "Reverse de la Riva",
  "Octopus guard",
  "Back attacks",
].map((focus, index) => {
  const day = new Date(Date.UTC(2026, 9, 30 + index));
  const date = [String(day.getUTCDate()).padStart(2, "0"), String(day.getUTCMonth()+1).padStart(2, "0"), day.getUTCFullYear()].join("/");
  const startsAt = parseMoroccoLocalDateTime(date, "19:30");
  if (!startsAt) throw new Error("Invalid daily training date");
  return { title: "No-Gi · " + focus, focus, startsAt: startsAt.toISOString(), location: "Taroudant", capacity: 10 };
});
