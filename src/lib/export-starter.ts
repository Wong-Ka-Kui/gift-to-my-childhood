import { loadLocalHome } from './pet-storage';

/** Explicit development-only export of the pets the author wants to publish. */
export async function exportStarterPets() {
  const home = await loadLocalHome();
  if (!home.pets.length) throw new Error('当前浏览器没有已保存的宠物。');
  const pets = await Promise.all(home.pets.map(async ({ id, profile, portrait, asset }) => ({
    id, profile, portrait,
    asset: { main: asset.main, files: await Promise.all(asset.files.map(async (file) => {
      const bytes = new Uint8Array(await file.blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return { name: file.name, data: btoa(binary) };
    })) },
  })));
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, pets, furniture: home.furniture })], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pet-room-starter-pets.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
