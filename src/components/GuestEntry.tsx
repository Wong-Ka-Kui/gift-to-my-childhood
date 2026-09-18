import { useEffect, useRef } from "react";
import { createGuest, type LocalHome } from "../lib/pet-storage";
import { isRemoteStorageEnabled, remoteCreateGuest } from "../lib/remote-storage";

export default function GuestEntry({ onEnter }: { onEnter: (home: LocalHome) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    const receive = async (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || event.data?.type !== "guest:enter" || busy.current) return;
      if (typeof event.data.name !== "string" || typeof event.data.avatar !== "string") return;
      busy.current = true;
      try {
        const home = await (isRemoteStorageEnabled() ? remoteCreateGuest(event.data.name, event.data.avatar) : createGuest(event.data.name, event.data.avatar));
        if (active) onEnter(home);
      } catch {
        if (active) frame.current?.contentWindow?.postMessage({ type: "guest:error", message: "未能保存登录信息，请稍后重试。" }, location.origin);
      } finally {
        busy.current = false;
      }
    };
    window.addEventListener("message", receive);
    return () => { active = false; window.removeEventListener("message", receive); };
  }, [onEnter]);
  return <iframe ref={frame} className="guest-entry-frame" title="输入名字，生成你的形象" src={`${import.meta.env.BASE_URL}hand-drawn-character/index.html?mode=guest`} />;
}
