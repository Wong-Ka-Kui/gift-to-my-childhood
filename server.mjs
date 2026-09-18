import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { advanceHomeCare, cleanHomeItem, createHomeCare } from "./server-runtime/home-items.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = process.env.GARDEN_DATA || path.join(root, ".garden-data");
const port = Number(process.env.PORT || 4173);
const distRoot = path.join(root, "dist");
const usersFile = path.join(dataRoot, "users.json");
const maxBody = 145 * 1024 * 1024;
const idPattern = /^[a-f0-9-]{36}$/;
let apiQueue = Promise.resolve();

const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
};

async function ensureData() {
  await fs.mkdir(dataRoot, { recursive: true });
  try { await fs.access(usersFile); } catch { await atomicWrite(usersFile, []); }
}

async function readUsers() {
  return JSON.parse(await fs.readFile(usersFile, "utf8"));
}

async function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value), "utf8");
  await fs.rename(temporary, file);
}

function send(res, status, value, headers = {}) {
  const body = typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value);
  res.writeHead(status, { "content-type": typeof body === "string" ? "application/json; charset=utf-8" : "application/octet-stream", ...headers });
  res.end(body);
}

function json(res, status, value, headers = {}) { send(res, status, value, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }); }

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBody) throw Object.assign(new Error("请求体过大"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const i = part.indexOf("="); return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }));
}

function userFrom(req, users) {
  const token = cookies(req).pet_room_session;
  return token ? users.find((user) => user.sessionHash === crypto.createHash("sha256").update(token).digest("hex")) : undefined;
}

function publicUser(user) { return user && { id: user.id, name: user.name, avatar: user.avatar, createdAt: user.createdAt }; }
const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");
function authCookie(req, name, token, maxAge = 31536000) {
  return `${name}=${token}; Path=${req.appBase || "/"}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""}`;
}

