import { describe, expect, it } from "vitest";
import { formatGameClock, getGameTime, REAL_MS_PER_GAME_MINUTE } from "./game-time";

const origin = 1_800_000_000_000;

describe("persistent game clock", () => {
  it("starts on day one at 08:00 and advances one minute each real second", () => {
    expect(getGameTime(origin, origin)).toEqual({ totalMinutes: 480, minuteOfDay: 480, day: 1, hour: 8, minute: 0, phase: "day" });
    expect(getGameTime(origin, origin + 1000)).toMatchObject({ totalMinutes: 481, hour: 8, minute: 1 });
    expect(getGameTime(origin, origin + 60_000)).toMatchObject({ hour: 9, minute: 0 });
  });
  it("completes a full day after exactly 24 real minutes", () => {
    expect(getGameTime(origin, origin + 24 * 60_000)).toMatchObject({ day: 2, hour: 8, minute: 0 });
    expect(getGameTime(origin, origin + 7 * 24 * 60_000)).toMatchObject({ day: 8, hour: 8, minute: 0 });
  });
  it("rolls the day at midnight and formats single digit hours and minutes", () => {
    const midnight = origin + 16 * 60_000;
    expect(getGameTime(origin, midnight - 1)).toMatchObject({ day: 1, hour: 23, minute: 59 });
    expect(getGameTime(origin, midnight)).toMatchObject({ day: 2, hour: 0, minute: 0 });
    expect(formatGameClock(getGameTime(origin, midnight))).toBe("00:00");
    expect(formatGameClock(getGameTime(origin, origin + 5000))).toBe("08:05");
  });
  it.each([
    [299.99, "night"], [300, "dawn"], [419.99, "dawn"], [420, "day"],
    [1019.99, "day"], [1020, "dusk"], [1139.99, "dusk"], [1140, "night"],
  ] as const)("classifies minute %s as %s at phase boundaries", (minuteOfDay, phase) => {
    expect(getGameTime(origin, origin + (1440 + minuteOfDay - 480) * REAL_MS_PER_GAME_MINUTE).phase).toBe(phase);
  });
  it("preserves sub-minute precision for continuous light transitions", () => {
    expect(getGameTime(origin, origin + 125).minuteOfDay).toBe(480.125);
    expect(getGameTime(origin, origin + 999)).toMatchObject({ hour: 8, minute: 0 });
  });
  it("resumes directly from the same persisted epoch after an offline interval", () => {
    const restoredOrigin = JSON.parse(JSON.stringify(origin)) as number;
    expect(getGameTime(restoredOrigin, origin + 30 * 60_000)).toMatchObject({ day: 2, hour: 14, minute: 0 });
  });
  it("does not create a negative day if the system clock moves before the epoch", () => {
    expect(getGameTime(origin, origin - 60_000)).toEqual(getGameTime(origin, origin));
  });
});
