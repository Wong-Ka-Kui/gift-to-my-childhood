import { useCallback, useEffect, useRef, useState } from "react";
import Room from "./components/Room";
import GuestEntry from "./components/GuestEntry";
import type { FurnitureLayout } from "./lib/furniture-layout";
import type { GuestProfile } from "./lib/guest";
import PetProfileCard from "./components/PetProfileCard";
import { validateFiles, type ModelAsset } from "./lib/assets";
import { MAX_PETS, type PetRecord } from "./lib/pets";
import { loadLocalHome, savePet, saveFurnitureLayout, type LocalHome } from "./lib/pet-storage";

export default function App() {
  const [initialLayout, setInitialLayout] = useState<FurnitureLayout>({});
  const [editingFurniture, setEditingFurniture] = useState(false);
  const editingFurnitureRef = useRef(false);
  const guestId = useRef<string | null>(null);
  const onFurnitureEditing = useCallback((active: boolean) => {
    editingFurnitureRef.current = active;
    setEditingFurniture(active);
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const [pets, setPets] = useState<PetRecord[]>([]);
  const [pendingAsset, setPendingAsset] = useState<ModelAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const pendingPets = useRef(new Set<string>());
  const [restoring, setRestoring] = useState(true);
  const importBusy = useRef(false);
  const [error, setError] = useState("");
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
    if (!guest || editingFurnitureRef.current || restoring || full || pendingAsset || importBusy.current) return;
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
        pets={pets}
        initialLayout={initialLayout}
        onFurnitureEditing={onFurnitureEditing}
        onFurnitureLayout={onFurnitureLayout}
        onReady={onReady}
        onError={onError}
        onPetError={onPetError}
      />
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
        disabled={editingFurniture || restoring || full || loading || Boolean(pendingAsset)}
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
          className="import-button"
          disabled={editingFurniture || restoring || full || loading || Boolean(pendingAsset)}
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
