import { useMemo, useState } from "react";
import type { PetRecord } from "../lib/pets";

type DiaryEntry = { id: string; date: string; pet: PetRecord; behavior: string; note: string; time: string };
const BEHAVIORS = [["午睡", "在窗边晒了一会儿太阳，睡得很香。"], ["探索", "绕着房间巡视，发现了一个新角落。"], ["玩耍", "和伙伴追着小玩具跑了好几圈。"], ["放松", "趴在软垫上安静地陪着你。"], ["吃饭", "准时享用今日的小点心。"]] as const;
function dateKey(year: number, month: number, day: number) { return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function monthLabel(year: number, month: number) { return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(new Date(year, month, 1)); }

export default function BehaviorDiary({ pets, onClose }: { pets: readonly PetRecord[]; onClose: () => void }) {
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDate, setSelectedDate] = useState(dateKey(today.getFullYear(), today.getMonth(), today.getDate()));
  const entries = useMemo(() => {
    const result: DiaryEntry[] = [];
    const count = new Date(view.year, view.month + 1, 0).getDate();
    for (let day = 1; day <= count; day += 1) pets.forEach((pet, index) => {
      if ((day + index * 3 + view.month) % 5 !== 0) return;
      const [behavior, note] = BEHAVIORS[(day + index + view.month) % BEHAVIORS.length];
      result.push({ id: `${pet.id}-${dateKey(view.year, view.month, day)}`, date: dateKey(view.year, view.month, day), pet, behavior, note, time: `${9 + ((day + index) % 9)}:${index % 2 ? "20" : "05"}` });
    });
    return result;
  }, [pets, view]);
  const entriesByDate = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>();
    entries.forEach((entry) => map.set(entry.date, [...(map.get(entry.date) ?? []), entry]));
    return map;
  }, [entries]);
  const monthStart = new Date(view.year, view.month, 1).getDay();
  const monthDays = new Date(view.year, view.month + 1, 0).getDate();
  const selectedEntries = entriesByDate.get(selectedDate) ?? [];
  const moveMonth = (delta: number) => { const next = new Date(view.year, view.month + delta, 1); setView({ year: next.getFullYear(), month: next.getMonth() }); setSelectedDate(dateKey(next.getFullYear(), next.getMonth(), 1)); };
  return <aside className="diary-drawer" aria-label="宠物行为日记">
    <div className="diary-header"><div><span className="diary-eyebrow">PET MEMORIES</span><h2>宠物行为日记</h2><p>记录每一个值得收藏的瞬间</p></div><button className="diary-close" type="button" onClick={onClose} aria-label="关闭行为日记">×</button></div>
    <div className="diary-month-nav"><button type="button" onClick={() => moveMonth(-1)} aria-label="上个月">‹</button><strong>{monthLabel(view.year, view.month)}</strong><button type="button" onClick={() => moveMonth(1)} aria-label="下个月">›</button></div>
    <div className="diary-weekdays">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="diary-calendar">{Array.from({ length: monthStart }, (_, index) => <span key={`empty-${index}`} className="diary-day is-empty" />)}{Array.from({ length: monthDays }, (_, index) => { const day = index + 1; const key = dateKey(view.year, view.month, day); const hasEntries = entriesByDate.has(key); return <button key={key} type="button" className={`diary-day${selectedDate === key ? " is-selected" : ""}${hasEntries ? " has-memory" : ""}`} onClick={() => setSelectedDate(key)}><span>{day}</span>{hasEntries ? <i aria-label="有行为记录" /> : null}</button>; })}</div>
    <div className="diary-memory-heading"><span>{selectedEntries.length ? `${selectedEntries.length} 条行为记录` : "这一天还没有记录"}</span><small>{selectedDate.replaceAll("-", ".")}</small></div>
    <div className="diary-memories">{selectedEntries.length ? selectedEntries.map((entry) => <article className="diary-memory" key={entry.id}><div className="diary-snapshot">{entry.pet.portrait ? <img src={entry.pet.portrait} alt={`${entry.pet.profile.name}的行为截图`} /> : <span>{entry.pet.profile.name.slice(0, 1)}</span>}<b>{entry.time}</b></div><div className="diary-memory-copy"><strong>{entry.pet.profile.name} · {entry.behavior}</strong><p>{entry.note}</p></div></article>) : <div className="diary-empty"><span aria-hidden="true">☼</span><p>等下一次小小的奇遇<br />它会被记录在这里</p></div>}</div>
  </aside>;
}
