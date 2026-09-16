import { Color, MathUtils } from "three";

// All keys meet continuously across midnight; lighting is never toggled abruptly.
const stops = [
  { hour: 0, top: "#111a38", horizon: "#344768", hill: "#182b3c", sun: "#a6bce9" },
  { hour: 5, top: "#253152", horizon: "#7e7190", hill: "#354c56", sun: "#dda6aa" },
  { hour: 6, top: "#8f99bd", horizon: "#ffd2a1", hill: "#809780", sun: "#ffbc83" },
  { hour: 8, top: "#79bfda", horizon: "#e7f4d8", hill: "#92bb87", sun: "#fff0cb" },
  { hour: 12, top: "#68bad9", horizon: "#d9f2e5", hill: "#83b484", sun: "#fff7e8" },
  { hour: 16.5, top: "#8bb9cf", horizon: "#f7e2af", hill: "#a0b67e", sun: "#ffe0a9" },
  { hour: 18, top: "#9b86ac", horizon: "#ffba86", hill: "#8d836c", sun: "#ffab69" },
  { hour: 19.5, top: "#303754", horizon: "#82677e", hill: "#334957", sun: "#b7bde4" },
  { hour: 21, top: "#172443", horizon: "#3e5674", hill: "#203549", sun: "#a6bce9" },
  { hour: 24, top: "#111a38", horizon: "#344768", hill: "#182b3c", sun: "#a6bce9" },
] as const;
const mix = (a: string, b: string, t: number) => new Color(a).lerp(new Color(b), t).getStyle();
export function getDayNightState(minuteOfDay: number) {
  const hour = ((minuteOfDay / 60) % 24 + 24) % 24;
  const index = stops.findIndex((stop, i) => i > 0 && stop.hour >= hour);
  const a = stops[index - 1], b = stops[index];
  const t = MathUtils.smoothstep(hour, a.hour, b.hour);
  const daylight = MathUtils.smoothstep(hour, 5, 8) * (1 - MathUtils.smoothstep(hour, 17, 20));
  const lamps = 1 - MathUtils.smoothstep(hour, 5.5, 7) * (1 - MathUtils.smoothstep(hour, 17.5, 19));
  const night = 1 - MathUtils.smoothstep(hour, 4.8, 6.2) * (1 - MathUtils.smoothstep(hour, 18.3, 20));
  const solarAngle = (hour - 6) / 12 * Math.PI;
  return {
    hour, daylight, lamps, night, solarAngle,
    top: mix(a.top, b.top, t), horizon: mix(a.horizon, b.horizon, t), hill: mix(a.hill, b.hill, t), sunColor: mix(a.sun, b.sun, t),
    sunIntensity: Math.max(0, Math.sin(solarAngle)) * 1.7,
    ambientIntensity: .13 + .65 * daylight,
    hemisphereIntensity: .24 + .66 * daylight,
  };
}
export type DayNightState = ReturnType<typeof getDayNightState>;
