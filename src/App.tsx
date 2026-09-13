import { useCallback, useRef, useState } from "react";
import Room from "./components/Room";
import { validateFiles, type ModelAsset } from "./lib/assets";

export default function App() {
  const input = useRef<HTMLInputElement>(null);
  const [asset, setAsset] = useState<ModelAsset | null>(null);
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
      setLoading(true);
      setAsset(next);
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
        if (!loading) importFiles(event.dataTransfer.files);
      }}
    >
      <Room
        asset={asset}
        onReady={onReady}
        onError={onError}
      />
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
        disabled={loading}
        onClick={() => input.current?.click()}
      >
        {loading ? "导入中…" : "资源导入"}
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
