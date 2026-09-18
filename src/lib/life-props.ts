import { BackSide, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3, type Material } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const surface = (color: string, roughness = .85) => new MeshStandardMaterial({ color, roughness });
type XYZ = [number, number, number];

function box(parent: Group, size: XYZ, at: XYZ, material: Material, radius = .018) {
  const mesh = new Mesh(new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(n => n / 2))), material);
  mesh.position.set(...at); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function tube(parent: Group, radius: number, bottom: number, height: number, at: XYZ, material: Material, open = false) {
  const mesh = new Mesh(new CylinderGeometry(radius, bottom, height, 20, 1, open), material);
  mesh.position.set(...at); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function rim(parent: Group, radius: number, thickness: number, at: XYZ, material: Material) {
  const mesh = new Mesh(new TorusGeometry(radius, thickness, 6, 24), material);
  mesh.rotation.x = Math.PI / 2; mesh.position.set(...at); mesh.castShadow = true; parent.add(mesh); return mesh;
}
function rod(parent: Group, from: XYZ, to: XYZ, radius: number, material: Material) {
  const a = new Vector3(...from), b = new Vector3(...to), delta = b.clone().sub(a), mid = a.clone().add(b).multiplyScalar(.5);
  const mesh = tube(parent, radius, radius, delta.length(), [mid.x, mid.y, mid.z], material);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()); return mesh;
}

/** Low enough to sit beneath a window, with the open face toward local +Z. */
export function createBookcase(width = 2.1, height = 1.02) {
  const group = new Group();
  const wood = surface("#d3ae79"), edge = surface("#b88f5e"), paper = surface("#f5ecd6");
  const colors = ["#7eaaa1", "#bd8974", "#a4afcb", "#d7bc78", "#8b9e73"].map(color => surface(color));
  box(group, [width, height - .08, .045], [0, height / 2 + .04, -.235], edge);
  for (const x of [-width / 2 + .035, width / 2 - .035]) box(group, [.07, height, .52], [x, height / 2, 0], wood);
  for (const y of [.10, height * .51, height - .035]) box(group, [width, .07, .55], [0, y, .015], wood);
  box(group, [.055, height - .13, .48], [0, height / 2, 0], wood);
  for (let row = 0; row < 2; row++) {
    const base = (row ? height * .51 : .10) + .035;
    for (let i = 0; i < 10; i++) {
      const h = height * (.24 + (i % 3) * .035), x = -width / 2 + .18 + i * (width - .40) / 10 + (i > 4 ? .09 : 0);
      const book = new Group(); book.position.set(x, base, .025); group.add(book);
      box(book, [.095, h, .33], [0, h / 2, 0], colors[(i + row * 2) % colors.length], .006);
      box(book, [.068, h - .035, .008], [0, h / 2, -.169], paper, .002);
      for (const y of [.045, h - .045]) box(book, [.075, .014, .005], [0, y, .168], paper, .002);
    }
  }
  return group;
}

export function createWasteBin(color = "#7e9f94") {
  const group = new Group(), shell = surface(color), liner = surface("#4d625c"), lip = surface("#cbd5c5");
  // An actual open mouth with an inner wall and a recessed bottom.
  tube(group, .265, .205, .57, [0, .285, 0], shell, true);
  const inside = tube(group, .247, .19, .49, [0, .315, 0], liner, true); inside.material = liner.clone(); inside.material.side = BackSide;
  tube(group, .20, .20, .025, [0, .07, 0], liner);
  rim(group, .255, .025, [0, .56, 0], lip);
  box(group, [.17, .11, .025], [0, .32, .242], lip, .02);
  return group;
}

export function createCleaningStand() {
  const group = new Group(), metal = surface("#6f8e85"), wood = surface("#d0ab79"), bristle = surface("#d6bd81"), pan = surface("#92b6ad");
  box(group, [.78, .055, .50], [0, .0275, 0], metal);
  for (const x of [-.32, .32]) rod(group, [x, .04, -.17], [x, 1.5, -.17], .023, metal);
  rod(group, [-.32, 1.47, -.17], [.32, 1.47, -.17], .026, metal);
  // Broom rests on its bristles; the freestanding rack moves as one item.
  box(group, [.31, .09, .12], [-.18, .26, .02], wood);
  for (let i = 0; i < 9; i++) box(group, [.034, .19, .12], [-.315 + i * .034, .125, .02], bristle, .006);
  rod(group, [-.18, .3, .02], [-.09, 1.55, -.1], .023, wood);
  box(group, [.30, .03, .32], [.21, .074, .03], pan);
  box(group, [.30, .16, .035], [.21, .14, -.115], pan);
  for (const x of [.075, .345]) box(group, [.03, .095, .30], [x, .11, .03], pan);
  rod(group, [.21, .16, -.115], [.21, 1.18, -.115], .019, metal);
  rim(group, .053, .013, [.21, 1.24, -.115], metal).rotation.x = 0;
  return group;
}

