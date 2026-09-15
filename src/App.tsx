import { useCallback, useEffect, useRef, useState } from "react";
import Room from "./components/Room";
import GuestEntry from "./components/GuestEntry";
import type { FurnitureLayout } from "./lib/furniture-layout";
import type { GuestProfile } from "./lib/guest";
import PetProfileCard from "./components/PetProfileCard";
import { validateFiles, type ModelAsset } from "./lib/assets";
import { MAX_PETS, type PetRecord } from "./lib/pets";
import { createHomeCare, type HomeCare, type CareTick } from "./lib/home-items";
import { loadLocalHome, savePet, saveFurnitureLayout, savePetPortrait, updateHomeCare, type LocalHome } from "./lib/pet-storage";

export default function App() {
  const [initialLayout, setInitialLayout] = useState<FurnitureLayout>({});
  const [inspecting, setInspecting] = useState(false);
  const [focusArea, setFocusArea] = useState<"all" | "bedroom" | "classroom">("all");
  const [viewReset, setViewReset] = useState(0);
  const viewToggle = useRef<HTMLButtonElement>(null);
  const [editingFurniture, setEditingFurniture] = useState(false);
  const editingFurnitureRef = useRef(false);
  const guestId = useRef<string | null>(null);
  const onFurnitureEditing = useCallback((active: boolean) => {
    editingFurnitureRef.current = active;
    setEditingFurniture(active);
  }, []);
  const exitInspection = useCallback(() => {
    setInspecting(false);
    viewToggle.current?.focus();
  }, []);
  useEffect(() => {
    if (!inspecting) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); exitInspection(); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [inspecting, exitInspection]);
  const input = useRef<HTMLInputElement>(null);
  const [pets, setPets] = useState<PetRecord[]>([]);
  const [error, setError] = useState("");
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [care, setCare] = useState<HomeCare>(createHomeCare);
  const [rewardMessage, setRewardMessage] = useState("");
  const rewardTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(rewardTimer.current), []);
  const receiveCare = useCallback((next: HomeCare) => {
    setCare((previous) => ({ ...next, items: previous.items.length === next.items.length && previous.items.every((item, i) => item.id === next.items[i].id) ? previous.items : next.items }));
  }, []);
  const onCareTick = useCallback((tick: CareTick) => {
    const owner = guestId.current;
    if (!owner) return;
    void updateHomeCare(owner, { tick }).then(({ care }) => receiveCare(care)).catch(() => setError("活动进度暂未保存，请检查浏览器存储空间。"));
  }, [receiveCare]);
  const onClean = useCallback(async (id: string) => {
    const owner = guestId.current;
    if (!owner) return;
    try {
      const result = await updateHomeCare(owner, { cleanId: id });
      receiveCare(result.care);
      setRewardMessage(result.reward ? "打扫干净啦！+5 金币" : "这件物品已经清扫过啦");
      clearTimeout(rewardTimer.current);
      rewardTimer.current = setTimeout(() => setRewardMessage(""), 2000);
    } catch { setError("清扫未能保存，物品和金币未变动，请重试。"); }
  }, [receiveCare]);
  const onPortrait = useCallback((id: string, portrait: string) => {
    setPets((previous) => previous.map((pet) => pet.id === id ? { ...pet, portrait } : pet));
    if (guestId.current) void savePetPortrait(id, portrait, guestId.current).catch(() => { /* Regenerate on next load if the thumbnail could not be saved. */ });
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
    if (guestId.current) void saveFurnitureLayout(layout, guestId.current).catch(() => setError("家具位置暂未保存，刷新后会回到上一次存档。请检查浏览器存储空间。"));
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
  useEffect(() => {
    let active = true;
    setRestoring(true);
    setRestoreError("");
    loadLocalHome()
      .then((home) => { if (active) enterHome(home); })
      .catch((reason) => {
        if (active) setRestoreError(reason instanceof Error ? reason.message : "暂时无法读取本地存档，请检查浏览器是否允许存储，再重试。");
      })
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [enterHome, restoreAttempt]);
  function importFiles(files: FileList) {
    if (!guest || inspecting || editingFurnitureRef.current || restoring || full || pendingAsset || selectedPetId || importBusy.current) return;
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
      className={`room-app${inspecting ? " is-inspecting" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (event.dataTransfer.files.length) importFiles(event.dataTransfer.files);
      }}
    >
      <Room
        pets={pets}
        initialLayout={initialLayout}
        cleanables={care.items}
        paused={Boolean(pendingAsset || selectedPet)}
        inspecting={inspecting}
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
      <nav className="room-area-switch" aria-label="房间取景">
        {([["all", "一起看"], ["bedroom", "看卧室"], ["classroom", "看教室"]] as const).map(([area, name]) => <button key={area} aria-pressed={focusArea === area} disabled={inspecting || editingFurniture || Boolean(pendingAsset || selectedPet)} onClick={() => setFocusArea(area)}>{name}</button>)}
      </nav>
      <div className="coin-counter" aria-label={`金币 ${care.coins}`}><span className="coin-icon" aria-hidden="true">✦</span><strong>{care.coins.toLocaleString()}</strong><span>金币</span></div>
      <nav className="pet-rail" aria-label="房间里的宠物">
        <span className="pet-rail-title">伙伴</span>
        {pets.map((pet) => <button key={pet.id} className="pet-portrait-button" aria-label={`查看${pet.profile.name}的档案`} disabled={inspecting || editingFurniture || loading || Boolean(pendingAsset || selectedPet)} onClick={() => setSelectedPetId(pet.id)}>
          {pet.portrait ? <img src={pet.portrait} alt={`${pet.profile.name}的头像`} width="58" height="58" /> : <span className="portrait-loading" aria-label="头像准备中">•••</span>}
          <span className="pet-rail-name" title={pet.profile.name}>{pet.profile.name}</span>
        </button>)}
        {!pets.length ? <span className="pet-rail-empty">导入宠物<br />迎接伙伴</span> : null}
      </nav>
      {inspecting ? <div className="view-help" id="view-instructions">
        <div role="status"><strong>360° 自由查看</strong><span>拖动旋转 · 滚轮 / 双指缩放</span></div>
        <button type="button" onClick={() => { setViewReset((value) => value + 1); setFocusArea("all"); exitInspection(); }}>回到默认视角</button>
        <button type="button" onClick={exitInspection}>退出查看</button>
      </div> : null}
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
              await savePet(pet, guest.id);
              pendingPets.current.add(pet.id);
              setPets((current) => [...current, pet]);
              setPendingAsset(null);
            } catch {
              importBusy.current = false;
              setLoading(false);
              setError("宠物未能保存，请检查存储空间或其他游戏标签页是否已满 3 只，再重试。模型和填写内容仍在。");
            }
          }}
        />
      ) : null}
      <input
        ref={input}
        className="file-input"
        type="file"
        multiple
        disabled={inspecting || editingFurniture || restoring || full || loading || Boolean(pendingAsset || selectedPet)}
        accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp"
        aria-label="选择 3D 资源"
        onChange={(event) => {
          if (event.target.files?.length) importFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <div className="room-toolbar">
        <div className="guest-info" aria-label="个人信息">
          <img src={guest.avatar} alt={`${guest.name}的角色头像`} width="44" height="44" />
          <span title={guest.name}>{guest.name}</span>
        </div>
        <button
          ref={viewToggle}
          type="button"
          className="view-button"
          aria-pressed={inspecting}
          aria-describedby={inspecting ? "view-instructions" : undefined}
          disabled={editingFurniture || loading || Boolean(pendingAsset || selectedPet)}
          onClick={() => setInspecting((active) => !active)}
        ><span aria-hidden="true">⟳</span> {inspecting ? "退出 360°" : "360° 查看"}</button>
        <button
          className="import-button"
          disabled={inspecting || editingFurniture || restoring || full || loading || Boolean(pendingAsset || selectedPet)}
          title={full ? "房间最多可以放置 3 只宠物" : undefined}
          onClick={() => input.current?.click()}
        >
          {editingFurniture ? "正在移动家具" : restoring ? "正在恢复存档…" : loading ? "导入中…" : full ? "已满员 · 3 / 3" : pendingAsset ? "正在编辑宠物" : `导入宠物 · ${pets.length} / ${MAX_PETS}`}
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
