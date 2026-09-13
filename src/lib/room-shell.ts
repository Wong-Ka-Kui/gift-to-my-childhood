import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

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
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: MeshStandardMaterial | MeshStandardMaterial[],
  ) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    room.add(mesh);
  };
  box(12.24, 0.26, 12.24, 0, -0.13, 0, [edge, edge, floor, edge, edge, edge]);
  box(12.24, WALL_HEIGHT, 0.18, 0, WALL_HEIGHT / 2, -6.03, [
    wallEdge,
    wallEdge,
    wallEdge,
    wallEdge,
    wall,
    wallEdge,
  ]);
  box(0.18, WALL_HEIGHT, 12.24, -6.03, WALL_HEIGHT / 2, 0, [
    wall,
    wallEdge,
    wallEdge,
    wallEdge,
    wallEdge,
    wallEdge,
  ]);
  box(12.3, 0.17, 0.28, 0, WALL_HEIGHT, -6.03, trim);
  box(0.28, 0.17, 12.3, -6.03, WALL_HEIGHT, 0, trim);
  box(12, 0.19, 0.12, 0, 0.095, -5.88, trim);
  box(0.12, 0.19, 12, -5.88, 0.095, 0, trim);
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
