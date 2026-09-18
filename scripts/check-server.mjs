import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const data = await mkdtemp(path.join(tmpdir(), 'pet-api-check-'));
let child;
let origin;
async function start() {
  child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: '0', GARDEN_DATA: data }, stdio: ['ignore', 'pipe', 'pipe'] });
  origin = await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/listening on (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}/seed/pet-room`);
    });
    child.once('exit', (code) => reject(new Error(`Server exited ${code}`)));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  });
}
async function stop() { const ended = once(child, 'exit'); child.kill('SIGTERM'); await ended; }
async function api(route, cookie, input) {
  return fetch(`${origin}/api/${route}`, { method: input ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) });
}
try {
  await start();
  assert.equal((await fetch(`${origin}/`)).status, 200);
  assert.equal((await api('home')).status, 401);
  const guestInput = { name: '同名游客', avatar: 'data:image/png;base64,YQ==' };
  const guestResponse = await api('guest', null, guestInput);
  const cookie = guestResponse.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  assert.match(guestResponse.headers.get('set-cookie'), /Path=\/seed\/pet-room\//);
  const home = await guestResponse.json();
  assert.deepEqual(home.pets.map((pet) => pet.profile.name), ['奶娃', '奶龙', '奶蛙']);
  for (const pet of home.pets) {
    const fileResponse = await api(`pets/${pet.id}/files/0`, cookie);
    assert.equal(fileResponse.status, 200);
    assert.ok((await fileResponse.arrayBuffer()).byteLength > 1000);
  }
  const otherResponse = await api('guest', null, guestInput);
  const otherCookie = otherResponse.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  assert.notEqual((await otherResponse.json()).guest.id, home.guest.id);
  const pet = { id: '12345678-1234-1234-1234-123456789012', profile: { name: '奶蛙', gender: '未知', mbti: 'INFP', age: '1', introduction: '测试', facingYaw: 0 }, asset: { main: '奶蛙.gltf' } };
  const model = JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 });
  const files = [{ name: '奶蛙.gltf', data: Buffer.from(model).toString('base64') }];
  assert.equal((await api('pets', cookie, { pet: { ...pet, id: '../../escape' }, files })).status, 400);
  const writes = await Promise.all([
    api('pets', cookie, { pet, files }),
    api('furniture', cookie, { layout: { stool: { x: 1, z: 2 } } }),
  ]);
  for (const response of writes) assert.equal(response.status, 200);
  let restored = await (await api('home', cookie)).json();
  assert.equal(restored.pets.find((item) => item.id === pet.id).profile.name, '奶蛙');
  assert.deepEqual(restored.furniture, { stool: { x: 1, z: 2 } });
  assert.equal(await (await api(`pets/${pet.id}/files/0`, cookie)).text(), model);
  assert.equal((await api(`pets/${pet.id}/files/0`, otherCookie)).status, 404);
  assert.equal((await api('care', cookie, { care: { coins: 999 } })).status, 400);
  const homeFile = path.join(data, 'homes', `${home.guest.id}.json`);
  const stored = JSON.parse(await readFile(homeFile, 'utf8'));
  stored.care.items = [{ id: 'cleanup-test', kind: 'trash', x: 0, z: 0, createdAt: Date.now() }];
  await writeFile(homeFile, JSON.stringify(stored));
  const cleans = await Promise.all([api('care', cookie, { cleanId: 'cleanup-test' }), api('care', cookie, { cleanId: 'cleanup-test' })]);
  assert.equal((await cleans[0].json()).reward + (await cleans[1].json()).reward, 5);
  await stop();
  await start();
  restored = await (await api('home', cookie)).json();
  assert.equal(restored.care.coins, 5);
  assert.equal(restored.pets.length, 4);
  assert.equal(await (await api(`pets/${pet.id}/files/0`, cookie)).text(), model);
  const reentry = await (await api('guest', cookie, guestInput)).json();
  assert.equal(reentry.guest.id, home.guest.id);
  assert.ok(reentry.pets[0].asset.files[0].url);
  const logout = await api('logout', cookie, {});
  assert.equal(logout.status, 200);
  assert.equal((await api('home', cookie)).status, 401, 'the old session must be invalidated');
  const deviceCookie = logout.headers.getSetCookie().find((c) => c.startsWith('pet_room_device=')).split(';')[0];
  assert.equal((await api('home', deviceCookie)).status, 401, 'refresh stays logged out');
  const resumedResponse = await api('guest', deviceCookie, guestInput);
  const resumed = await resumedResponse.json();
  assert.equal(resumed.guest.id, home.guest.id);
  assert.equal(resumed.pets.length, 4);
  assert.equal(resumed.care.coins, 5);
  assert.deepEqual(resumed.furniture, restored.furniture);
  const resumedCookie = resumedResponse.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  assert.equal(await (await api(`pets/${pet.id}/files/0`, resumedCookie)).text(), model);
  assert.equal((await api('home', cookie)).status, 401, 'old session remains invalid after reentry');
  console.log('PASS: subpath serving, guest isolation, model upload/read, concurrent saves, atomic cleanup, restart recovery, logout and same-device reentry.');
} finally { if (child && child.exitCode === null) await stop(); }
