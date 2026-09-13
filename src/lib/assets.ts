export type AssetFile = { name: string; blob: Blob };
export type ModelAsset = { files: AssetFile[]; main: string; bytes: number };
const MAX_BYTES = 100 * 1024 * 1024;
export function validateFiles(files: AssetFile[]): ModelAsset {
  if (!files.length) throw new Error("请选择一个模型文件。");
  if (files.length > 100) throw new Error("一次最多导入 100 个文件。");
  const bytes = files.reduce((total, file) => total + file.blob.size, 0);
  if (bytes > MAX_BYTES)
    throw new Error("文件总大小不能超过 100 MB，请先在建模工具中精简模型。");
  const names = files.map((file) => file.name);
  if (new Set(names).size !== names.length)
    throw new Error("存在同名文件，请整理后再导入。");
  const models = files.filter((file) => /\.(glb|gltf)$/i.test(file.name));
  if (models.length !== 1)
    throw new Error(
      "每次请选择一个 GLB 或 glTF 模型，以及它需要的贴图和 BIN 文件。",
    );
  return { files, main: models[0].name, bytes };
}
export function resolveResource(
  uri: string,
  files: AssetFile[],
): AssetFile | undefined {
  if (/^data:/i.test(uri)) return undefined;
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(uri))
    throw new Error("模型引用了外部网址。请导出包含贴图的 GLB，再重新导入。");
  let path: string;
  try {
    path = decodeURIComponent(uri).replaceAll("\\", "/").replace(/^\.\//, "");
  } catch {
    throw new Error("模型中存在无法识别的资源路径。");
  }
  const exact = files.find((file) => file.name === path);
  const match =
    exact ?? files.find((file) => file.name === path.split("/").pop());
  if (!match)
    throw new Error(
      `缺少资源：${path}。请同时选择模型需要的 BIN 和贴图，或导出为 GLB。`,
    );
  return match;
}
export async function readDocument(
  blob: Blob,
): Promise<{ data: ArrayBuffer | string; json: Record<string, any> }> {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  if (buffer.byteLength >= 12 && view.getUint32(0, true) === 0x46546c67) {
    if (
      view.getUint32(4, true) !== 2 ||
      view.getUint32(8, true) !== buffer.byteLength ||
      buffer.byteLength < 20
    )
      throw new Error("GLB 文件头无效，请重新导出模型。");
    const length = view.getUint32(12, true);
    if (
      view.getUint32(16, true) !== 0x4e4f534a ||
      20 + length > buffer.byteLength
    )
      throw new Error("GLB 数据不完整。");
    return {
      data: buffer,
      json: JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + length))),
    };
  }
  const data = new TextDecoder().decode(buffer);
  return { data, json: JSON.parse(data) };
}
