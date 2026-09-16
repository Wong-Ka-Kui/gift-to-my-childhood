import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from "three";

/** A recessed outdoor view; the day/night scene controller supplies the live sky map. */
export function createWindowView(width: number, height: number) {
  const view = new Group();
  view.name = "window-view";
  // Keep the animated sky visible while allowing the real scene behind the
  // opening (including the opposite wall during orbit) to show through.
  const sky = new MeshBasicMaterial({ color: "#ffffff", side: DoubleSide, toneMapped: false, transparent: true, opacity: .42, depthWrite: false });
  sky.userData.dayNightWindow = true;
  const pane = new Mesh(new PlaneGeometry(width, height), sky);
  pane.name = "window-outside-view";
  pane.position.z = -.065;
  // This plane depicts distant scenery. It must never cast a rectangular shadow.
  pane.castShadow = pane.receiveShadow = false;
  pane.renderOrder = 2;
  view.add(pane);

  const reveal = new MeshStandardMaterial({ color: "#c7b9a0", roughness: .85 });
  for (const side of [-1, 1]) {
    const jamb = new Mesh(new BoxGeometry(.045, height, .17), reveal);
    jamb.position.set(side * width / 2, 0, .012);
    const lintel = new Mesh(new BoxGeometry(width, .045, .17), reveal);
    lintel.position.set(0, side * height / 2, .012);
    jamb.receiveShadow = lintel.receiveShadow = true;
    view.add(jamb, lintel);
  }

  // Narrow reflections leave the panorama clear and avoid an opaque glowing pane at night.
  const reflection = new MeshBasicMaterial({ color: "#e7f8ff", opacity: .075, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false });
  for (const [x, stripeWidth] of [[-.29, .025], [.32, .012]]) {
    const glint = new Mesh(new PlaneGeometry(width * stripeWidth, height * .68), reflection);
    glint.position.set(x * width, height * .035, -.035);
    glint.rotation.z = -.16;
    glint.name = "window-glass-reflection";
    view.add(glint);
  }
  return view;
}
