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
  SRGBColorSpace,
  Vector3,
  type Material,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import { placementProblem, type FurnitureFootprint, type FurnitureLayout, type PlacedFurniture } from "./furniture-layout";
import { createWindowView } from "./window-view";
import type { Seat } from "./pet-life";
import { DORM_SIDE_WINDOW } from "./room-fixtures";
import { createBookcase, createCleaningStand, createDeskSupplies, createLaundryBasket, createPottedPlant, createShoeRack, createWasteBin } from "./life-props";

type FurnitureSeat = Pick<Seat, "kind" | "backrest" | "y" | "yaw" | "width" | "depth">;
export type FurnitureItem = PlacedFurniture & { group: Group; label: string; seat?: FurnitureSeat };

export function furnitureSeats(items: readonly FurnitureItem[]): Seat[] {
  return items.flatMap(item => item.seat ? [{ ...item.seat, id: item.id, furnitureId: item.id, area: "bedroom" as const, x: item.position.x, z: item.position.z }] : []);
}

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
  window.name = "dorm-side-window";
  window.position.set(-6, DORM_SIDE_WINDOW.y, DORM_SIDE_WINDOW.z);
  window.rotation.y = Math.PI / 2;
  window.scale.x = DORM_SIDE_WINDOW.width / 2.34;
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

function createLaptop() {
  const laptop = new Group(); laptop.name = "laptop";
  const shell = material("#56626a", .4), keys = material("#d6dbd8", .55);
  rounded(laptop, [.82, .035, .55], [0, .018, 0], shell, .015);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 9; col++) {
    rounded(laptop, [.058, .008, .037], [-.3 + col * .075, .039, -.17 + row * .055], keys, .005);
  }
  rounded(laptop, [.25, .008, .105], [0, .039, .17], keys, .009);
  const lid = new Group(); lid.position.set(0, .045, -.255); lid.rotation.x = -.15; laptop.add(lid);
  rounded(lid, [.82, .52, .035], [0, .26, 0], shell, .018);
  const screen = new MeshStandardMaterial({ color: "#98d9df", emissive: "#4d8b99", emissiveIntensity: .18, roughness: .5 });
  rounded(lid, [.74, .435, .008], [0, .27, .022], screen, .01);
  rounded(lid, [.4, .25, .005], [.055, .285, .028], material("#e8f0dc"), .012);
  rounded(lid, [.4, .038, .005], [.055, .39, .032], material("#76a7ad"), .006);
  for (let row = 0; row < 3; row++) rounded(lid, [.26 - row * .04, .014, .005], [.025, .32 - row * .047, .033], material("#a8c4be"), .003);
  return laptop;
}

function createLoftBed(x: number, z: number, yaw: number, color: string) {
  const bed = new Group(); bed.position.set(x, 0, z); bed.rotation.y = yaw;
  const frame = material("#d2ddd6", .55), wood = material("#d9b582"), edge = material("#b89466");
  const cream = material("#fff2d8"), duvet = material(color, 1), metal = material("#71877f", .45);
  // Long side faces the aisle. One upper berth leaves headroom over the desk.
  for (const dx of [-1.8, 1.8]) for (const dz of [-.99, .99]) rounded(bed, [.1, 3.05, .1], [dx, 1.525, dz], frame);
  rounded(bed, [3.7, .14, 2.1], [0, 2.24, 0], frame);
  rounded(bed, [3.48, .16, 1.92], [0, 2.39, 0], cream, .075).name = "mattress";
  rounded(bed, [2.66, .07, 1.87], [.32, 2.505, 0], duvet, .04);
  rounded(bed, [.49, .13, 1.1], [-1.33, 2.525, 0], cream, .065);
  for (const dx of [-1.8, 1.8]) {
    rounded(bed, [.08, .1, 2], [dx, 2.99, 0], frame);
    for (const dz of [-.5, 0, .5]) rounded(bed, [.06, .52, .05], [dx, 2.74, dz], frame);
  }
  rounded(bed, [3.6, .1, .08], [0, 2.99, -.99], frame);
  rounded(bed, [2.72, .1, .08], [-.43, 2.99, .99], frame);
  for (const dx of [-1.3, -.55, .2, .87]) rounded(bed, [.055, .51, .055], [dx, 2.745, .99], frame);
  // A compact wardrobe and book shelf sit below the bed, beside the desk.
  rounded(bed, [.79, 2.1, 1.77], [-1.32, 1.05, -.02], wood);
  rounded(bed, [.7, 1.92, .05], [-1.32, 1.07, .88], cream, .012);
  rounded(bed, [.035, .27, .045], [-1.08, 1.12, .925], metal, .01);
  rounded(bed, [2.5, .12, 1.43], [.35, 1.13, .22], wood, .035).name = "study-desktop";
  rounded(bed, [.10, 1.07, 1.32], [1.55, .535, .2], wood);
  rounded(bed, [2.48, .5, .055], [.35, .77, -.47], edge);
  rounded(bed, [2.48, .075, .48], [.35, 1.78, -.67], wood);
  for (let i = 0; i < 5; i++) rounded(bed, [.095, .28 + i % 2 * .06, .24], [-.55 + i * .12, 1.96 + i % 2 * .03, -.65], material(["#83a69c", "#bd9482", "#e8d8ac"][i % 3]), .008);
  const laptop = createLaptop(); laptop.position.set(.27, 1.19, .34); bed.add(laptop);
  rounded(bed, [.35, .045, .44], [1.09, 1.215, .27], cream, .01);
  const supplies = createDeskSupplies(color); supplies.position.set(-.62, 1.19, .4); bed.add(supplies);
  // Ladder occupies the right-hand end, leaving desk and chair access clear.
  for (const dx of [1.18, 1.73]) rod(bed, [dx, .06, 1.17], [dx, 2.91, .99], .033, metal);
  for (let i = 0; i < 7; i++) rod(bed, [1.18, .28 + i * .38, 1.156 - i * .024], [1.73, .28 + i * .38, 1.156 - i * .024], .035, metal);
  return bed;
}

