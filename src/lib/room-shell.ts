import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { createWindowView } from "./window-view";
import { hingeDoor } from "./door";
import { DORM_SIDE_WINDOW } from "./room-fixtures";
import { createAirConditioner } from "./life-props";

export const ROOM_SIZE = 12;
export const WALL_HEIGHT = 3.3;

function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createRoomShell() {
  const room = new Group();
  room.name = "room";
  // Soft, scalloped cream checks echo the tiled floor in the supplied reference.
  const floorTexture = canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = "#f5de83";
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "#fff4d0";
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        if ((x + y) % 2) continue;
        ctx.beginPath();
        ctx.roundRect(x * 256 + 1, y * 256 + 1, 254, 254, 58);
        ctx.fill();
      }
  });
  floorTexture.wrapS = floorTexture.wrapT = RepeatWrapping;
  floorTexture.repeat.set(8.5, 8.5);
  floorTexture.anisotropy = 8;
  const wallTexture = canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = "#9edee0";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#eceddc";
    for (const [x, y, s] of [
      [75, 72, 0.9],
      [327, 194, 1],
      [419, 47, 0.72],
    ]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.moveTo(-31, 8);
      ctx.bezierCurveTo(-54, 4, -43, -22, -23, -19);
      ctx.bezierCurveTo(-21, -46, 12, -47, 20, -26);
      ctx.bezierCurveTo(41, -31, 54, 2, 32, 9);
      ctx.bezierCurveTo(16, 13, -18, 12, -31, 8);
      ctx.fill();
      ctx.restore();
    }
  });
  wallTexture.wrapS = wallTexture.wrapT = RepeatWrapping;
  wallTexture.repeat.set(3, 1.5);
  wallTexture.anisotropy = 8;
  const floor = new MeshStandardMaterial({
    map: floorTexture,
    roughness: 0.85,
  });
  const edge = new MeshStandardMaterial({ color: "#e7c575", roughness: 0.85 });
  const wall = new MeshStandardMaterial({ map: wallTexture, roughness: 0.95 });
  const wallEdge = new MeshStandardMaterial({
    color: "#a8dfe0",
    roughness: 0.9,
  });
  const trim = new MeshStandardMaterial({ color: "#fffbed", roughness: 0.8 });
  const wallX = new Group(), wallZ = new Group(), wallXBack = new Group(), wallZBack = new Group();
  wallX.name = "room-wall-x"; wallZ.name = "room-wall-z";
  wallXBack.name = "room-wall-x-back"; wallZBack.name = "room-wall-z-back";
  room.add(wallX, wallZ, wallXBack, wallZBack);
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: MeshStandardMaterial | MeshStandardMaterial[],
    parent = room,
  ) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    parent.add(mesh);
  };
  box(12.24, 0.26, 12.24, 0, -0.13, 0, [edge, edge, floor, edge, edge, edge]);
  box(12.24, WALL_HEIGHT, 0.18, 0, WALL_HEIGHT / 2, -6.03, [
    wallEdge,
    wallEdge,
    wallEdge,
    wallEdge,
    wall,
    wallEdge,
  ], wallZ);
  const westWallMaterials = [
    wall,
    wallEdge,
    wallEdge,
    wallEdge,
    wallEdge,
    wallEdge,
  ];
  // Build around the west window so its recessed view has a real opening.
  box(.18, 1.01, 12.24, -6.03, .505, 0, westWallMaterials, wallX);
  box(.18, .51, 12.24, -6.03, 3.045, 0, westWallMaterials, wallX);
  const windowStart = DORM_SIDE_WINDOW.z - DORM_SIDE_WINDOW.width / 2;
  const windowEnd = DORM_SIDE_WINDOW.z + DORM_SIDE_WINDOW.width / 2;
  box(.18, DORM_SIDE_WINDOW.height, windowStart + 6.12, -6.03, DORM_SIDE_WINDOW.y, (windowStart - 6.12) / 2, westWallMaterials, wallX);
  box(.18, DORM_SIDE_WINDOW.height, 6.12 - windowEnd, -6.03, DORM_SIDE_WINDOW.y, (windowEnd + 6.12) / 2, westWallMaterials, wallX);
  box(12.3, 0.17, 0.28, 0, WALL_HEIGHT, -6.03, trim, wallZ);
  box(0.28, 0.17, 12.3, -6.03, WALL_HEIGHT, 0, trim, wallX);
  box(12, 0.19, 0.12, 0, 0.095, -5.88, trim, wallZ);
  box(0.12, 0.19, 12, -5.88, 0.095, 0, trim, wallX);
  const airConditioner = createAirConditioner();
  airConditioner.position.set(-4.12, 2.78, -5.935);
  wallZ.add(airConditioner);
  // Opposite side: a centered door on the east wall.
  box(0.18, WALL_HEIGHT, 5.02, 6.03, WALL_HEIGHT / 2, -3.61, wall, wallXBack);
  box(0.18, WALL_HEIGHT, 5.02, 6.03, WALL_HEIGHT / 2, 3.61, wall, wallXBack);
  box(0.18, .8, 2.2, 6.03, 2.9, 0, wall, wallXBack);
  box(0.28, 0.17, 12.3, 6.03, WALL_HEIGHT, 0, trim, wallXBack);
  for (const z of [-3.59, 3.59]) box(.12, .19, 4.82, 5.88, .095, z, trim, wallXBack);
  // A closed residential panel door, seated inside a 2.2 × 2.5 opening.
  // Trim overlaps the wall seam; skirting stops at each jamb.
  const homeDoor = new MeshStandardMaterial({ color: "#c89469", roughness: .78 });
  const homeDoorInset = new MeshStandardMaterial({ color: "#b67d54", roughness: .84 });
  const molding = new MeshStandardMaterial({ color: "#e4b88a", roughness: .75 });
  const brass = new MeshStandardMaterial({ color: "#c5a05b", roughness: .32, metalness: .65 });
  for (const z of [-1.10, 1.10]) box(.36, 2.5, .16, 6, 1.25, z, trim, wallXBack);
  box(.36, .16, 2.36, 6, 2.5, 0, trim, wallXBack);
  const doorPartStart = wallXBack.children.length;
  box(.16, 2.36, 2.04, 6.03, 1.21, 0, homeDoor, wallXBack);
  // Raised molding surrounds inset panels on both faces of the door.
  for (const x of [5.935, 6.125]) {
    for (const [y, h] of [[.62, .76], [1.74, .94]]) {
      box(.035, h, 1.45, x, y, 0, homeDoorInset, wallXBack);
      for (const z of [-.75, .75]) box(.065, h + .1, .055, x, y, z, molding, wallXBack);
      for (const dy of [-h / 2 - .025, h / 2 + .025]) box(.065, .055, 1.55, x, y + dy, 0, molding, wallXBack);
    }
    box(.06, .26, .12, x, 1.12, .85, brass, wallXBack);
    box(.16, .065, .07, x < 6 ? x - .07 : x + .07, 1.17, .85, brass, wallXBack);
    box(.07, .065, .28, x < 6 ? x - .13 : x + .13, 1.17, .745, brass, wallXBack);
  }
  hingeDoor(wallXBack, wallXBack.children.slice(doorPartStart), "home-door-leaf", 6.03, -1.02);
  box(.4, .04, 2.12, 6.03, .02, 0, molding, wallXBack);
  // Opposite side: a low window on the south wall, matching the room's scale.
  box(4.4, WALL_HEIGHT, .18, -3.8, WALL_HEIGHT / 2, 6.03, wall, wallZBack);
  box(4.4, WALL_HEIGHT, .18, 3.8, WALL_HEIGHT / 2, 6.03, wall, wallZBack);
  box(3.2, 1.13, .18, 0, .565, 6.03, wall, wallZBack);
  box(3.2, .39, .18, 0, 3.105, 6.03, wall, wallZBack);
  box(12.3, .17, .28, 0, WALL_HEIGHT, 6.03, trim, wallZBack);
  box(12, .19, .12, 0, .095, 5.88, trim, wallZBack);
  const southWindow = createWindowView(3.2, 1.78);
  southWindow.position.set(0, 2.02, 6);
  southWindow.rotation.y = Math.PI;
  wallZBack.add(southWindow);
  box(3.35, .10, .10, 0, 2.94, 5.86, trim, wallZBack);
  box(3.35, .10, .10, 0, 1.10, 5.86, trim, wallZBack);
  box(.10, 1.85, .10, -1.62, 2.02, 5.86, trim, wallZBack);
  box(.10, 1.85, .10, 1.62, 2.02, 5.86, trim, wallZBack);
  box(.06, 1.78, .12, 0, 2.02, 5.86, trim, wallZBack);
  box(3.2, .06, .12, 0, 2.28, 5.86, trim, wallZBack);
  box(3.55, .12, .36, 0, 1.055, 5.84, trim, wallZBack);
  return room;
}

export function createBackdrop() {
  return canvasTexture(32, 512, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#40bdc8");
    gradient.addColorStop(1, "#c9faf4");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 512);
  });
}
