import { useCallback, useEffect, useRef, useState } from "react";
import Room from "./components/Room";
import GuestEntry from "./components/GuestEntry";
import type { FurnitureLayout } from "./lib/furniture-layout";
import type { GuestProfile } from "./lib/guest";
import PetProfileCard from "./components/PetProfileCard";
import { validateFiles, type ModelAsset } from "./lib/assets";
import { MAX_PETS, type PetRecord } from "./lib/pets";
import { createHomeCare, type HomeCare, type CareTick } from "./lib/home-items";
import { loadLocalHome, logoutLocal, savePet, saveFurnitureLayout, savePetPortrait, updateHomeCare, type LocalHome } from "./lib/pet-storage";
import { isRemoteStorageEnabled, remoteLoadHome, remoteLogout, remoteSaveFurnitureLayout, remoteSavePet, remoteSavePortrait, remoteUpdateHomeCare } from "./lib/remote-storage";
import BehaviorDiary from "./components/BehaviorDiary";
import GameClock from "./components/GameClock";
import BackgroundMusic from "./components/BackgroundMusic";

export default function App() {
  const [initialLayout, setInitialLayout] = useState<FurnitureLayout>({});
  const [focusArea, setFocusArea] = useState<"all" | "bedroom" | "classroom">("all");
  const [viewReset, setViewReset] = useState(0);
  const [editingFurniture, setEditingFurniture] = useState(false);
  const editingFurnitureRef = useRef(false);
  const guestId = useRef<string | null>(null);
  const onFurnitureEditing = useCallback((active: boolean) => {
    editingFurnitureRef.current = active;
    setEditingFurniture(active);
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const [pets, setPets] = useState<PetRecord[]>([]);
  const [error, setError] = useState("");
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [care, setCare] = useState<HomeCare>(createHomeCare);
  const [timeOrigin, setTimeOrigin] = useState(Date.now);
  const [rewardMessage, setRewardMessage] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const profileButton = useRef<HTMLButtonElement>(null);
  const profileMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!profileMenuOpen) return;
    profileMenu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !profileMenu.current?.contains(event.target) && !profileButton.current?.contains(event.target)) setProfileMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setProfileMenuOpen(false); profileButton.current?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [profileMenuOpen]);
  const rewardTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(rewardTimer.current), []);
  const receiveCare = useCallback((next: HomeCare) => {
    setCare((previous) => ({ ...next, items: previous.items.length === next.items.length && previous.items.every((item, i) => item.id === next.items[i].id) ? previous.items : next.items }));
  }, []);
  const onCareTick = useCallback((tick: CareTick) => {
    const owner = guestId.current;
    if (!owner) return;
    const operation = isRemoteStorageEnabled() ? remoteUpdateHomeCare({ tick }) : updateHomeCare(owner, { tick });
    void operation.then(({ care: next }) => { if (guestId.current === owner) receiveCare(next); }).catch(() => { if (guestId.current === owner) setError("活动进度暂未保存，请稍后重试。"); });
  }, [receiveCare]);
  const onClean = useCallback(async (id: string) => {
    const owner = guestId.current;
    if (!owner) return;
    try {
      const result = await (isRemoteStorageEnabled() ? remoteUpdateHomeCare({ cleanId: id }) : updateHomeCare(owner, { cleanId: id }));
      if (guestId.current !== owner) return;
      receiveCare(result.care);
      setRewardMessage(result.reward ? "打扫干净啦！+5 金币" : "这件物品已经清扫过啦");
      clearTimeout(rewardTimer.current);
      rewardTimer.current = setTimeout(() => setRewardMessage(""), 2000);
    } catch { if (guestId.current === owner) setError("清扫未能保存，物品和金币未变动，请重试。"); }
  }, [receiveCare]);
  const onPortrait = useCallback((id: string, portrait: string) => {
    setPets((previous) => previous.map((pet) => pet.id === id ? { ...pet, portrait } : pet));
    if (guestId.current) void (isRemoteStorageEnabled() ? remoteSavePortrait(id, portrait) : savePetPortrait(id, portrait, guestId.current)).catch(() => { /* Regenerate on next load if the thumbnail could not be saved. */ });
  }, []);
  const [pendingAsset, setPendingAsset] = useState<ModelAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const pendingPets = useRef(new Set<string>());
  const [restoring, setRestoring] = useState(true);
  const importBusy = useRef(false);
  const onFurnitureLayout = useCallback((layout: FurnitureLayout) => {
    const owner = guestId.current;
    if (owner) void (isRemoteStorageEnabled() ? remoteSaveFurnitureLayout(layout) : saveFurnitureLayout(layout, owner)).catch(() => { if (guestId.current === owner) setError("家具位置暂未保存，刷新后会回到上一次存档。请稍后重试。"); });
  }, []);
  const onReady = useCallback((id: string) => {
    pendingPets.current.delete(id);
    if (!pendingPets.current.size) { importBusy.current = false; setLoading(false); }
  }, []);
  const enterHome = useCallback((home: LocalHome) => {
    pendingPets.current = new Set(home.pets.map((pet) => pet.id));
    importBusy.current = home.pets.length > 0;
    setLoading(home.pets.length > 0);
    setPets(home.pets);
    setCare(home.care);
    setTimeOrigin(home.timeOrigin);
    guestId.current = home.guest?.id ?? null;
    setInitialLayout(home.furniture);
    setGuest(home.guest);
  }, []);
  const onError = useCallback((message: string) => {
    setLoading(false);
    setError(message);
  }, []);
  const onPetError = useCallback((id: string, message: string) => {
    setPets((current) => current.filter((pet) => pet.id !== id));
    onReady(id);
    setError(`${message} 已保存的资料仍会保留，可刷新重试。`);
  }, [onReady]);
  const full = pets.length >= MAX_PETS;
  const selectedPet = pets.find((pet) => pet.id === selectedPetId);
  const logout = useCallback(async () => {
    if (importBusy.current || pendingAsset || editingFurnitureRef.current || loggingOut) return;
    const owner = guestId.current;
    guestId.current = null;
    setLoggingOut(true);
    try {
      if (isRemoteStorageEnabled()) await remoteLogout(); else await logoutLocal();
      setProfileMenuOpen(false);
      setGuest(null);
      setPets([]);
      setSelectedPetId(null);
      setInitialLayout({});
      setCare(createHomeCare());
      setPendingAsset(null);
      setDiaryOpen(false);
      setFocusArea("all");
      setError("");
      setRewardMessage("");
      clearTimeout(rewardTimer.current);
      pendingPets.current.clear();
      importBusy.current = false;
      setLoading(false);
    } catch {
      guestId.current = owner;
      setError("退出登录失败，请稍后重试。");
    } finally { setLoggingOut(false); }
  }, [pendingAsset, loggingOut]);
  useEffect(() => {
    let active = true;
    setRestoring(true);
    setRestoreError("");
    (isRemoteStorageEnabled() ? remoteLoadHome() : loadLocalHome())
      .then((home) => { if (active) enterHome(home); })
      .catch((reason) => {
        if (active) setRestoreError(reason instanceof Error ? reason.message : "暂时无法读取本地存档，请检查浏览器是否允许存储，再重试。");
      })
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [enterHome, restoreAttempt]);
  function importFiles(files: FileList) {
    if (!guest || loggingOut || editingFurnitureRef.current || restoring || full || pendingAsset || selectedPetId || importBusy.current) return;
    try {
      const next = validateFiles(
        Array.from(files, (file) => ({ name: file.name, blob: file })),
      );
      setError("");
      setLoading(false);
      setPendingAsset(next);
    } catch (error) {
      setError(error instanceof Error ? error.message : "导入失败");
    }
  }
  if (restoring || restoreError) return (
    <main className="session-loading" aria-busy={restoring}>
      <p role="status">{restoring ? "正在找回你的家园…" : restoreError}</p>
      {restoreError ? <button className="secondary-button" onClick={() => setRestoreAttempt((value) => value + 1)}>重试读取存档</button> : null}
    </main>
  );
  if (!guest) return <GuestEntry onEnter={enterHome} />;
  return (
    <main
      className="room-app"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (event.dataTransfer.files.length) importFiles(event.dataTransfer.files);
      }}
    >
      <Room
        timeOrigin={timeOrigin}
        pets={pets}
        initialLayout={initialLayout}
        cleanables={care.items}
        paused={Boolean(pendingAsset || selectedPet || loggingOut)}
        viewReset={viewReset}
        focusArea={focusArea}
        onCareTick={onCareTick}
        onClean={onClean}
        onPortrait={onPortrait}
        onFurnitureEditing={onFurnitureEditing}
        onFurnitureLayout={onFurnitureLayout}
        onReady={onReady}
        onError={onError}
        onPetError={onPetError}
      />
      <aside className="hud-left" aria-label="家园信息">
        <div className="room-status">
          <div className="coin-counter" aria-label={`金币 ${care.coins}`}><span className="coin-icon" aria-hidden="true">✦</span><strong>{care.coins.toLocaleString()}</strong><span>金币</span></div>
          <GameClock timeOrigin={timeOrigin} />
        </div>
        <BackgroundMusic />
        <nav className="pet-rail" aria-label="房间里的宠物">
          <span className="pet-rail-title">伙伴</span>
          {pets.map((pet) => <button key={pet.id} className="pet-portrait-button" aria-label={`查看${pet.profile.name}的档案`} disabled={editingFurniture || loading || Boolean(pendingAsset || selectedPet)} onClick={() => setSelectedPetId(pet.id)}>
            {pet.portrait ? <img src={pet.portrait} alt={`${pet.profile.name}的头像`} width="58" height="58" /> : <span className="portrait-loading" aria-label="头像准备中">•••</span>}
            <span className="pet-rail-name" title={pet.profile.name}>{pet.profile.name}</span>
          </button>)}
          {!pets.length ? <span className="pet-rail-empty">导入宠物<br />迎接伙伴</span> : null}
        </nav>
      </aside>
      <button type="button" className={`diary-tab${diaryOpen ? " is-open" : ""}`} onClick={() => setDiaryOpen((open) => !open)} aria-expanded={diaryOpen} aria-controls="pet-behavior-diary"><span aria-hidden="true">✦</span><b>行为<br />日记</b></button>
      {diaryOpen ? <div id="pet-behavior-diary"><BehaviorDiary pets={pets} onClose={() => setDiaryOpen(false)} /></div> : null}
      <div className="bottom-hud">
        <div className="room-view-hint">空白处拖动旋转 · 拖宠物到椅旁 / 床上 · Shift 拖宠物转向</div>
        <nav className="room-area-switch" aria-label="房间取景">
          {([["all", "一起看"], ["bedroom", "看卧室"], ["classroom", "看教室"]] as const).map(([area, name]) => <button key={area} type="button" aria-pressed={focusArea === area} disabled={editingFurniture || loading || Boolean(pendingAsset || selectedPet)} onClick={() => setFocusArea(area)}>{name}</button>)}
          <button type="button" className="reset-view-button" disabled={editingFurniture || loading || Boolean(pendingAsset || selectedPet)} onClick={() => { setViewReset((value) => value + 1); setFocusArea("all"); }}>回到默认视角</button>
        </nav>
      </div>
      <div className="care-hint">点击便便或纸团清扫 · 每件 +5 金币</div>
      {rewardMessage ? <div className="clean-reward" role="status">{rewardMessage}</div> : null}
      {selectedPet ? <PetProfileCard key={selectedPet.id} asset={selectedPet.asset} initialProfile={selectedPet.profile} readOnly onCancel={() => setSelectedPetId(null)} onError={setError} /> : null}
      {pendingAsset ? (
        <PetProfileCard
          asset={pendingAsset}
          saving={loading}
          onCancel={() => { if (!importBusy.current) setPendingAsset(null); }}
          onError={setError}
          onConfirm={async (nextProfile) => {
            if (restoring || pets.length >= MAX_PETS || importBusy.current) return;
            importBusy.current = true;
            setLoading(true);
            const pet = { id: crypto.randomUUID(), asset: pendingAsset, profile: nextProfile };
            try {
              await (isRemoteStorageEnabled() ? remoteSavePet(pet) : savePet(pet, guest.id));
              pendingPets.current.add(pet.id);
              setPets((current) => [...current, pet]);
              setPendingAsset(null);
            } catch {
              importBusy.current = false;
              setLoading(false);
              setError("宠物未能保存，请检查存储空间或其他游戏标签页是否已满 4 只，再重试。模型和填写内容仍在。");
            }
          }}
        />
      ) : null}
      <input
        ref={input}
        className="file-input"
        type="file"
        multiple
        disabled={editingFurniture || restoring || full || loading || Boolean(pendingAsset || selectedPet)}
        accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp"
        aria-label="选择 3D 资源"
        onChange={(event) => {
          if (event.target.files?.length) importFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <div className="room-toolbar">
        {import.meta.env.DEV ? <button className="secondary-button" onClick={() => {
          void import('./lib/export-starter').then(({ exportStarterPets }) => exportStarterPets()).catch((reason) => setError(String(reason)));
        }}>导出初始宠物</button> : null}
        <button ref={profileButton} type="button" className={`guest-info${profileMenuOpen ? " is-open" : ""}`} aria-label="个人信息" aria-haspopup="menu" aria-controls="profile-menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}>
          <img src={guest.avatar} alt={`${guest.name}的角色头像`} width="44" height="44" />
          <span title={guest.name}>{guest.name}</span>
          <span className="guest-info-chevron" aria-hidden="true">⌄</span>
        </button>
        {profileMenuOpen ? <div ref={profileMenu} id="profile-menu" className="profile-menu" role="menu" aria-label="个人信息"><div className="profile-menu-name">已登录为 <b>{guest.name}</b></div><button type="button" role="menuitem" disabled={loggingOut || loading || editingFurniture || Boolean(pendingAsset)} onClick={() => void logout()}>{loggingOut ? "正在退出…" : "退出登录"}</button></div> : null}
        <button
          className="import-button"
          disabled={editingFurniture || restoring || full || loading || Boolean(pendingAsset || selectedPet)}
          title={full ? "房间最多可以放置 4 只宠物" : undefined}
          onClick={() => input.current?.click()}
        >
          {editingFurniture ? "正在移动家具" : restoring ? "正在恢复存档…" : loading ? "导入中…" : full ? "已满员 · 4 / 4" : pendingAsset ? "正在编辑宠物" : `导入宠物 · ${pets.length} / ${MAX_PETS}`}
        </button>
      </div>
      {error ? (
        <div className="error" role="alert">
          {error}
          <button aria-label="关闭提示" onClick={() => setError("")}>
            ×
          </button>
        </div>
      ) : null}
    </main>
  );
}
