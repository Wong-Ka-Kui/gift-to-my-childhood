import { normalizeGuestName, validateGuestAvatar, type GuestProfile } from "./guest";
import { MAX_PETS, type PetRecord } from "./pets";

import { advanceHomeCare, cleanHomeItem, createHomeCare, type CareTick, type HomeCare } from "./home-items";
import type { FurnitureLayout } from "./furniture-layout";

const DB_NAME = "pet-room-storage";
const DB_VERSION = 2;
const PETS = "pets";
const SESSION = "session";
const GUEST_KEY = "guest";
const TIME_ORIGIN_KEY = "timeOrigin";

type StoredPet = PetRecord & { ownerId?: string; createdAt?: number };
export type LocalHome = { guest: GuestProfile | null; pets: PetRecord[]; furniture: FurnitureLayout; care: HomeCare; timeOrigin: number };

function isTimeOrigin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

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
    .map(({ id, asset, profile, portrait }) => ({ id, asset, profile, portrait }));
}

export function loadLocalHome(): Promise<LocalHome> {
  // Initialize older saves inside the same serialized transaction that reads
  // them, so two tabs agree on one epoch without touching pets or care records.
  return transaction("readwrite", (tx, result) => {
    const session = tx.objectStore(SESSION);
    const guest = session.get(GUEST_KEY);
    const layout = session.get("furniture");
    const care = session.get("care");
    const savedTime = session.get(TIME_ORIGIN_KEY);
    const pets = tx.objectStore(PETS).getAll();
    pets.onsuccess = () => {
      const current = (guest.result as GuestProfile | undefined) ?? null;
      const timeOrigin = isTimeOrigin(savedTime.result) ? savedTime.result : Date.now();
      if (current && !isTimeOrigin(savedTime.result)) session.put(timeOrigin, TIME_ORIGIN_KEY);
      result({ guest: current, pets: current ? petsForGuest(pets.result, current.id) : [], furniture: current && layout.result?.ownerId === current.id ? layout.result.layout : {}, care: current && care.result?.ownerId === current.id ? care.result.state : createHomeCare(), timeOrigin });
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
    const archived = session.get(`profile:${candidate.name}`);
    archived.onsuccess = () => {
      // Multiple first-visit tabs must converge on the same local identity.
      const existing = guest.result as GuestProfile | undefined;
      const previous = archived.result as LocalHome | undefined;
      const current = existing ?? previous?.guest ?? candidate;
      if (!existing) session.put(current, GUEST_KEY);
      if (!existing && previous) {
        session.put({ ownerId: current.id, layout: previous.furniture }, "furniture");
        session.put({ ownerId: current.id, state: previous.care }, "care");
        session.put(previous.timeOrigin, TIME_ORIGIN_KEY);
      }
      const layout = session.get("furniture");
      const care = session.get("care");
      const savedTime = session.get(TIME_ORIGIN_KEY);
      const store = tx.objectStore(PETS);
      const pets = store.getAll();
      pets.onsuccess = () => {
        const records = pets.result as StoredPet[];
        const timeOrigin = (existing || previous) && isTimeOrigin(savedTime.result) ? savedTime.result : Date.now();
        if (!existing || !isTimeOrigin(savedTime.result)) session.put(timeOrigin, TIME_ORIGIN_KEY);
        for (const [index, pet] of records.entries()) {
          if (!pet.ownerId) {
            pet.ownerId = current.id;
            pet.createdAt ??= current.createdAt + index;
            store.put(pet);
          }
        }
        result({ guest: current, pets: petsForGuest(records, current.id), furniture: layout.result?.ownerId === current.id ? layout.result.layout : {}, care: care.result?.ownerId === current.id ? care.result.state : createHomeCare(), timeOrigin });
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

// Read and modify the latest save in one transaction: removal and payment are atomic,
// including two tabs cleaning the same item at once. No model blobs are rewritten.
export function updateHomeCare(ownerId: string, change: { tick: CareTick } | { cleanId: string }): Promise<{ care: HomeCare; reward: number }> {
  return transaction("readwrite", (tx, result) => {
    const store = tx.objectStore(SESSION);
    const guest = store.get(GUEST_KEY);
    const saved = store.get("care");
    saved.onsuccess = () => {
      if (guest.result?.id !== ownerId) { tx.abort(); return; }
      const previous: HomeCare = saved.result?.ownerId === ownerId ? saved.result.state : createHomeCare();
      const care = "tick" in change ? advanceHomeCare(previous, change.tick) : cleanHomeItem(previous, change.cleanId);
      store.put({ ownerId, state: care }, "care");
      result({ care, reward: care.coins - previous.coins });
    };
  });
}

export function savePetPortrait(id: string, portrait: string, ownerId: string): Promise<void> {
  return transaction("readwrite", (tx, result) => {
    const store = tx.objectStore(PETS);
    const request = store.get(id);
    request.onsuccess = () => {
      const pet = request.result as StoredPet | undefined;
      if (!pet || pet.ownerId !== ownerId) { tx.abort(); return; }
      store.put({ ...pet, portrait });
      result(undefined);
    };
  });
}

export function logoutLocal(): Promise<void> {
  return transaction("readwrite", (tx, result) => {
    const session = tx.objectStore(SESSION);
    const guest = session.get(GUEST_KEY);
    const furniture = session.get("furniture");
    const care = session.get("care");
    const time = session.get(TIME_ORIGIN_KEY);
    time.onsuccess = () => {
      if (guest.result) session.put({
        guest: guest.result,
        furniture: furniture.result?.ownerId === guest.result.id ? furniture.result.layout : {},
        care: care.result?.ownerId === guest.result.id ? care.result.state : createHomeCare(),
        timeOrigin: isTimeOrigin(time.result) ? time.result : Date.now(),
      }, `profile:${guest.result.name}`);
      session.delete(GUEST_KEY);
      result(undefined);
    };
  });
}
