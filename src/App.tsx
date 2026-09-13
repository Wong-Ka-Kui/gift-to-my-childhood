import { useCallback, useRef, useState } from "react";
import Room from "./components/Room";
import PetProfileCard, { type PetProfile } from "./components/PetProfileCard";
import { validateFiles, type ModelAsset } from "./lib/assets";

export default function App() {
  const input = useRef<HTMLInputElement>(null);
  const [asset, setAsset] = useState<ModelAsset | null>(null);
  const [pendingAsset, setPendingAsset] = useState<ModelAsset | null>(null);
  const [profile, setProfile] = useState<PetProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const onReady = useCallback(() => {
    setLoading(false);
  }, []);
  const onError = useCallback((message: string) => {
    setLoading(false);
    setError(message);
  }, []);
  function importFiles(files: FileList) {
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
        if (!loading && !pendingAsset) importFiles(event.dataTransfer.files);
      }}
    >
      <Room
        asset={asset}
        onReady={onReady}
        onError={onError}
      />
      {pendingAsset ? (
        <PetProfileCard
          asset={pendingAsset}
          onCancel={() => setPendingAsset(null)}
          onError={setError}
          onConfirm={(nextProfile) => {
            setProfile(nextProfile);
            setAsset(pendingAsset);
            setPendingAsset(null);
          }}
        />
      ) : null}
      <input
        ref={input}
        className="file-input"
        type="file"
        multiple
        accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp"
        aria-label="选择 3D 资源"
        onChange={(event) => {
          if (event.target.files?.length) importFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        className="import-button"
        disabled={loading || Boolean(pendingAsset)}
        onClick={() => input.current?.click()}
      >
        {loading ? "导入中…" : pendingAsset ? "正在编辑宠物" : profile ? `再次导入 · ${profile.name}` : "导入宠物"}
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
