export const REAL_MS_PER_GAME_MINUTE = 1000;
export const GAME_MINUTES_PER_DAY = 24 * 60;
export const GAME_START_MINUTE = 8 * 60;

export type GamePhase = "dawn" | "day" | "dusk" | "night";
export type GameTime = {
  totalMinutes: number;
  minuteOfDay: number;
  day: number;
  hour: number;
  minute: number;
  phase: GamePhase;
};

export const GAME_PHASE_LABELS: Record<GamePhase, string> = {
  dawn: "清晨", day: "白天", dusk: "黄昏", night: "夜晚",
};

// Derive time from a persisted epoch, never from interval ticks: a suspended tab,
// refresh or time spent offline must not pause or accumulate clock drift.
export function getGameTime(timeOrigin: number, now = Date.now()): GameTime {
  const elapsed = Math.max(0, now - timeOrigin);
  const totalMinutes = GAME_START_MINUTE + elapsed / REAL_MS_PER_GAME_MINUTE;
  const minuteOfDay = totalMinutes % GAME_MINUTES_PER_DAY;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = Math.floor(minuteOfDay % 60);
  const phase: GamePhase = minuteOfDay < 300 || minuteOfDay >= 1140 ? "night"
    : minuteOfDay < 420 ? "dawn"
    : minuteOfDay < 1020 ? "day" : "dusk";
  return { totalMinutes, minuteOfDay, day: Math.floor(totalMinutes / GAME_MINUTES_PER_DAY) + 1, hour, minute, phase };
}

export function formatGameClock(time: Pick<GameTime, "hour" | "minute">): string {
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}
