import { describe, expect, it } from "vitest";
import { getDayNightState } from "./day-night-state";

describe("daily lighting", () => {
  it("turns warm lamps on at night and off during the day", () => {
    expect(getDayNightState(12 * 60).lamps).toBe(0);
    expect(getDayNightState(22 * 60).lamps).toBe(1);
    expect(getDayNightState(18 * 60).lamps).toBeGreaterThan(0);
    expect(getDayNightState(18 * 60).lamps).toBeLessThan(1);
    expect(getDayNightState(6 * 60).lamps).toBeLessThan(1);
    expect(getDayNightState(6 * 60).lamps).toBeGreaterThan(0);
  });
  it("changes daylight, sunset colors and shadows with time", () => {
    const noon = getDayNightState(720), dusk = getDayNightState(1080), night = getDayNightState(1320);
    expect(noon.sunIntensity).toBeGreaterThan(1);
    expect(night.sunIntensity).toBe(0);
    expect(noon.top).not.toBe(dusk.top);
    expect(dusk.top).not.toBe(night.top);
    expect(noon.ambientIntensity).toBeGreaterThan(night.ambientIntensity);
    expect(night.night).toBe(1);
  });
  it("is periodic and stays bounded through the full cycle", () => {
    expect(getDayNightState(0)).toEqual(getDayNightState(1440));
    for (let m = 0; m < 1440; m++) {
      const s = getDayNightState(m), next = getDayNightState(m + .01);
      for (const key of ["lamps", "daylight", "night"] as const) {
        expect(s[key]).toBeGreaterThanOrEqual(0); expect(s[key]).toBeLessThanOrEqual(1);
        expect(Math.abs(s[key] - next[key])).toBeLessThan(.001);
      }
    }
  });
});
