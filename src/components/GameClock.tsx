import { useEffect, useState } from "react";
import { formatGameClock, GAME_PHASE_LABELS, getGameTime, type GamePhase } from "../lib/game-time";

import { requiredRoutine } from "../lib/pet-life";

function PhaseIcon({ phase }: { phase: GamePhase }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    {phase === "night" ? <path d="M19.8 15.1A8.6 8.6 0 0 1 8.9 4.2 8.6 8.6 0 1 0 19.8 15.1Z" />
      : phase === "day" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
        : <><path d="M3 16h18M6 13a6 6 0 0 1 12 0M12 2v3M3.5 5.5l2 2m15-2-2 2M6 20h12" />{phase === "dawn" ? <path d="m10 11 2-2 2 2" /> : <path d="m10 10 2 2 2-2" />}</>}
  </svg>;
}

export default function GameClock({ timeOrigin }: { timeOrigin: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 250);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", update); };
  }, [timeOrigin]);
  const time = getGameTime(timeOrigin, now);
  const clock = formatGameClock(time);
  const label = GAME_PHASE_LABELS[time.phase];
  return <div className={`game-clock is-${time.phase}`} role="timer" aria-label={`游戏时间，第 ${time.day} 天，${clock}，${label}。现实 1 秒等于游戏 1 分钟。`} title="现实 1 秒 = 游戏 1 分钟 · 上课 10–12 / 13:30–17 / 18–19 · 睡觉 23:30–7">
    <span className="game-clock-icon"><PhaseIcon phase={time.phase} /></span>
    <div className="game-clock-copy"><strong>{clock}</strong><span>第 {time.day} 天<span className="game-clock-phase"> · {label} · {requiredRoutine(time.minuteOfDay)==="sleep" ? "睡觉" : requiredRoutine(time.minuteOfDay)==="class" ? "上课" : "自由活动"}</span></span></div>
  </div>;
}
