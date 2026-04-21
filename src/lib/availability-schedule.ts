export type DaySchedule = {
  unavailable: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
};

// Index 0=Sunday, 1=Monday, ..., 6=Saturday (matches JS Date.getDay())
export type WeeklySchedule = [
  DaySchedule, DaySchedule, DaySchedule, DaySchedule,
  DaySchedule, DaySchedule, DaySchedule
];

export const DEFAULT_SCHEDULE: WeeklySchedule = [
  { unavailable: true,  start: "09:00", end: "16:30" }, // Sun
  { unavailable: false, start: "09:00", end: "16:30" }, // Mon
  { unavailable: false, start: "09:00", end: "16:30" }, // Tue
  { unavailable: false, start: "09:00", end: "16:30" }, // Wed
  { unavailable: false, start: "09:00", end: "16:30" }, // Thu
  { unavailable: false, start: "09:00", end: "16:30" }, // Fri
  { unavailable: true,  start: "09:00", end: "16:30" }, // Sat
];

// "09:30" → 9.5
export function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h + m / 60;
}
