import { useEffect, useRef, useState } from "react";

const BGM_SOURCE = "/audio/bgm/main.mp3";
const VOLUME_KEY = "you-and-me-bgm-volume";

function readVolume() {
  if (typeof window === "undefined") return .35;
  const saved = Number(window.localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : .35;
}

/**
 * BGM shell: the source is intentionally a stable public path so a music file
 * can be dropped in later without touching the room or save-data code.
 * Browsers still require a first user gesture before audio may start.
 */
export default function BackgroundMusic() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const startedGesture = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(readVolume);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const element = new Audio();
    element.loop = true;
    element.preload = "none";
    element.src = BGM_SOURCE;
    element.volume = volume;
    element.addEventListener("play", () => setPlaying(true));
    element.addEventListener("pause", () => setPlaying(false));
    element.addEventListener("error", () => { setMissing(true); setPlaying(false); });
    audio.current = element;
    return () => { element.pause(); element.src = ""; audio.current = null; };
  }, []);

  useEffect(() => {
    const element = audio.current;
    if (element) element.volume = muted ? 0 : volume;
    window.localStorage.setItem(VOLUME_KEY, String(volume));
  }, [muted, volume]);

  useEffect(() => {
    const startAfterGesture = () => {
      if (startedGesture.current || missing) return;
      startedGesture.current = true;
      void audio.current?.play().catch(() => { /* autoplay remains blocked until the control is pressed */ });
    };
    window.addEventListener("pointerdown", startAfterGesture, { once: true, passive: true });
    window.addEventListener("keydown", startAfterGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", startAfterGesture);
      window.removeEventListener("keydown", startAfterGesture);
    };
  }, [missing]);

  const togglePlayback = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) {
      startedGesture.current = true;
      void element.play().catch(() => setMissing(true));
    } else element.pause();
  };

  return (
    <div className="bgm-control" aria-label="背景音乐控制">
      <button type="button" className="bgm-play" onClick={togglePlayback} aria-label={playing ? "暂停背景音乐" : "播放背景音乐"}>
        <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
      </button>
      <div className="bgm-copy">
        <strong>背景音乐</strong>
        <span>{missing ? "请放入 main.mp3" : playing ? "正在播放" : "等待播放"}</span>
      </div>
      <button type="button" className="bgm-mute" onClick={() => setMuted(value => !value)} aria-label={muted ? "取消静音" : "静音背景音乐"}>
        <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
      </button>
      <label className="bgm-volume">
        <span className="sr-only">背景音乐音量</span>
        <input type="range" min="0" max="1" step=".01" value={volume} onChange={event => setVolume(Number(event.target.value))} aria-label="背景音乐音量" />
      </label>
    </div>
  );
}
