import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const exported = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (exported.version !== 1 || !exported.pets?.length || exported.pets.length > 4) throw new Error('Invalid starter export');
const pets = [];
for (const pet of exported.pets) {
  if (!/^[a-f0-9-]{36}$/.test(pet.id)) throw new Error('Invalid pet ID');
  const directory = path.join('starter', pet.id);
  await mkdir(directory, { recursive: true });
  const files = [];
  let bytes = 0;
  for (const [index, file] of pet.asset.files.entries()) {
    const data = Buffer.from(file.data, 'base64');
    const filename = `${index}${path.extname(file.name).toLowerCase()}`;
    await writeFile(path.join(directory, filename), data);
    bytes += data.length;
    files.push({ name: file.name, source: `${pet.id}/${filename}` });
  }
  pets.push({ id: pet.id, profile: pet.profile, portrait: pet.portrait, asset: { main: pet.asset.main, bytes, files } });
}
await writeFile('starter/home.json', JSON.stringify({ version: 1, pets, furniture: exported.furniture }, null, 2));
console.log(pets.map((pet) => ({ name: pet.profile.name, bytes: pet.asset.bytes, files: pet.asset.files.length })));
