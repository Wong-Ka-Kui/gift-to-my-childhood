import { useCallback, useRef, useState } from "react";
import Room from "./components/Room";
import PetProfileCard from "./components/PetProfileCard";
import { validateFiles, type ModelAsset } from "./lib/assets";
import { MAX_PETS, type PetRecord } from "./lib/pets";

export default function App() {
  const input = useRef<HTMLInputElement>(null);
  const [pets, setPets] = useState<PetRecord[]>([]);
  const [pendingAsset, setPendingAsset] = useState<ModelAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const importBusy = useRef(false);
  const [error, setError] = useState("");
  const onReady = useCallback(() => {
    importBusy.current = false;
    setLoading(false);
  }, []);
  const onError = useCallback((message: string) => {
    setLoading(false);
    setError(message);
  }, []);
  const onPetError = useCallback((id: string, message: string) => {
    setPets((current) => current.filter((pet) => pet.id !== id));
    importBusy.current = false;
    setLoading(false);
    setError(message);
  }, []);
  const full = pets.length >= MAX_PETS;
  function importFiles(files: FileList) {
    if (full || pendingAsset || importBusy.current) return;
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
        onReady={onReady}
        onError={onError}
        onPetError={onPetError}
      />
      {pendingAsset ? (
        <PetProfileCard
          asset={pendingAsset}
          onCancel={() => setPendingAsset(null)}
          onError={setError}
          onConfirm={(nextProfile) => {
            if (pets.length >= MAX_PETS || importBusy.current) return;
            importBusy.current = true;
            setLoading(true);
            const pet = { id: crypto.randomUUID(), asset: pendingAsset, profile: nextProfile };
            setPets((current) => [...current, pet]);
            setPendingAsset(null);
          }}
        />
      ) : null}
      <input
        ref={input}
        className="file-input"
        type="file"
        multiple
        disabled={full || loading || Boolean(pendingAsset)}
        accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp"
        aria-label="选择 3D 资源"
        onChange={(event) => {
          if (event.target.files?.length) importFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        className="import-button"
        disabled={full || loading || Boolean(pendingAsset)}
        title={full ? "房间最多可以放置 3 只宠物" : undefined}
        onClick={() => input.current?.click()}
      >
        {loading ? "导入中…" : full ? "已满员 · 3 / 3" : pendingAsset ? "正在编辑宠物" : `导入宠物 · ${pets.length} / ${MAX_PETS}`}
      </button>
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