function createDormChair(x: number, z: number, yaw: number) {
  const chair = new Group(); chair.position.set(x, 0, z); chair.rotation.y = yaw;
  const steel = material("#71877f", .5), wood = material("#dfbd88"), feet = material("#58675f");
  rounded(chair, [1.04, .10, 1.02], [0, .63, 0], wood, .05);
  for (const dx of [-.43, .43]) for (const dz of [-.41, .41]) {
    rod(chair, [dx, .045, dz], [dx * .95, .60, dz * .95], .035, steel);
    cylinder(chair, .044, .044, .07, [dx, .035, dz], feet, 12);
  }
  for (const dx of [-.43, .43]) rod(chair, [dx, .56, .46], [dx, 1.30, .53], .032, steel);
  rounded(chair, [1.04, .36, .075], [0, 1.13, .515], wood, .04);
  rod(chair, [-.43, .28, .41], [.43, .28, .41], .025, steel);
  return chair;
}

export function createFurniture(layout: FurnitureLayout = {}) {
  const root = new Group();
  root.name = "home-furniture";
  const items: FurnitureItem[] = [];
  const restoredLayout = { ...layout };
  function add(id: string, label: string, group: Group, seat?: FurnitureSeat) {
    group.name = id;
    // Include the ladder and chair back in placement and navigation bounds.
    group.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(group);
    const minX = bounds.min.x - group.position.x, maxX = bounds.max.x - group.position.x;
    const minZ = bounds.min.z - group.position.z, maxZ = bounds.max.z - group.position.z;
    const footprint: FurnitureFootprint = { kind: "rect", minX, maxX, minZ, maxZ };
    items.push({ id, label, group, footprint, seat, position: { x: group.position.x, z: group.position.z } });
    root.add(group);
  }
  const window = createWindow();
  root.add(window);
  const bedColors = ["#8ab8b2", "#b5bed5", "#d7ad96", "#afbd8e"];
  // Two close-set units per wall form an L. The corner clears both ladders;
  // the east doorway opens directly onto the free centre of the room.
  for (const [i, [x, z, yaw]] of [[-.35, -4.65, 0], [3.44, -4.65, 0], [-4.65, -1.43, Math.PI / 2], [-4.65, 2.36, Math.PI / 2]].entries()) {
    // Versioned IDs ensure the earlier two-row layout cannot override this one.
    add(`dorm-l-loft-${i + 1}`, `${i + 1}号上床下桌`, createLoftBed(x, z, yaw, bedColors[i]), { kind: "bed", y: 2.54, yaw: yaw + Math.PI / 2, width: 1.92, depth: 3.48 });
    const chairX = x + .27 * Math.cos(yaw) + 2.18 * Math.sin(yaw);
    const chairZ = z - .27 * Math.sin(yaw) + 2.18 * Math.cos(yaw);
    add(`dorm-l-chair-${i + 1}`, `${i + 1}号靠背椅`, createDormChair(chairX, chairZ, yaw), { backrest: true, y: .68, yaw: yaw + Math.PI, width: 1.04, depth: 1.02 });
    // Upgrade previously saved defaults, while keeping user-arranged chairs.
    const saved = layout[`dorm-l-chair-${i + 1}`], bedSaved = layout[`dorm-l-loft-${i + 1}`];
    if (saved && Math.hypot(saved.x - x - .27 * Math.cos(yaw) - 2.38 * Math.sin(yaw), saved.z - z + .27 * Math.sin(yaw) - 2.38 * Math.cos(yaw)) < .001 &&
      (!bedSaved || Math.hypot(bedSaved.x - x, bedSaved.z - z) < .001)) {
      restoredLayout[`dorm-l-chair-${i + 1}`] = { x: chairX, z: chairZ };
    }
  }
  // Keep daily storage along the south/east edges, away from the entrance
  // and chair approaches. These share furniture movement and save handling.
  const shelf = createBookcase(2.1, .94); shelf.position.set(0, 0, 5.48); shelf.rotation.y = Math.PI;
  add("dorm-bookcase", "宿舍书架", shelf);
  const shoes = createShoeRack(); shoes.position.set(5.25, 0, 3.05); shoes.rotation.y = -Math.PI / 2;
  const plant = createPottedPlant(); plant.position.set(.51, .805, 0); shoes.add(plant);
  add("dorm-shoe-rack", "鞋架", shoes);
  const laundry = createLaundryBasket(); laundry.position.set(5.15, 0, 4.72); laundry.rotation.y = -Math.PI / 2;
  add("dorm-laundry-basket", "洗衣篮", laundry);
  const bin = createWasteBin(); bin.position.set(5.22, 0, 1.68); bin.rotation.y = -Math.PI / 2;
  add("dorm-waste-bin", "垃圾桶", bin);
  const cleaning = createCleaningStand(); cleaning.position.set(2.45, 0, 5.45); cleaning.rotation.y = Math.PI;
  add("dorm-cleaning-stand", "扫把与簸箕", cleaning);
  // Apply a saved layout together, so swapping two items remains valid on reload.
  const restored = items.map((item) => ({ ...item, position: restoredLayout[item.id] ?? item.position }));
  if (restored.every((item) => !placementProblem(item, item.position, restored))) {
    items.forEach((item, index) => {
      item.position = { ...restored[index].position };
      item.group.position.set(item.position.x, 0, item.position.z);
    });
  }
  return { root, items, window };
}
