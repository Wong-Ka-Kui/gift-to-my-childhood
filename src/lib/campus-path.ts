import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from "three";

// World coordinates, from the dormitory east door around the classroom to
// its east door. The pavement stays outside both buildings' foundations.
export const CAMPUS_ROUTE = [
  { x: 4.7, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 7 },
  { x: 24.8, z: 7 }, { x: 24.8, z: 0 }, { x: 21, z: 0 },
];
export const PATH_WIDTH = 3.2;

export function createCampusPath() {
  const root = new Group(); root.name = "campus-walkway";
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#d7c9ad"; ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    ctx.fillStyle = (x + y) % 2 ? "#f2e6cf" : "#e9dcc1";
    ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
  }
  const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; map.wrapS = map.wrapT = RepeatWrapping;
  const edge = new MeshStandardMaterial({ color: "#bcae90", roughness: .95 });
  const slabs = [[7.8, 0, 3.6, 3.2], [8, 3.5, 3.2, 3.8], [16.4, 7, 20, 3.2], [24.8, 3.5, 3.2, 3.8], [24.325, 0, 4.15, 3.2]];
  for (const [x, z, width, depth] of slabs) {
    const texture = map.clone(); texture.repeat.set(width / 1.6, depth / 1.6);
    const top = new MeshStandardMaterial({ map: texture, roughness: .9 });
    const mesh = new Mesh(new BoxGeometry(width, .22, depth), [edge, edge, top, edge, edge, edge]);
    mesh.position.set(x, -.12, z); mesh.receiveShadow = true; root.add(mesh);
  }
  map.dispose();
  return root;
}
