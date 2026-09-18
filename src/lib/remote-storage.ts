import type { FurnitureLayout } from "./furniture-layout";
import { createHomeCare, type HomeCare, type CareTick } from "./home-items";
import type { LocalHome } from "./pet-storage";
import type { PetRecord } from "./pets";
import type { ModelAsset } from "./assets";

type RemoteFile = { name: string; url: string };
type RemotePet = Omit<PetRecord, "asset"> & { asset: Omit<ModelAsset, "files"> & { files: RemoteFile[] } };

async function request(path: string, init?: RequestInit) {
  const response = await fetch(new URL(path.replace(/^\//, ""), new URL(import.meta.env.BASE_URL, document.baseURI)), { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `请求失败（${response.status}）`);
  return response.json();
}

async function assetToJson(asset: ModelAsset) {
  const files = await Promise.all(asset.files.map(async (file) => {
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return { name: file.name, data: btoa(binary) };
  }));
  return { files };
}

async function hydratePets(pets: RemotePet[]): Promise<PetRecord[]> {
  return Promise.all(pets.map(async (pet) => ({ ...pet, asset: { ...pet.asset, files: await Promise.all(pet.asset.files.map(async (file) => ({ name: file.name, blob: await fetch(new URL(file.url.replace(/^\//, ""), new URL(import.meta.env.BASE_URL, document.baseURI)), { credentials: "same-origin" }).then((response) => {
    if (!response.ok) throw new Error(`模型文件读取失败（${response.status}）`);
    return response.blob();
  }) }))) } })));
}

export async function remoteLoadHome(): Promise<LocalHome> {
  try {
    const data = await request("/api/home");
    return { ...data, care: data.care || createHomeCare(), pets: await hydratePets(data.pets || []) };
  } catch (error) {
    if (error instanceof Error && error.message === "请先输入用户名。") return { guest: null, pets: [], furniture: {}, care: createHomeCare(), timeOrigin: Date.now() };
    throw error;
  }
}

export async function remoteCreateGuest(name: string, avatar: string): Promise<LocalHome> {
  const data = await request("/api/guest", { method: "POST", body: JSON.stringify({ name, avatar }) });
  return { ...data, care: data.care || createHomeCare(), pets: await hydratePets(data.pets || []) };
}

export async function remoteSavePet(pet: PetRecord): Promise<void> {
  const encoded = await assetToJson(pet.asset);
  await request("/api/pets", { method: "POST", body: JSON.stringify({ pet: { ...pet, asset: { main: pet.asset.main } }, files: encoded.files }) });
}

export async function remoteSaveFurnitureLayout(layout: FurnitureLayout): Promise<void> { await request("/api/furniture", { method: "POST", body: JSON.stringify({ layout }) }); }
export async function remoteSavePortrait(id: string, portrait: string): Promise<void> { await request("/api/portrait", { method: "POST", body: JSON.stringify({ id, portrait }) }); }
export async function remoteLogout(): Promise<void> { await request("/api/logout", { method: "POST" }); }

export async function remoteUpdateHomeCare(change: { tick: CareTick } | { cleanId: string }): Promise<{ care: HomeCare; reward: number }> {
  return request("/api/care", { method: "POST", body: JSON.stringify(change) });
}

export function isRemoteStorageEnabled() { return import.meta.env.PROD; }
export type { CareTick };
