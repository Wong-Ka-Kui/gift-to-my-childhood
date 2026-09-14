import { normalizeGuestName, validateGuestAvatar, type GuestProfile } from "./guest";
import { MAX_PETS, type PetRecord } from "./pets";

import type { FurnitureLayout } from "./furniture-layout";

const DB_NAME = "pet-room-storage";
const DB_VERSION = 2;
const PETS = "pets";
const SESSION = "session";
const GUEST_KEY = "guest";

type StoredPet = PetRecord & { ownerId?: string; createdAt?: number };
export type LocalHome = { guest: GuestProfile | null; pets: PetRecord[]; furniture: FurnitureLayout };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持本地存档，请使用普通浏览模式后重试。"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PETS)) request.result.createObjectStore(PETS, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains(SESSION)) request.result.createObjectStore(SESSION);
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error("请关闭其他旧版游戏标签页，再重试读取存档。"));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) db.close();
      else resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("无法打开本地存档。"));
  });
}

// A request succeeding doesn't mean its transaction has committed to disk.
// Resolve only on transaction completion, including late quota/abort errors.
async function transaction<T>(mode: IDBTransactionMode, run: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let value: T;
    let tx: IDBTransaction | undefined;
    try {
      tx = db.transaction([PETS, SESSION], mode);
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onabort = () => {
        db.close();
        reject(tx?.error ?? new Error("存档未能完成，请检查浏览器存储空间后重试。"));
      };
      run(tx, (next) => { value = next; });
    } catch (error) {
      tx?.abort();
      db.close();
      reject(error);
    }
  });
}

function petsForGuest(records: StoredPet[], id: string): PetRecord[] {
  return records.filter((pet) => pet.ownerId === id)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .slice(0, MAX_PETS)
    .map(({ id, asset, profile }) => ({ id, asset, profile }));
}

export function loadLocalHome(): Promise<LocalHome> {
  return transaction("readonly", (tx, result) => {
    const guest = tx.objectStore(SESSION).get(GUEST_KEY);
    const layout = tx.objectStore(SESSION).get("furniture");
    const pets = tx.objectStore(PETS).getAll();
    pets.onsuccess = () => {
      const current = (guest.result as GuestProfile | undefined) ?? null;
      result({ guest: current, pets: current ? petsForGuest(pets.result, current.id) : [], furniture: current && layout.result?.ownerId === current.id ? layout.result.layout : {} });
    };
  });
}

export function createGuest(name: string, avatar: string): Promise<LocalHome> {
  const candidate: GuestProfile = {
    id: crypto.randomUUID(), name: normalizeGuestName(name), avatar: validateGuestAvatar(avatar), createdAt: Date.now(),
  };
  return transaction("readwrite", (tx, result) => {
    const session = tx.objectStore(SESSION);
    const guest = session.get(GUEST_KEY);
    guest.onsuccess = () => {
      // Multiple first-visit tabs must converge on the same local identity.
      const existing = guest.result as GuestProfile | undefined;
      const current = existing ?? candidate;
      if (!existing) session.put(current, GUEST_KEY);
      const layout = session.get("furniture");
      const store = tx.objectStore(PETS);
      const pets = store.getAll();
      pets.onsuccess = () => {
        const records = pets.result as StoredPet[];
        for (const [index, pet] of records.entries()) {
          if (!pet.ownerId) {
            pet.ownerId = current.id;
            pet.createdAt ??= current.createdAt + index;
            store.put(pet);
          }
        }
        result({ guest: current, pets: petsForGuest(records, current.id), furniture: layout.result?.ownerId === current.id ? layout.result.layout : {} });
      };
    };
  });
}

export function savePet(pet: PetRecord, ownerId: string): Promise<void> {
  return transaction("readwrite", (tx, result) => {
    const guest = tx.objectStore(SESSION).get(GUEST_KEY);
    guest.onsuccess = () => {
      if (guest.result?.id !== ownerId) { tx.abort(); return; }
      const store = tx.objectStore(PETS);
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result as StoredPet[];
        const previous = records.find((record) => record.id === pet.id);
        if ((previous && previous.ownerId !== ownerId) ||
          (!previous && records.filter((record) => record.ownerId === ownerId).length >= MAX_PETS)) {
          tx.abort();
          return;
        }
        store.put({ ...pet, ownerId, createdAt: previous?.createdAt ?? Date.now() } satisfies StoredPet);
        result(undefined);
      };
    };
  });
}

export function saveFurnitureLayout(layout: FurnitureLayout, ownerId: string): Promise<void> {
  return transaction("readwrite", (tx, result) => {
    const store = tx.objectStore(SESSION);
    const guest = store.get(GUEST_KEY);
    guest.onsuccess = () => {
      if (guest.result?.id !== ownerId) { tx.abort(); return; }
      store.put({ ownerId, layout }, "furniture");
      result(undefined);
    };
  });
}
