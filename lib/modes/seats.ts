// One colour per seat, shared by every board so a player looks the same everywhere.
const SEAT_TEXT = [
  "text-sky-400",
  "text-rose-400",
  "text-emerald-400",
  "text-amber-400",
  "text-violet-400",
  "text-orange-400",
  "text-teal-400",
  "text-pink-400",
];

const SEAT_BORDER = [
  "border-l-sky-400",
  "border-l-rose-400",
  "border-l-emerald-400",
  "border-l-amber-400",
  "border-l-violet-400",
  "border-l-orange-400",
  "border-l-teal-400",
  "border-l-pink-400",
];

const SEAT_BG = [
  "bg-sky-500/15 border-sky-500/50",
  "bg-rose-500/15 border-rose-500/50",
  "bg-emerald-500/15 border-emerald-500/50",
  "bg-amber-500/15 border-amber-500/50",
  "bg-violet-500/15 border-violet-500/50",
  "bg-orange-500/15 border-orange-500/50",
  "bg-teal-500/15 border-teal-500/50",
  "bg-pink-500/15 border-pink-500/50",
];

/** Tinted background and border for something a player owns. */
export const seatFill = (seat: number) => SEAT_BG[seat % SEAT_BG.length];

export const seatText = (seat: number) => SEAT_TEXT[seat % SEAT_TEXT.length];
export const seatBorder = (seat: number) =>
  SEAT_BORDER[seat % SEAT_BORDER.length];

/** Time since the match started, as m:ss. */
export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