export function createShoeRack() {
  const group = new Group(), wood = surface("#ceac7b"), frame = surface("#82988b"), sole = surface("#f0e7d1");
  for (const x of [-.72, .72]) for (const z of [-.27, .27]) box(group, [.055, .82, .055], [x, .41, z], frame);
  for (const y of [.11, .43, .78]) box(group, [1.55, .05, .65], [0, y, 0], wood);
  for (let pair = 0; pair < 3; pair++) for (const side of [-1, 1]) {
    const shoe = new Group(); shoe.position.set(-.47 + pair * .47 + side * .09, pair === 1 ? .46 : .14, 0); group.add(shoe);
    box(shoe, [.15, .037, .38], [0, .02, .015], sole, .028);
    box(shoe, [.145, .11, .29], [0, .073, -.02], surface(["#9cbbb1", "#ce9b85", "#8a9aa7"][pair]), .05);
    box(shoe, [.10, .012, .085], [0, .128, -.075], surface("#596b65"), .025);
  }
  return group;
}

export function createLaundryBasket() {
  const group = new Group(), wicker = surface("#c7af86"), towel = surface("#d2ded0"), cloth = surface("#afbfcc");
  box(group, [.64, .045, .57], [0, .03, 0], wicker);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) box(group, [.048, .72, .035], [-.28 + i * .093, .38, side * .27], wicker, .008);
    for (let i = 0; i < 6; i++) box(group, [.035, .72, .048], [side * .31, .38, -.24 + i * .096], wicker, .008);
    for (const y of [.13, .32, .51, .73]) {
      box(group, [.65, .035, .04], [0, y, side * .28], wicker, .008);
      box(group, [.04, .035, .57], [side * .32, y, 0], wicker, .008);
    }
  }
  box(group, [.51, .30, .44], [0, .45, 0], cloth, .1);
  box(group, [.32, .09, .50], [-.065, .66, .015], towel, .035);
  box(group, [.32, .28, .055], [-.065, .555, .30], towel, .025);
  return group;
}

export function createDeskSupplies(color: string) {
  const group = new Group(), enamel = surface(color, .5), cream = surface("#f3ead4"), graphite = surface("#65766f");
  tube(group, .09, .095, .32, [0, .16, 0], enamel);
  tube(group, .065, .065, .05, [0, .345, 0], graphite);
  box(group, [.07, .11, .012], [0, .18, .092], cream, .01);
  tube(group, .082, .078, .16, [.24, .08, 0], cream);
  for (let i = 0; i < 3; i++) rod(group, [.21 + i * .024, .04, 0], [.20 + i * .033, .27 + i % 2 * .035, 0], .009, graphite);
  return group;
}

export function createPottedPlant() {
  const group = new Group(), pot = surface("#bd8f76"), soil = surface("#655b45"), green = surface("#7c9e78");
  tube(group, .15, .11, .21, [0, .105, 0], pot);
  tube(group, .13, .13, .015, [0, .209, 0], soil);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    rod(group, [0, .20, 0], [Math.sin(angle) * .085, .38 + i % 2 * .08, Math.cos(angle) * .085], .009, green);
    const leaf = new Mesh(new SphereGeometry(1, 10, 6), green);
    leaf.position.set(Math.sin(angle) * .10, .37 + i % 2 * .08, Math.cos(angle) * .10);
    leaf.scale.set(.065, .12, .035); leaf.rotation.set(.35 * Math.cos(angle), angle, -.35 * Math.sin(angle)); leaf.castShadow = true; group.add(leaf);
  }
  return group;
}

/** Wall mounted split unit; back at local Z=0, air outlet faces +Z. */
export function createAirConditioner() {
  const group = new Group(); group.name = "wall-air-conditioner";
  const shell = surface("#f1f1e6", .48), edge = surface("#c5d1ce", .6), vent = surface("#546c69");
  box(group, [2.35, .56, .38], [0, 0, .20], shell, .09);
  box(group, [2.16, .34, .028], [0, .065, .393], shell, .04);
  box(group, [1.97, .115, .035], [0, -.175, .378], vent, .018);
  for (const y of [-.207, -.17, -.133]) box(group, [1.88, .016, .065], [0, y, .41], edge, .006).rotation.x = -.18;
  for (let i = 0; i < 7; i++) box(group, [.023, .095, .012], [-.78 + i * .26, -.173, .405], edge, .003);
  box(group, [.21, .045, .008], [-.80, .074, .413], edge, .007);
  const indicator = surface("#7cb6ad", .35);
  box(group, [.033, .025, .01], [.85, .07, .413], indicator, .009);
  // Short casing carries the pipe into the adjacent wall, never across a window.
  box(group, [.065, .075, .22], [-1.17, -.08, .095], edge);
  return group;
}
