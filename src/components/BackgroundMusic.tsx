import { useCallback, useEffect, useRef, useState } from "react";

const BGM_SOURCE = `${import.meta.env.BASE_URL}audio/bgm/main.mp3`;
const VOLUME_KEY = "you-and-me-bgm-volume";

function readVolume() {
  if (typeof window === "undefined") return .35;
  try {
    const value = window.localStorage.getItem(VOLUME_KEY);
    const saved = value === null ? NaN : Number(value);
    return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : .35;
  } catch { return .35; }
}

/**
 * Keep a stable, app-relative source for both local and Garden subpath hosting.
 * Browsers still require a first user gesture before audio may start.
 */
export default function BackgroundMusic() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const startedGesture = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(readVolume);
  const [missing, setMissing] = useState(false);

  const playMusic = useCallback(() => {
    const element = audio.current;
    if (!element) return;
    setMissing(false);
    void element.play().catch((error: unknown) => {
      if (audio.current !== element) return;
      // A cancelled play or blocked autoplay is not a missing music file.
      if (error instanceof DOMException && ["AbortError", "NotAllowedError"].includes(error.name)) return;
      setMissing(true);
    });
  }, []);

  useEffect(() => {
    const element = new Audio();
    element.loop = true;
    element.preload = "none";
    element.src = BGM_SOURCE;
    element.volume = volume;
    const onPlay = () => { setPlaying(true); setMissing(false); };
    const onPause = () => setPlaying(false);
    const onError = () => { setMissing(true); setPlaying(false); };
    element.addEventListener("playing", onPlay);
    element.addEventListener("pause", onPause);
    element.addEventListener("error", onError);
    audio.current = element;
    return () => {
      audio.current = null;
      element.removeEventListener("playing", onPlay);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("error", onError);
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, []);

  useEffect(() => {
    const element = audio.current;
    if (element) element.volume = muted ? 0 : volume;
    try { window.localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* Playback also works without browser storage. */ }
  }, [muted, volume]);

  useEffect(() => {
    const startAfterGesture = (event: Event) => {
      if (startedGesture.current || missing) return;
      // The explicit controls handle their own click; don't start on pointerdown
      // and immediately pause again when the same click reaches the play button.
      if (event.target instanceof Element && event.target.closest(".bgm-control")) return;
      startedGesture.current = true;
      playMusic();
      window.removeEventListener("pointerdown", startAfterGesture);
      window.removeEventListener("keydown", startAfterGesture);
    };
    window.addEventListener("pointerdown", startAfterGesture, { passive: true });
    window.addEventListener("keydown", startAfterGesture);
    return () => {
      window.removeEventListener("pointerdown", startAfterGesture);
      window.removeEventListener("keydown", startAfterGesture);
    };
  }, [missing, playMusic]);

  const togglePlayback = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) {
      startedGesture.current = true;
      playMusic();
    } else element.pause();
  };

  return (
    <div className="bgm-control" aria-label="背景音乐控制" title="Sunny Afternoon Together · 循环播放">
      <button type="button" className="bgm-play" onClick={togglePlayback} aria-label={playing ? "暂停背景音乐" : "播放背景音乐"}>
        <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
      </button>
      <div className="bgm-copy">
        <strong>背景音乐</strong>
        <span>{missing ? "音乐加载失败，点击重试" : playing ? "循环播放中" : "点击播放"}</span>
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
