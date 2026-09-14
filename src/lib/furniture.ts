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
  window.position.set(-5.86, 1.9, 1.95);
  window.rotation.y = Math.PI / 2;
  const wood = material("#efc790");
  const cream = material("#fff2d6");
  const glass = new MeshStandardMaterial({ color: "#fffcec", emissive: "#fff1cd", emissiveIntensity: 0.5, roughness: 0.4 });
  rounded(window, [2.6, 2.02, 0.06], [0, 0, 0], wood);
  rounded(window, [2.34, 1.78, 0.065], [0, 0, 0.065], glass, 0.008);
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

function createPlant() {
  const plant = new Group();
  const pot = material("#efa767");
  cylinder(plant, 0.16, 0.115, 0.22, [0, 0.11, 0], pot);
  cylinder(plant, 0.17, 0.17, 0.045, [0, 0.22, 0], pot);
  const leaves = material("#82b960");
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const leaf = ellipsoid(plant, [0.045, 0.24, 0.06], [Math.cos(angle) * 0.075, 0.40, Math.sin(angle) * 0.075], leaves);
    leaf.rotation.z = -Math.cos(angle) * 0.45;
    leaf.rotation.x = Math.sin(angle) * 0.45;
  }
  return plant;
}

function createBed() {
  const bed = new Group();
  bed.position.set(-4.37, 0, -3.42);
  const wood = material("#e6bc85");
  const paleWood = material("#f3d5a5");
  const darkerWood = material("#cca16d");
  const cream = material("#fff0d2");
  const duvet = new MeshStandardMaterial({ map: fabricTexture("duvet"), roughness: 1 });
  for (const x of [-1.1, 1.1]) {
    for (const z of [-1.65, 1.65]) {
      rounded(bed, [0.14, 2.94, 0.14], [x, 1.47, z], wood, 0.045);
      ellipsoid(bed, [0.081, 0.045, 0.081], [x, 2.945, z], paleWood);
    }
  }
  rounded(bed, [2.25, 0.18, 3.40], [0, 2.16, 0], wood, 0.035);
  rounded(bed, [2.06, 0.21, 3.21], [0, 2.33, 0], cream, 0.10);
  rounded(bed, [2.04, 0.17, 2.72], [0, 2.45, 0.235], duvet, 0.075);
  rounded(bed, [1.15, 0.22, 0.47], [0, 2.49, -1.18], duvet, 0.10);
  // Low rails leave the turquoise bedding visible from the room.
  for (const x of [-1.1, 1.1]) {
    rounded(bed, [0.09, 0.10, 3.33], [x, 2.78, 0], paleWood, 0.025);
    for (const z of [-1.18, -0.6, 0, 0.6, 1.18]) rounded(bed, [0.055, 0.35, 0.06], [x, 2.60, z], wood, 0.015);
  }
  for (const z of [-1.65, 1.65]) {
    rounded(bed, [2.15, 0.10, 0.09], [0, 2.78, z], paleWood, 0.025);
    for (const x of [-0.62, 0, 0.62]) rounded(bed, [0.06, 0.35, 0.055], [x, 2.60, z], wood, 0.015);
  }
  // Built-in desk and drawers beneath the loft.
  rounded(bed, [1.93, 0.13, 3.05], [0.02, 1.03, 0], paleWood, 0.045);
  rounded(bed, [1.80, 0.82, 0.66], [-0.01, 0.48, -1.15], wood, 0.055);
  for (const y of [0.30, 0.64]) {
    rounded(bed, [0.04, 0.28, 0.55], [0.91, y, -1.15], paleWood, 0.025);
    rounded(bed, [0.055, 0.045, 0.19], [0.955, y + 0.025, -1.15], darkerWood, 0.018);
  }
  rounded(bed, [1.74, 0.07, 0.75], [-0.08, 0.47, 1.20], paleWood);
  // The ladder leans subtly against the foot of the bed.
  for (const z of [0.98, 1.56]) rod(bed, [1.45, 0.08, z], [1.10, 2.66, z], 0.052, wood);
  for (let i = 0; i < 6; i++) {
    const y = 0.32 + i * 0.39;
    const x = 1.45 - (y / 2.66) * 0.35;
    rod(bed, [x, y, 0.98], [x, y, 1.56], 0.043, paleWood);
  }
  // A small open laptop makes the under-bed surface clearly read as a desk.
  const laptop = new Group();
  laptop.position.set(0.24, 1.115, -0.26);
  const lavender = material("#afa8c7", 0.55);
  rounded(laptop, [0.49, 0.035, 0.72], [0, 0, 0], lavender, 0.023);
  const screen = rounded(laptop, [0.04, 0.49, 0.72], [-0.245, 0.235, 0], lavender, 0.025);
  screen.rotation.z = -0.12;
  const display = new MeshStandardMaterial({ color: "#b7dcdd", emissive: "#83b8c4", emissiveIntensity: 0.1, roughness: 0.65 });
  const panel = rounded(laptop, [0.016, 0.40, 0.61], [-0.203, 0.24, 0], display, 0.008);
  panel.rotation.z = -0.12;
  rounded(laptop, [0.27, 0.01, 0.54], [0.04, 0.023, 0], material("#d4cedd"), 0.008);
  bed.add(laptop);
  const plant = createPlant();
  plant.position.set(-0.29, 1.10, -1.18);
  bed.add(plant);
  for (let i = 0; i < 4; i++) {
    const book = rounded(bed, [0.40, 0.07, 0.58], [0.19, 1.125 + i * 0.074, 0.72], material(["#edba7c", "#91c7be", "#f6ddaf", "#d9aaac"][i]), 0.01);
    book.rotation.y = (i % 2 ? 1 : -1) * 0.06;
  }
  return bed;
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

function createTable() {
  const table = new Group();
  table.position.set(-2, 0, 1.1);
  const wood = material("#e2b77c");
  for (const x of [-0.49, 0.49]) {
    for (const z of [-0.49, 0.49]) rod(table, [x * 1.15, 0.05, z * 1.15], [x * 0.87, 1.12, z * 0.87], 0.065, wood);
  }
  cylinder(table, 0.98, 0.98, 0.09, [0, 1.11, 0], wood, 64);
  const vertices: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const segments = 96;
  const radii = [0, 0.55, 0.96, 1.05, 1.075];
  for (let ring = 0; ring < radii.length; ring++) {
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const folds = Math.sin(angle * 12);
      const r = radii[ring] + (ring > 2 ? folds * 0.016 : 0);
      const y = ring === 4 ? 0.91 + Math.cos(angle * 12) * 0.055 : ring === 3 ? 1.11 : 1.17;
      vertices.push(Math.cos(angle) * r, y, Math.sin(angle) * r);
      uv.push(Math.cos(angle) * r * 0.48 + 0.5, Math.sin(angle) * r * 0.48 + 0.5);
      if (ring < radii.length - 1 && i < segments) {
        const a = ring * (segments + 1) + i;
        indices.push(a, a + segments + 1, a + 1, a + 1, a + segments + 1, a + segments + 2);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const cloth = new Mesh(geometry, new MeshStandardMaterial({ map: fabricTexture("gingham"), roughness: 1, side: DoubleSide }));
  cloth.castShadow = cloth.receiveShadow = true;
  table.add(cloth);
  // A tiny cream plate and pudding echo the warm, toy-like reference scene.
  cylinder(table, 0.27, 0.22, 0.035, [0, 1.195, 0], material("#fff0d4"));
  cylinder(table, 0.10, 0.16, 0.17, [0, 1.29, 0], material("#eabe78"));
  cylinder(table, 0.105, 0.105, 0.025, [0, 1.385, 0], material("#c88454"));
  ellipsoid(table, [0.04, 0.055, 0.04], [0, 1.43, 0], material("#e79387"));
  return table;
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
  add("bed", "高架床", createBed());
  add("table", "圆桌", createTable(), true);
  add("stool-front", "小圆凳", createStool(-0.35, 1.5), true);
  add("stool-back", "小圆凳", createStool(-2.07, -3.13), true);
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
