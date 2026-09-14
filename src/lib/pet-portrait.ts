import { AmbientLight, Box3, Color, DirectionalLight, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderTarget, type Object3D, type WebGLRenderer } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

/** Reuse the room renderer once per pet; thumbnail cards never run extra WebGL loops. */
export function capturePetPortrait(renderer: WebGLRenderer, root: Object3D, yaw: number) {
  const scene = new Scene();
  scene.background = new Color("#e8f3da");
  const model = clone(root);
  model.rotation.y += yaw;
  scene.add(model, new AmbientLight(0xffffff, 2));
  const key = new DirectionalLight(0xfff7e5, 2.5);
  key.position.set(4, 7, 5); scene.add(key);
  const box = new Box3().setFromObject(model);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3()).length();
  const camera = new PerspectiveCamera(30, 1, .01, 100);
  camera.position.copy(center).add(new Vector3(0, .22, 1).normalize().multiplyScalar(size * 1.65));
  camera.lookAt(center);
  const target = new WebGLRenderTarget(160, 160);
  target.texture.colorSpace = SRGBColorSpace;
  const previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const pixels = new Uint8Array(160 * 160 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 160, 160, pixels);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 160;
    const context = canvas.getContext("2d")!;
    const frame = context.createImageData(160, 160);
    for (let y = 0; y < 160; y++) frame.data.set(pixels.subarray((159 - y) * 640, (160 - y) * 640), y * 640);
    context.putImageData(frame, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    renderer.setRenderTarget(previous); target.dispose();
    // The temporary clone shares geometry and textures with the room pet.
    scene.clear();
  }
}
