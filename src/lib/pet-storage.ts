import type { ModelAsset } from "./assets";
import type { PetProfile, PetRecord } from "./pets";

const DB_NAME = "pet-room-storage";
const DB_VERSION = 1;
const STORE_NAME = "pets";

type StoredPet = {
  id: string;
  asset: { files: { name: string; blob: Blob }[]; main: string; bytes: number };
  profile: PetProfile;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持本地宠物存档。"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地宠物存档。"));
  });
}

function toStored(pet: PetRecord): StoredPet {
  return {
    id: pet.id,
    asset: { files: pet.asset.files.map(({ name, blob }) => ({ name, blob })), main: pet.asset.main, bytes: pet.asset.bytes },
    profile: pet.profile,
  };
}

function fromStored(value: StoredPet): PetRecord {
  return {
    id: value.id,
    asset: { files: value.asset.files, main: value.asset.main, bytes: value.asset.bytes } satisfies ModelAsset,
    profile: value.profile,
  };
}

export async function loadPets(): Promise<PetRecord[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      database.close();
      resolve((request.result as StoredPet[]).map(fromStored));
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("无法读取本地宠物存档。"));
    };
  });
}

export async function savePet(pet: PetRecord): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(toStored(pet));
    request.onsuccess = () => { database.close(); resolve(); };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("无法保存宠物存档，可能是浏览器存储空间不足。"));
    };
  });
}

export async function deletePet(id: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => { database.close(); resolve(); };
    request.onerror = () => { database.close(); reject(request.error ?? new Error("无法更新本地宠物存档。")); };
  });
}
