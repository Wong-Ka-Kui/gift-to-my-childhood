import {
  Box3,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import { placementProblem, type FurnitureFootprint, type FurnitureLayout, type PlacedFurniture } from "./furniture-layout";
import { createWindowView } from "./window-view";

export type FurnitureItem = PlacedFurniture & { group: Group; label: string };

const material = (color: string, roughness = 0.75) =>
  new MeshStandardMaterial({ color, roughness });

function rounded(
  parent: Group,
  size: [number, number, number],
  position: [number, number, number],
  surface: Material,
  radius = 0.035,
) {
  const shape = new Mesh(
    new RoundedBoxGeometry(...size, 3, Math.min(radius, ...size.map((v) => v / 2))),
    surface,
  );
  shape.position.set(...position);
  shape.castShadow = shape.receiveShadow = true;
  parent.add(shape);
  return shape;
}

function cylinder(
  parent: Group,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: [number, number, number],
  surface: Material,
  segments = 32,
) {
  const shape = new Mesh(
    new CylinderGeometry(radiusTop, radiusBottom, height, segments),
    surface,
  );
  shape.position.set(...position);
  shape.castShadow = shape.receiveShadow = true;
  parent.add(shape);
  return shape;
}

function ellipsoid(
  parent: Group,
  scale: [number, number, number],
  position: [number, number, number],
  surface: Material,
) {
  const shape = new Mesh(new SphereGeometry(1, 24, 16), surface);
  shape.scale.set(...scale);
  shape.position.set(...position);
  shape.castShadow = shape.receiveShadow = true;
  parent.add(shape);
  return shape;
}

function rod(
  parent: Group,
  start: [number, number, number],
  end: [number, number, number],
  radius: number,
  surface: Material,
) {
  const from = new Vector3(...start);
  const to = new Vector3(...end);
  const direction = to.clone().sub(from);
  const middle = from.clone().add(to).multiplyScalar(0.5);
  const shape = cylinder(parent, radius, radius, direction.length(), [middle.x, middle.y, middle.z], surface, 16);
  shape.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
  return shape;
}

function fabricTexture(kind: "gingham" | "duvet" | "curtain") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  if (kind === "gingham") {
    ctx.fillStyle = "#f2f3c9";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "rgba(139, 202, 145, .42)";
    for (let i = 0; i < 8; i += 2) {
      ctx.fillRect(i * 32, 0, 32, 256);
      ctx.fillRect(0, i * 32, 256, 32);
    }
  } else if (kind === "duvet") {
    ctx.fillStyle = "#72cfd7";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#e9f4d9";
    [[42, 30], [192, 83], [81, 155], [224, 220]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.ellipse(x, y, 10, 4, -0.18, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#b3e5dc";
    [[140, 30], [32, 230], [210, 158]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    ctx.fillStyle = "#edae9c";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#fff0d6";
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        const x = col * 44 + (row % 2) * 18;
        const y = row * 44 + 12;
        ctx.beginPath();
        ctx.ellipse(x, y, 4, 6, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

function createWindow() {
  const window = new Group();
  // Model the window in its local XY plane, then face it into the room.
  window.position.set(-6, 1.9, 1.95);
  window.rotation.y = Math.PI / 2;
  const wood = material("#efc790");
  const cream = material("#fff2d6");
  window.add(createWindowView(2.34, 1.78));
  for (const x of [-1.21, 1.21]) rounded(window, [0.1, 1.94, 0.14], [x, 0, 0.13], cream, 0.015);
  for (const y of [-0.93, 0.93]) rounded(window, [2.52, 0.11, 0.15], [0, y, 0.14], cream, 0.015);
  for (const x of [-0.39, 0.39]) rounded(window, [0.05, 1.78, 0.10], [x, 0, 0.14], wood, 0.008);
  for (const y of [-0.29, 0.29]) rounded(window, [2.34, 0.05, 0.10], [0, y, 0.14], wood, 0.008);
  rounded(window, [2.9, 0.15, 0.38], [0, -1.035, 0.15], wood, 0.06);
  rounded(window, [2.84, 0.18, 0.28], [0, 1.07, 0.18], wood, 0.045);
  const curtainMaterial = new MeshStandardMaterial({ map: fabricTexture("curtain"), roughness: 1, side: DoubleSide });
  for (const side of [-1, 1]) {
    const vertices: number[] = [];
    const uv: number[] = [];
    const indices: number[] = [];
    const nx = 24;
    const ny = 24;
    for (let j = 0; j <= ny; j++) {
      const v = j / ny;
      // The fabric is gathered toward the edges in the lower half.
      const gather = Math.sin(v * Math.PI * 0.82) * 0.27;
      const width = 0.48 - gather;
      for (let i = 0; i <= nx; i++) {
        const u = i / nx;
        const x = side * (1.20 - width * (1 - u));
        const y = 0.93 - v * 1.80 - Math.cos(u * Math.PI * 6) * 0.015 * v;
        const z = 0.22 + Math.cos(u * Math.PI * 6) * 0.035;
        vertices.push(x, y, z);
        uv.push(u, 1 - v);
        if (j < ny && i < nx) {
          const a = j * (nx + 1) + i;
          indices.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1);
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const curtain = new Mesh(geometry, curtainMaterial);
    curtain.castShadow = curtain.receiveShadow = true;
    window.add(curtain);
    rounded(window, [0.29, 0.065, 0.08], [side * 1.10, -0.36, 0.24], cream, 0.025);
  }
  return window;
}

function createBunk(x: number) {
  const bed = new Group(); bed.position.set(x, 0, -3.75);
  const wood = material("#e6bc85"), cream = material("#fff0d2");
  const duvet = new MeshStandardMaterial({ map: fabricTexture("duvet"), roughness: 1 });
  for (const dx of [-1.05, 1.05]) for (const z of [-1.65, 1.65]) rounded(bed,[.12,3.2,.12],[dx,1.6,z],wood);
  for(const [level,y] of [.55,2.12].entries()) {
    rounded(bed,[2.16,.14,3.4],[0,y-.14,0],wood);
    const mattress=rounded(bed,[1.98,.18,3.18],[0,y-.02,0],cream,.08);
    mattress.name=`mattress-${level}`;
    rounded(bed,[1.94,.08,2.4],[0,y+.11,.3],duvet,.04);
    rounded(bed,[.9,.15,.48],[0,y+.13,-1.18],cream,.05);
    for(const z of [-1.65,1.65]) rounded(bed,[2.15,.3,.1],[0,y+.3,z],wood);
    if(level===1){rounded(bed,[.08,.12,3.2],[-1.03,y+.45,0],wood);rounded(bed,[.08,.12,2.3],[1.03,y+.45,-.35],wood);}
  }
  for(const z of [.8,1.4]) rod(bed,[1.22,.06,z],[1.08,2.65,z],.04,wood);
  for(let i=0;i<6;i++)rod(bed,[1.2-i*.02,.3+i*.4,.8],[1.2-i*.02,.3+i*.4,1.4],.035,wood);
  return bed;
}
function createLongDesk() {
  const desk=new Group();desk.position.set(0,0,2.3);
  const wood=material("#e6bc85"), cream=material("#fff0d2");
  rounded(desk,[9.8,.14,1.25],[0,1.13,0],wood,.06);
  for(const x of [-4.55,0,4.55])for(const z of [-.43,.43])rounded(desk,[.12,1.08,.12],[x,.54,z],wood);
  for(const x of [-3.6,-1.2,1.2,3.6]) {
    rounded(desk,[.55,.04,.43],[x,1.225,-.12],cream);
    rounded(desk,[.32,.025,.035],[x+.2,1.25,.2],material("#84a997"));
  }
  return desk;
}

function createStool(x: number, z: number) {
  const stool = new Group();
  stool.position.set(x, 0, z);
  const yellow = material("#efc349", 0.62);
  const cushion = material("#ffd564", 0.8);
  cylinder(stool, 0.40, 0.39, 0.06, [0, 0.05, 0], material("#dbad48"));
  cylinder(stool, 0.44, 0.42, 0.52, [0, 0.32, 0], yellow);
  ellipsoid(stool, [0.45, 0.105, 0.45], [0, 0.60, 0], cushion);
  cylinder(stool, 0.446, 0.446, 0.025, [0, 0.55, 0], material("#efbf4a"));
  return stool;
}

export function createFurniture(layout: FurnitureLayout = {}) {
  const root = new Group();
  root.name = "home-furniture";
  const items: FurnitureItem[] = [];
  function add(id: string, label: string, group: Group, round = false) {
    group.name = id;
    // Measure relative to the anchor; the bed's ladder is deliberately off-center.
    group.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(group);
    const minX = bounds.min.x - group.position.x, maxX = bounds.max.x - group.position.x;
    const minZ = bounds.min.z - group.position.z, maxZ = bounds.max.z - group.position.z;
    const footprint: FurnitureFootprint = round
      ? { kind: "circle", radius: Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minZ), Math.abs(maxZ)) }
      : { kind: "rect", minX, maxX, minZ, maxZ };
    items.push({ id, label, group, footprint, position: { x: group.position.x, z: group.position.z } });
    root.add(group);
  }
  const window = createWindow();
  root.add(window);
  add("bunk-left", "双层床", createBunk(-3.5));
  add("bunk-right", "双层床", createBunk(2.8));
  add("long-desk", "四人长书桌", createLongDesk());
  [-3.6,-1.2,1.2,3.6].forEach((x,i)=>add(`stool-${i+1}`, "小圆凳", createStool(x,4.1), true));
  // Apply a saved layout together, so swapping two items remains valid on reload.
  const restored = items.map((item) => ({ ...item, position: layout[item.id] ?? item.position }));
  if (restored.every((item) => !placementProblem(item, item.position, restored))) {
    items.forEach((item, index) => {
      item.position = { ...restored[index].position };
      item.group.position.set(item.position.x, 0, item.position.z);
    });
  }
  return { root, items, window };
}
