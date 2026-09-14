import { Box3, ConeGeometry, DodecahedronGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry } from "three";
import type { CleanableItem } from "./home-items";

export function createCleanableModel(item: CleanableItem) {
  const root = new Group();
  root.name = `cleanable:${item.id}`;
  root.position.set(item.x, 0, item.z);
  const material = new MeshStandardMaterial({ color: item.kind === "poop" ? "#956040" : "#fffdf0", roughness: .9, flatShading: item.kind === "trash" });
  if (item.kind === "poop") {
    for (const [radius, y] of [[.22, .13], [.17, .22], [.11, .32]]) {
      const mesh = new Mesh(new SphereGeometry(radius, 18, 12), material);
      mesh.scale.set(1, .58, 1); mesh.position.y = y; root.add(mesh);
    }
    const tip = new Mesh(new ConeGeometry(.09, .17, 14), material);
    tip.position.set(.025, .39, 0); tip.rotation.z = -.24; root.add(tip);
  } else {
    const geometry = new DodecahedronGeometry(.25, 1);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const fold = .85 + .15 * Math.sin(x * 67 + y * 29 + z * 51);
      positions.setXYZ(i, x * fold, y * fold, z * fold);
    }
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, material);
    mesh.rotation.set(.25, item.createdAt % 7, .4);
    mesh.position.y = .015 - new Box3().setFromObject(mesh).min.y;
    root.add(mesh);
  }
  const ring = new Mesh(new TorusGeometry(.33, .015, 6, 32), new MeshStandardMaterial({ color: "#ecbc64", transparent: true, opacity: .7 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = .023; root.add(ring);
  root.traverse((node) => { if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true; } });
  return root;
}
