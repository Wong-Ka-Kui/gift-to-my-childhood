import {
  Box3,
  Group,
  LoadingManager,
  Mesh,
  Vector3,
  type Object3D,
  type Material,
  type Texture,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { readDocument, resolveResource, type ModelAsset } from "./assets";
export function disposeObject(object: Object3D) {
  const textures = new Set<Texture>();
  const materials = new Set<Material>();
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.geometry.dispose();
    for (const material of Array.isArray(child.material)
      ? child.material
      : [child.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value && typeof value === "object" && "isTexture" in value)
          textures.add(value as Texture);
    }
  });
  textures.forEach((texture) => {
    texture.dispose();
    const source = texture.source?.data;
    if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)
      source.close();
  });
  materials.forEach((material) => material.dispose());
}
export async function loadModel(asset: ModelAsset, decoderPath = `${import.meta.env.BASE_URL}draco/`) {
  const main = asset.files.find((file) => file.name === asset.main);
  if (!main) throw new Error("找不到模型主文件。");
  const { data, json } = await readDocument(main.blob);
  if (json.asset?.version !== "2.0")
    throw new Error("目前支持 glTF 2.0 格式，请重新导出。");
  for (const entry of [...(json.buffers ?? []), ...(json.images ?? [])])
    if (entry.uri) resolveResource(entry.uri, asset.files);
  const urls = new Map<string, string>();
  const manager = new LoadingManager();
  manager.setURLModifier((uri) => {
    if (uri.startsWith("blob:") || uri.startsWith("data:")) return uri;
    const file = resolveResource(uri, asset.files)!;
    if (!urls.has(file.name))
      urls.set(file.name, URL.createObjectURL(file.blob));
    return urls.get(file.name)!;
  });
  const draco = new DRACOLoader().setDecoderPath(
    decoderPath,
  );
  const loader = new GLTFLoader(manager)
    .setDRACOLoader(draco)
    .setMeshoptDecoder(MeshoptDecoder);
  try {
    const gltf = await loader.parseAsync(data, "");
    gltf.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(gltf.scene);
    const size = box.getSize(new Vector3());
    const largest = Math.max(size.x, size.y, size.z);
    if (box.isEmpty() || !Number.isFinite(largest) || largest <= 0) {
      disposeObject(gltf.scene);
      throw new Error("模型没有可显示的三维网格。");
    }
    const root = new Group();
    root.add(gltf.scene);
    root.scale.setScalar(1.65 / largest);
    const center = box.getCenter(new Vector3()).multiplyScalar(root.scale.x);
    root.position.set(-center.x, -box.min.y * root.scale.y, -center.z);
    let triangles = 0;
    gltf.scene.traverse((child) => {
      if (child instanceof Mesh)
        triangles +=
          (child.geometry.index?.count ??
            child.geometry.attributes.position?.count ??
            0) / 3;
    });
    return {
      root,
      animations: gltf.animations,
      scene: gltf.scene,
      triangles: Math.round(triangles),
    };
  } finally {
    urls.forEach((url) => URL.revokeObjectURL(url));
    draco.dispose();
  }
}
