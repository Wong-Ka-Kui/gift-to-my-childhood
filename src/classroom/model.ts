import { CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace, type Material } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createWindowView } from "../lib/window-view";
import { hingeDoor } from "../lib/door";
import { createBookcase, createCleaningStand, createWasteBin } from "../lib/life-props";

type XYZ = [number, number, number];
export const CLASSROOM_COUNTS = { windows: 2, blackboards: 1, lecterns: 1, desks: 4, chairs: 4 } as const;
export const CLASSROOM_SIZE = { width: 10, depth: 8, height: 3.8 } as const;

export function createClassroom() {
  const root = new Group(); root.name = "classroom";
  root.userData = { title: "小小教室", counts: CLASSROOM_COUNTS };
  const surface = (color: string, roughness = .8) => new MeshStandardMaterial({ color, roughness });
  const cream = surface("#f8edcf"), plaster = surface("#eee6cd"), mint = surface("#a9c4ac");
  const wood = surface("#c99c60"), lightWood = surface("#e8c68b"), woodEdge = surface("#bd8e55");
  const steel = surface("#718e80", .5), rubber = surface("#596961"), paper = surface("#fff5dc");
  const wallX = new Group(), wallZ = new Group(), wallXBack = new Group(), wallZBack = new Group();
  wallX.name = "classroom-window-wall"; wallZ.name = "classroom-blackboard-wall";
  wallXBack.name = "classroom-door-wall"; wallZBack.name = "classroom-rear-window-wall";
  root.add(wallX, wallZ, wallXBack, wallZBack);

  function box(parent: Group, name: string, size: XYZ, position: XYZ, material: Material, radius = .035) {
    const mesh = new Mesh(new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(v => v / 2))), material);
    mesh.name = name; mesh.position.set(...position); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function cylinder(parent: Group, name: string, radius: number, height: number, position: XYZ, material: Material) {
    const mesh = new Mesh(new CylinderGeometry(radius, radius, height, 20), material);
    mesh.name = name; mesh.position.set(...position); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function texture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("无法创建教室贴图，请重试。");
    draw(ctx); const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; return map;
  }
  function panel(parent: Group, name: string, width: number, height: number, position: XYZ, map: CanvasTexture) {
    const mesh = new Mesh(new PlaneGeometry(width, height), new MeshStandardMaterial({ map, roughness: .95 }));
    mesh.name = name; mesh.position.set(...position); mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  box(root, "foundation", [10.28, .3, 8.28], [0, -.17, 0], woodEdge, .1);
  const floorShades = ["#e0ca9c", "#e6d3ad", "#d9c299", "#ead7b0"].map(color => surface(color));
  for (let row = 0; row < 16; row++) for (let col = 0; col < 4; col++) {
    box(root, `floor-plank-${row}-${col}`, [2.48, .055, .488], [-3.75 + col * 2.5, -.01, -3.75 + row * .5], floorShades[(row * 7 + col * 3) % 4], .008);
  }
  // The left wall is built around real window openings; no wall sits behind glass.
  box(wallZ, "front-plaster", [10.2, 3.8, .18], [0, 1.9, -4.02], plaster);
  box(wallZ, "front-wainscot", [10, 1.02, .04], [0, .51, -3.91], mint, .012);
  box(wallZ, "front-rail", [10.1, .07, .08], [0, 1.055, -3.89], cream);
  box(wallZ, "front-cornice", [10.27, .12, .25], [0, 3.8, -4.02], cream);
  box(wallZ, "front-skirting", [10, .15, .09], [0, .085, -3.89], cream);
  box(wallX, "window-wall-lower", [.18, 1.45, 8.18], [-5.02, .725, 0], plaster);
  box(wallX, "window-wall-upper", [.18, .65, 8.18], [-5.02, 3.475, 0], plaster);
  for (const [z, width] of [[-3.525, .95], [0, 1.5], [3.525, .95]]) box(wallX, "window-wall-pier", [.18, 1.7, width], [-5.02, 2.3, z], plaster);
  box(wallX, "left-wainscot", [.04, 1.02, 8], [-4.91, .51, 0], mint);
  box(wallX, "left-rail", [.08, .07, 8], [-4.89, 1.055, 0], cream);
  box(wallX, "left-skirting", [.09, .15, 8], [-4.89, .085, 0], cream);
  box(wallX, "left-cornice", [.25, .12, 8.27], [-5.02, 3.8, 0], cream);
  // Opposite walls appear only while orbiting around the classroom.
  box(wallXBack, "right-wall-front", [.18, 3.8, 2.99], [5.02, 1.9, -2.595], plaster);
  box(wallXBack, "right-wall-rear", [.18, 3.8, 2.99], [5.02, 1.9, 2.595], plaster);
  box(wallXBack, "right-wall-header", [.18, 1, 2.2], [5.02, 3.3, 0], plaster);
  for (const z of [-2.595, 2.595]) {
    box(wallXBack, "right-wainscot", [.04, 1.02, 2.83], [4.91, .51, z], mint);
    box(wallXBack, "right-rail", [.08, .07, 2.83], [4.89, 1.055, z], cream);
    box(wallXBack, "right-skirting", [.09, .15, 2.83], [4.89, .085, z], cream);
  }
  box(wallXBack, "right-cornice", [.25, .12, 8.27], [5.02, 3.8, 0], cream);
  // School door: light oak, a real observation opening, steel kick plates,
  // lever handles and a classroom number. All parts follow the wall cutaway.
  const classroomGlass = new MeshStandardMaterial({ color: "#c4e5e4", roughness: .2, transparent: true, opacity: .24, depthWrite: false });
  for (const z of [-1.1, 1.1]) box(wallXBack, "door-jamb", [.36, 2.8, .16], [5.02, 1.4, z], steel, .015);
  box(wallXBack, "door-header", [.36, .16, 2.36], [5.02, 2.8, 0], steel, .015);
  const doorPartStart = wallXBack.children.length;
  // Leaf spans y=.03..2.67, z=-1.02..1.02; glass spans y=1.6..2.36.
  box(wallXBack, "door-lower", [.16, 1.57, 2.04], [5.02, .815, 0], lightWood, .008);
  box(wallXBack, "door-upper", [.16, .31, 2.04], [5.02, 2.515, 0], lightWood, .008);
  for (const z of [-.82, .82]) box(wallXBack, "door-stile", [.16, .76, .4], [5.02, 1.98, z], lightWood, .008);
  box(wallXBack, "door-window", [.025, .76, 1.24], [5.02, 1.98, 0], classroomGlass, .003);
  for (const x of [4.925, 5.115]) {
    for (const z of [-.62, .62]) box(wallXBack, "door-glazing-trim", [.04, .84, .055], [x, 1.98, z], woodEdge, .008);
    for (const y of [1.6, 2.36]) box(wallXBack, "door-glazing-trim", [.04, .055, 1.3], [x, y, 0], woodEdge, .008);
    box(wallXBack, "door-kick-plate", [.025, .32, 1.86], [x, .23, 0], steel, .01);
    box(wallXBack, "door-handle-plate", [.04, .28, .13], [x, 1.2, .84], steel, .01);
    const handleX = x < 5 ? x - .10 : x + .10;
    box(wallXBack, "door-handle-stem", [.14, .065, .065], [(x + handleX) / 2, 1.25, .84], steel, .018);
    box(wallXBack, "door-handle", [.065, .065, .30], [handleX, 1.25, .73], steel, .018);
  }
  hingeDoor(wallXBack, wallXBack.children.slice(doorPartStart), "classroom-door-leaf", 5.02, -1.02);
  box(wallXBack, "door-threshold", [.4, .04, 2.12], [5.02, .02, 0], steel, .006);
  box(wallXBack, "classroom-number-backing", [.08, .32, 1.15], [4.88, 3.13, 0], steel, .03);
  const doorSign = panel(wallXBack, "classroom-number", 1.05, .26, [4.835, 3.13, 0], texture(420, 104, ctx => {
    ctx.fillStyle = "#718e80"; ctx.fillRect(0, 0, 420, 104);
    ctx.fillStyle = "#fff5dc"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = 'bold 48px "PingFang SC", sans-serif'; ctx.fillText("一年一班", 210, 54);
  }));
  doorSign.rotation.y = -Math.PI / 2;
  box(wallZBack, "rear-wall-left", [3.45, 3.8, .18], [-3.28, 1.9, 4.02], plaster);
  box(wallZBack, "rear-wall-right", [3.45, 3.8, .18], [3.28, 1.9, 4.02], plaster);
  box(wallZBack, "rear-wall-window-header", [3.11, .82, .18], [0, 3.39, 4.02], plaster);
  box(wallZBack, "rear-wall-window-base", [3.11, 1.26, .18], [0, .63, 4.02], plaster);
  box(wallZBack, "rear-wainscot", [10, 1.02, .04], [0, .51, 3.91], mint, .012);
  box(wallZBack, "rear-rail", [10.1, .07, .08], [0, 1.055, 3.89], cream);
  box(wallZBack, "rear-skirting", [10, .15, .09], [0, .085, 3.89], cream);
  box(wallZBack, "rear-cornice", [10.27, .12, .25], [0, 3.8, 4.02], cream);
  const rearWindow = createWindowView(3.11, 1.72);
  rearWindow.position.set(0, 2.12, 3.99);
  rearWindow.rotation.y = Math.PI;
  wallZBack.add(rearWindow);
  box(wallZBack, "rear-window-frame-top", [3.29, .10, .15], [0, 3.03, 3.86], cream);
  box(wallZBack, "rear-window-frame-bottom", [3.29, .10, .15], [0, 1.21, 3.86], cream);
  for (const x of [-1.605, 1.605]) box(wallZBack, "rear-window-jamb", [.10, 1.82, .15], [x, 2.12, 3.86], cream);
  box(wallZBack, "rear-window-mullion", [.07, 1.72, .12], [0, 2.12, 3.84], cream);
  box(wallZBack, "rear-window-crossbar", [3.11, .055, .12], [0, 2.30, 3.84], cream);
  box(wallZBack, "rear-window-sill", [3.51, .12, .4], [0, 1.10, 3.82], lightWood);
  for (const [i, z] of [-1.9, 1.9].entries()) {
    const window = new Group(); window.name = `window-${i + 1}`; window.userData.kind = "window";
    window.position.set(-4.98, 2.3, z); window.rotation.y = Math.PI / 2; wallX.add(window);
    window.add(createWindowView(2.3, 1.7));
    for (const x of [-1.17, 1.17]) box(window, "window-jamb", [.12, 1.87, .15], [x, 0, .05], cream);
    for (const y of [-.89, .89]) box(window, "window-frame", [2.46, .12, .15], [0, y, .05], cream);
    box(window, "window-mullion", [.065, 1.7, .12], [0, 0, .08], cream, .012);
    box(window, "window-crossbar", [2.3, .055, .12], [0, .18, .08], cream, .012);
    box(window, "window-sill", [2.67, .12, .4], [0, -.99, .15], lightWood);
    box(window, "window-latch", [.035, .13, .035], [.07, -.15, .16], woodEdge, .01);
  }

  const board = new Group(); board.name = "blackboard"; board.userData.kind = "blackboard"; board.position.set(0, 2.32, -3.84); wallZ.add(board);
  box(board, "board-frame", [5.25, 1.8, .15], [0, 0, 0], wood);
  box(board, "board-slate", [5, 1.56, .04], [0, 0, .09], surface("#345e53"));
  const boardMap = texture(1280, 400, ctx => {
    ctx.fillStyle = "#345e53"; ctx.fillRect(0, 0, 1280, 400);
    ctx.fillStyle = "#edf0d9"; ctx.textAlign = "center"; ctx.font = '52px "PingFang SC", sans-serif'; ctx.fillText("今天，也要充满好奇", 640, 106);
    ctx.strokeStyle = "#c6d8b8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(145, 144); ctx.lineTo(1135, 144); ctx.stroke();
    ctx.font = 'italic 46px Georgia, serif'; ctx.fillText("A  B  C", 325, 251); ctx.fillText("1 + 1 = 2", 790, 251);
    ctx.font = '21px Georgia, serif'; ctx.fillStyle = "#bad1b6"; ctx.fillText("a little room for big ideas", 640, 340);
    ctx.strokeStyle = "#e3cf91"; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 15 : 34; const x = 1080 + Math.cos(a) * r, y = 237 + Math.sin(a) * r; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); ctx.stroke();
  });
  panel(board, "chalk-writing", 4.98, 1.54, [0, 0, .113], boardMap);
  box(board, "chalk-tray", [5.28, .065, .3], [0, -.91, .15], lightWood);
  box(board, "eraser", [.25, .075, .12], [1.55, -.84, .16], woodEdge, .015);
  for (let i = 0; i < 3; i++) box(board, "chalk", [.14, .025, .025], [-1.7 + i * .18, -.863, .16], paper, .01);

  function notebook(parent: Group, x: number, y: number, z: number, color: string) {
    const book = new Group(); book.rotation.y = -.09; book.position.set(x, y, z); parent.add(book);
    box(book, "book-cover", [.39, .055, .51], [0, .0275, 0], surface(color), .01);
    box(book, "pages", [.355, .025, .475], [.008, .041, .006], paper, .005);
    box(book, "book-top", [.39, .012, .51], [0, .06, 0], surface(color), .005);
    box(book, "book-label", [.21, .006, .115], [.025, .069, -.07], paper, .002);
  }
  const lectern = new Group(); lectern.name = "lectern"; lectern.userData.kind = "lectern"; lectern.position.set(0, .14, -2.6); root.add(lectern);
  box(root, "teaching-platform", [2.9, .14, 1.8], [0, .07, -2.9], lightWood, .045);
  box(lectern, "lectern-top", [2.65, .13, .97], [0, 1.23, 0], lightWood, .065);
  for (const x of [-1.08, 1.08]) box(lectern, "lectern-side", [.13, 1.16, .78], [x, .58, 0], wood);
  box(lectern, "lectern-front", [2.1, .76, .075], [0, .72, .33], wood);
  box(lectern, "lectern-front-inset", [1.65, .45, .025], [0, .72, .379], lightWood, .025);
  box(lectern, "lectern-shelf", [2.08, .09, .67], [0, .33, 0], woodEdge);
  notebook(lectern, -.72, 1.3, .02, "#719384");
  const cup = cylinder(lectern, "pencil-cup", .09, .15, [.87, 1.37, -.1], steel);
  for (let i = 0; i < 3; i++) { const pencil = cylinder(lectern, "pencil", .012, .27, [.84 + .026 * i, 1.5, -.1], lightWood); pencil.rotation.z = (i - 1) * .1; }
  cup.userData.decoration = true;

  // Leave a transverse aisle from the door to both columns of seats.
  for (const [index, [x, z]] of [[-2.35, -2.75], [2.35, -2.75], [-2.35, 1.65], [2.35, 1.65]].entries()) {
    const desk = new Group(); desk.name = `student-desk-${index + 1}`; desk.userData.kind = "desk"; desk.position.set(x, 0, z); root.add(desk);
    box(desk, "desk-top", [1.65, .12, .95], [0, 1.02, 0], lightWood, .055);
    box(desk, "desk-apron", [1.41, .2, .73], [0, .84, 0], wood);
    for (const dx of [-.64, .64]) for (const dz of [-.32, .32]) {
      cylinder(desk, "desk-leg", .035, .86, [dx, .43, dz], steel);
      cylinder(desk, "desk-foot", .041, .075, [dx, .0375, dz], rubber);
    }
    box(desk, "desk-crossbar", [1.3, .045, .045], [0, .31, -.32], steel, .014);
    notebook(desk, -.3, 1.08, -.02, ["#7eaaa1", "#cf9579", "#afacc3", "#9aac78"][index]);
    box(desk, "student-pencil", [.28, .024, .024], [.4, 1.095, .16], woodEdge, .005).rotation.y = -.15;
    const chair = new Group(); chair.name = `student-chair-${index + 1}`; chair.userData.kind = "chair"; chair.position.set(x, 0, z + 1.25); root.add(chair);
    box(chair, "seat", [1.04, .095, .96], [0, .56, 0], lightWood, .055);
    for (const dx of [-.42, .42]) for (const dz of [-.38, .38]) {
      cylinder(chair, "chair-leg", .03, .53, [dx, .265, dz], steel);
      cylinder(chair, "chair-foot", .035, .06, [dx, .03, dz], rubber);
    }
    for (const dx of [-.42, .42]) cylinder(chair, "back-post", .029, .6, [dx, .84, .44], steel);
    box(chair, "backrest", [1.08, .3, .07], [0, 1.01, .47], lightWood, .04);
    box(chair, "chair-crossbar", [.51, .04, .04], [0, .25, .23], steel, .01);
  }
  function floorProp(name: string, group: Group, x: number, z: number, yaw = 0) {
    group.name = name; group.userData.kind = "classroom-prop";
    group.position.set(x, 0, z); group.rotation.y = yaw; root.add(group);
  }
  // A low library beneath the rear window leaves the glass unobstructed.
  // Cleaning tools live in the front corner, clear of the cross aisle.
  floorProp("classroom-bookcase", createBookcase(2.1, 1.02), 0, 3.52, Math.PI);
  floorProp("classroom-cleaning-stand", createCleaningStand(), 4.36, -3.52);
  floorProp("classroom-waste-bin", createWasteBin("#8fa49a"), 3.55, -3.55);
  // Notices remain attached to the wall during camera cutaways.
  const notices = new Group(); notices.name = "classroom-noticeboard";
  notices.position.set(-3.45, 2.45, 3.87); notices.rotation.y = Math.PI; wallZBack.add(notices);
  box(notices, "notice-frame", [2.15, 1.24, .075], [0, 0, 0], wood);
  box(notices, "cork-board", [2.02, 1.11, .025], [0, 0, .048], surface("#ba9b72"));
  panel(notices, "classroom-notices", 1.95, 1.04, [0, 0, .064], texture(780, 416, ctx => {
    ctx.fillStyle = "#ba9b72"; ctx.fillRect(0, 0, 780, 416);
    for (const [i, title] of ["课程表", "值日表", "阅读角"].entries()) {
      const x = 26 + i * 254;
      ctx.fillStyle = ["#f4edce", "#dbe6d4", "#e6ddce"][i]; ctx.fillRect(x, 28, 222, 358);
      ctx.fillStyle = "#537367"; ctx.textAlign = "center"; ctx.font = 'bold 28px "PingFang SC", sans-serif'; ctx.fillText(title, x + 111, 88);
      ctx.fillStyle = "#9cac94"; for (let line = 0; line < 6; line++) ctx.fillRect(x + 24, 125 + line * 36, 174 - line % 2 * 36, 5);
      ctx.fillStyle = "#b77760"; ctx.beginPath(); ctx.arc(x + 111, 41, 7, 0, Math.PI * 2); ctx.fill();
    }
  }));
  // A small clock is attached to the front wall, separate from all required furniture.
  const clock = new Group(); clock.name = "wall-clock"; clock.position.set(3.65, 2.8, -3.88); wallZ.add(clock);
  const rim = cylinder(clock, "clock-rim", .3, .09, [0, 0, 0], wood); rim.rotation.x = Math.PI / 2;
  const face = cylinder(clock, "clock-face", .265, .015, [0, 0, .055], paper); face.rotation.x = Math.PI / 2;
  for (let i = 0; i < 12; i++) { const angle = i * Math.PI / 6; box(clock, "clock-tick", [.014, .035, .01], [Math.sin(angle) * .224, Math.cos(angle) * .224, .07], steel, .003).rotation.z = -angle; }
  const minuteHand = new Group(); minuteHand.name = "minute-hand"; minuteHand.position.z = .085; clock.add(minuteHand);
  const hourHand = new Group(); hourHand.name = "hour-hand"; hourHand.position.z = .088; clock.add(hourHand);
  box(minuteHand, "minute-hand-needle", [.014, .19, .01], [0, .075, 0], rubber, .003);
  box(hourHand, "hour-hand-needle", [.018, .13, .01], [0, .045, 0], rubber, .003);
  const pin = new Mesh(new SphereGeometry(.022, 12, 8), woodEdge); pin.position.z = .097; clock.add(pin);
  root.updateMatrixWorld(true);
  return { root, walls: [{ root: wallX, axis: "x" as const }, { root: wallZ, axis: "z" as const }] };
}