async function readHome(user) {
  const homeFile = path.join(dataRoot, "homes", `${user.id}.json`);
  try { return JSON.parse(await fs.readFile(homeFile, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const template = JSON.parse(await fs.readFile(path.join(root, "starter", "home.json"), "utf8"));
    const pets = [];
    for (const pet of template.pets) {
      const directory = path.join(dataRoot, "models", user.id, pet.id);
      await fs.mkdir(directory, { recursive: true });
      for (const [index, file] of pet.asset.files.entries()) {
        await fs.copyFile(path.join(root, "starter", file.source), path.join(directory, `${index}.bin`));
      }
      pets.push({ ...pet, asset: { ...pet.asset, files: pet.asset.files.map(({ name }) => ({ name })) } });
    }
    return { pets, furniture: template.furniture ?? {}, care: createHomeCare(), timeOrigin: Date.now() };
  }
}

async function writeHome(user, home) {
  const homes = path.join(dataRoot, "homes");
  await fs.mkdir(homes, { recursive: true });
  await atomicWrite(path.join(homes, `${user.id}.json`), home);
}

function assetUrl(petId, index) { return `/api/pets/${encodeURIComponent(petId)}/files/${index}`; }

async function routeApi(req, res, url) {
  if (req.method === "POST" && !String(req.headers["content-type"]).startsWith("application/json")) return json(res, 415, { error: "需要 JSON 请求。" });
  const users = await readUsers();
  if (req.method === "POST" && url.pathname === "/api/guest") {
    const input = JSON.parse(await body(req));
    const name = String(input.name || "").trim();
    const avatar = String(input.avatar || "");
    if (!name || name.length > 24 || /[\u0000-\u001f\u007f]/.test(name)) return json(res, 400, { error: "请输入 1–24 个字符的名字。" });
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar) || avatar.length > 250000) return json(res, 400, { error: "头像未生成成功，请重新尝试。" });
    let user = userFrom(req, users);
    const device = cookies(req).pet_room_device || crypto.randomBytes(32).toString("hex");
    const deviceHash = tokenHash(device);
    let token;
    if (!user) {
      token = crypto.randomBytes(32).toString("hex");
      user = users.find((candidate) => candidate.deviceHash === deviceHash && candidate.name === name);
      if (!user) {
        user = { id: crypto.randomUUID(), name, avatar, createdAt: Date.now() };
        users.push(user);
      }
      user.sessionHash = tokenHash(token);
    }
    user.deviceHash = deviceHash;
    await atomicWrite(usersFile, users);
    const home = await readHome(user);
    if (!home.timeOrigin) home.timeOrigin = Date.now();
    await writeHome(user, home);
    const pets = home.pets.map((pet) => ({ ...pet, asset: { ...pet.asset, files: pet.asset.files.map((file, index) => ({ name: file.name, url: assetUrl(pet.id, index) })) } }));
    return json(res, 200, { guest: publicUser(user), ...home, pets }, { "set-cookie": [authCookie(req, "pet_room_device", device), ...(token ? [authCookie(req, "pet_room_session", token)] : [])] });
  }
  if (req.method === "POST" && url.pathname === "/api/logout") {
    const user = userFrom(req, users);
    const headers = [authCookie(req, "pet_room_session", "", 0)];
    if (user) {
      const device = cookies(req).pet_room_device || crypto.randomBytes(32).toString("hex");
      user.deviceHash = tokenHash(device);
      delete user.sessionHash;
      await atomicWrite(usersFile, users);
      headers.push(authCookie(req, "pet_room_device", device));
    }
    return json(res, 200, { ok: true }, { "set-cookie": headers });
  }
  const user = userFrom(req, users);
  if (!user) return json(res, 401, { error: "请先输入用户名。" });
  if (req.method === "GET" && url.pathname === "/api/home") {
    const home = await readHome(user);
    const pets = await Promise.all((home.pets || []).map(async (pet) => ({ ...pet, asset: { ...pet.asset, files: (pet.asset?.files || []).map((file, index) => ({ name: file.name, url: assetUrl(pet.id, index) })) } })));
    return json(res, 200, { guest: publicUser(user), pets, furniture: home.furniture || {}, care: home.care, timeOrigin: home.timeOrigin || Date.now() });
  }
  const fileMatch = url.pathname.match(/^\/api\/pets\/([^/]+)\/files\/(\d+)$/);
  if (req.method === "GET" && fileMatch) {
    const petId = decodeURIComponent(fileMatch[1]);
    const home = await readHome(user);
    if (!home.pets.some((pet) => pet.id === petId)) return json(res, 404, { error: "模型不存在" });
    try { return send(res, 200, await fs.readFile(path.join(dataRoot, "models", user.id, petId, `${Number(fileMatch[2])}.bin`)), { "content-type": "application/octet-stream", "cache-control": "private, no-store", "x-content-type-options": "nosniff" }); }
    catch { return json(res, 404, { error: "模型文件不存在" }); }
  }
  if (req.method === "POST" && url.pathname === "/api/pets") {
    const input = JSON.parse(await body(req));
    const home = await readHome(user);
    const pet = input.pet;
    if (!idPattern.test(pet?.id) || !pet.profile || !pet.asset?.main || !Array.isArray(input.files) || home.pets.length >= 4) return json(res, 400, { error: "宠物资料无效或房间已满。" });
    if (home.pets.some((item) => item.id === pet.id)) return json(res, 409, { error: "宠物已保存，请刷新恢复。" });
    if (!["name", "gender", "mbti", "age", "introduction"].every((key) => typeof pet.profile[key] === "string" && pet.profile[key].length <= 10000) || !Number.isFinite(pet.profile.facingYaw)) return json(res, 400, { error: "宠物介绍无效。" });
    if (input.files.length > 100 || input.files.some((file) => typeof file.name !== "string" || typeof file.data !== "string")) return json(res, 400, { error: "模型文件无效。" });
    if (!input.files.length || new Set(input.files.map((file) => file.name)).size !== input.files.length || input.files.filter((file) => /\.(glb|gltf)$/i.test(file.name)).length !== 1 || !input.files.some((file) => file.name === pet.asset.main) || input.files.some((file) => !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))) return json(res, 400, { error: "模型文件无效。" });
    const total = input.files.reduce((sum, file) => sum + Buffer.from(file.data, "base64").length, 0);
    if (total > 100 * 1024 * 1024) return json(res, 400, { error: "文件总大小不能超过 100 MB。" });
    const modelDir = path.join(dataRoot, "models", user.id, pet.id);
    await fs.mkdir(modelDir, { recursive: true });
    await Promise.all(input.files.map((file, index) => fs.writeFile(path.join(modelDir, `${index}.bin`), Buffer.from(file.data, "base64"))));
    // File names are metadata used by the glTF resolver; preserve them exactly
    // while keeping the actual uploaded bytes in index-based server files.
    const stored = { ...pet, asset: { main: pet.asset.main, bytes: total, files: input.files.map((file) => ({ name: file.name })) } };
    home.pets = [...home.pets.filter((item) => item.id !== pet.id), stored].slice(0, 4);
    await writeHome(user, home);
    return json(res, 200, { ...stored, asset: { ...stored.asset, files: stored.asset.files.map((file, index) => ({ name: file.name, url: assetUrl(pet.id, index) })) } });
  }
  if (req.method === "POST" && url.pathname === "/api/furniture") {
    const input = JSON.parse(await body(req));
    const home = await readHome(user); home.furniture = input.layout || {}; await writeHome(user, home); return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/api/care") {
    const input = JSON.parse(await body(req));
    const home = await readHome(user); const previous = home.care || createHomeCare();
    if (typeof input.cleanId === "string") home.care = cleanHomeItem(previous, input.cleanId);
    else if (input.tick && Number.isFinite(input.tick.from) && Number.isFinite(input.tick.to) && Array.isArray(input.tick.pets) && input.tick.pets.length <= 4 && Array.isArray(input.tick.obstacles) && input.tick.obstacles.length <= 100) {
      const tick = input.tick;
      if (tick.to > Date.now() + 10000 || tick.from > tick.to || !tick.pets.every((p) => home.pets.some((pet) => pet.id === p.id) && [p.x, p.z, p.radius, p.yaw].every(Number.isFinite) && p.radius > 0 && p.radius < 10) || !tick.obstacles.every((o) => [o.minX, o.maxX, o.minZ, o.maxZ].every(Number.isFinite)) || (tick.area && ![tick.area.centerX, tick.area.halfWidth, tick.area.halfDepth].every((n) => Number.isFinite(n) && Math.abs(n) < 100))) return json(res, 400, { error: "活动参数无效。" });
      home.care = advanceHomeCare(previous, tick);
    } else return json(res, 400, { error: "照料操作无效。" });
    await writeHome(user, home); return json(res, 200, { care: home.care, reward: home.care.coins - previous.coins });
  }
  if (req.method === "POST" && url.pathname === "/api/portrait") {
    const input = JSON.parse(await body(req)); const home = await readHome(user); const pet = home.pets.find((item) => item.id === input.id);
    if (!pet) return json(res, 404, { error: "宠物不存在" });
    if (typeof input.portrait !== "string" || input.portrait.length > 1000000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.portrait)) return json(res, 400, { error: "头像无效。" });
    pet.portrait = input.portrait; await writeHome(user, home); return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: "接口不存在" });
}

async function serve(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.resolve(distRoot, `.${requested}`);
  if (!file.startsWith(`${distRoot}${path.sep}`)) return send(res, 403, "forbidden");
  try { const stat = await fs.stat(file); if (stat.isFile()) return send(res, 200, await fs.readFile(file), { "content-type": mime[path.extname(file)] || "application/octet-stream" }); }
  catch {}
  try { return send(res, 200, await fs.readFile(path.join(distRoot, "index.html")), { "content-type": "text/html; charset=utf-8" }); }
  catch { return send(res, 503, "应用尚未构建"); }
}

await ensureData();
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const prefix = url.pathname.match(/^\/seed\/[a-zA-Z0-9_-]+\//)?.[0];
    req.appBase = prefix;
    if (prefix) url.pathname = "/" + url.pathname.slice(prefix.length);
    if (url.pathname.startsWith("/api/")) {
      const operation = apiQueue.then(() => routeApi(req, res, url));
      apiQueue = operation.catch(() => {});
      await operation;
    } else await serve(req, res, url);
  } catch (error) { json(res, error?.status || 500, { error: error instanceof Error ? error.message : "服务器错误" }); }
});
server.listen(port, "0.0.0.0", () => console.log(`Pet room listening on ${server.address().port}`));
