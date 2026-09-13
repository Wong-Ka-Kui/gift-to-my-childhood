import { useEffect, useRef } from "react";
import {
  AmbientLight,
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MathUtils,
  MOUSE,
  OrthographicCamera,
  PCFSoftShadowMap,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
  SRGBColorSpace,
  TOUCH,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { disposeObject, loadModel } from "../lib/model";
import { createWander, stepWander, type WanderState } from "../lib/wander";
import type { ModelAsset } from "../lib/assets";
import { createRoomShell, createBackdrop, ROOM_SIZE } from "../lib/room-shell";
import { createFurniture, FURNITURE_OBSTACLES } from "../lib/furniture";
import { createPetMotion, type PetMotion } from "../lib/pet-motion";

type PetRuntime = { mover: Group; motion: PetMotion; wander: WanderState };
type Runtime = { scene: Scene; camera: OrthographicCamera; render: () => void; pet: PetRuntime | null };
export default function Room({
  asset,
  petName,
  facingYaw,
  onReady,
  onError,
}: {
  asset: ModelAsset | null;
  petName: string;
  facingYaw: number;
  onReady: () => void;
  onError: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const nameTag = useRef<HTMLDivElement>(null);
  const manualHeading = useRef<number | null>(null);
  const walking = useRef(true);

  useEffect(() => {
    const container = host.current!;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true });
    } catch {
      onError("无法启动 3D 场景，请开启浏览器硬件加速。");
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.75;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "宠物房间");
    container.appendChild(renderer.domElement);
    const scene = new Scene();
    const backdrop = createBackdrop();
    scene.background = backdrop;
    const camera = new OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
    // View predominantly along one wall, placing the rear corner to the right.
    camera.position.set(24, 18, 9.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    // Keep the isometric room angle fixed: users can pan and zoom, but never orbit.
    controls.enableRotate = false;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    // A primary-button drag (and one-finger touch) pans the room directly.
    controls.mouseButtons.LEFT = MOUSE.PAN;
    controls.touches.ONE = TOUCH.PAN;
    controls.minZoom = 0.65;
    controls.maxZoom = 2.4;
    controls.target.set(0, 0.8, 0);
    controls.update();
    scene.add(new AmbientLight(0xffffff, 0.85));
    scene.add(new HemisphereLight("#f4fcff", "#fff0d5", 0.95));
    const sun = new DirectionalLight(0xfff7e8, 1.45);
    sun.position.set(3, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.0001;
    sun.shadow.radius = 5;
    scene.add(sun);
    const room = createRoomShell();
    room.add(createFurniture());
    scene.add(room);
    const labelPosition = new Vector3();
    const render = () => {
      renderer.render(scene, camera);
      const pet = current.pet;
      const label = nameTag.current;
      if (label) {
        if (!pet) label.hidden = true;
        else {
          labelPosition.set(pet.wander.x, pet.motion.height + 0.15, pet.wander.z).project(camera);
          label.hidden = Math.abs(labelPosition.x) > 1 || Math.abs(labelPosition.y) > 1 || Math.abs(labelPosition.z) > 1;
          const x = (labelPosition.x + 1) / 2 * container.clientWidth;
          const y = (1 - labelPosition.y) / 2 * container.clientHeight;
          label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        }
      }
    };
    const current: Runtime = { scene, camera, render, pet: null };
    runtime.current = current;

    // Dragging the pet rotates its horizontal facing. Blank-space drags remain
    // available to OrbitControls for camera panning.
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const hitBounds = new Sphere();
    let rotatingPointerId: number | null = null;
    let lastPointerX = 0;
    const canvas = renderer.domElement;
    const hitPet = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const pet = current.pet;
      if (!pet) return false;
      // A lightweight body hit volume avoids ray-testing millions of animated
      // triangles on every pointer-down, especially on imported Tripo meshes.
      hitBounds.center.set(pet.wander.x, pet.motion.height * 0.5, pet.wander.z);
      hitBounds.radius = pet.motion.height * 0.38;
      return raycaster.ray.intersectsSphere(hitBounds);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!hitPet(event)) return;
      rotatingPointerId = event.pointerId;
      lastPointerX = event.clientX;
      const pet = current.pet!;
      manualHeading.current = pet.wander.yaw;
      pet.wander.targetX = pet.wander.x;
      pet.wander.targetZ = pet.wander.z;
      pet.wander.wait = 2.5;
      pet.wander.speed = 0;
      controls.enabled = false;
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (rotatingPointerId !== event.pointerId) return;
      const deltaX = event.clientX - lastPointerX;
      lastPointerX = event.clientX;
      if (manualHeading.current !== null) manualHeading.current += deltaX * 0.015;
      event.preventDefault();
      event.stopPropagation();
    };
    const stopPetRotation = (event: PointerEvent) => {
      if (rotatingPointerId !== event.pointerId) return;
      rotatingPointerId = null;
      controls.enabled = true;
      canvas.releasePointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };
    const onDoubleClick = (event: MouseEvent) => {
      if (!hitPet(event as unknown as PointerEvent)) return;
      walking.current = !walking.current;
      event.preventDefault();
      event.stopPropagation();
    };
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMove, true);
    canvas.addEventListener("pointerup", stopPetRotation, true);
    canvas.addEventListener("pointercancel", stopPetRotation, true);
    canvas.addEventListener("lostpointercapture", stopPetRotation, true);
    canvas.addEventListener("dblclick", onDoubleClick, true);

    let previousTime: number | null = null;
    renderer.setAnimationLoop((time) => {
      const delta =
        previousTime === null
          ? 0
          : Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      controls.update();
      const pet = current.pet;
      if (pet) {
        const frameDelta = document.hidden ? 0 : delta;
        if (manualHeading.current !== null) {
          const turn = Math.atan2(Math.sin(manualHeading.current - pet.wander.yaw), Math.cos(manualHeading.current - pet.wander.yaw));
          pet.wander.yaw += MathUtils.clamp(turn, -0.85 * frameDelta, 0.85 * frameDelta);
          if (rotatingPointerId === null && Math.abs(turn) < 0.015) manualHeading.current = null;
        } else if (walking.current) stepWander(pet.wander, frameDelta);
        pet.mover.position.set(pet.wander.x, 0, pet.wander.z);
        pet.mover.rotation.y = pet.wander.yaw;
        pet.motion.update(frameDelta, pet.wander);
      }
      render();
    });
    function resize() {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      const aspect = width / height;
      const span = Math.max(6.95, 8.2 / aspect);
      camera.left = -span * aspect;
      camera.right = span * aspect;
      camera.top = span;
      camera.bottom = -span;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      render();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => {
      runtime.current = null;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      disposeObject(room);
      backdrop.dispose();
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      controls.dispose();
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove, true);
      canvas.removeEventListener("pointerup", stopPetRotation, true);
      canvas.removeEventListener("pointercancel", stopPetRotation, true);
      canvas.removeEventListener("lostpointercapture", stopPetRotation, true);
      canvas.removeEventListener("dblclick", onDoubleClick, true);
      renderer.domElement.remove();
    };
  }, [onError]);

  useEffect(() => {
    if (!asset || !runtime.current) return;
    const current = runtime.current;
    let cancelled = false;
    let pet: PetRuntime | null = null;
    loadModel(asset)
      .then((model) => {
        if (cancelled) {
          disposeObject(model.root);
          return;
        }
        const size = new Box3()
          .setFromObject(model.root)
          .getSize(new Vector3());
        // A rotation-safe radius keeps the whole model inside the walls and edges.
        const motion = createPetMotion(model);
        const radius = Math.hypot(size.x, size.z) / 2 + motion.clearance;
        const mover = new Group();
        mover.add(motion.root);
        motion.root.traverse((child) => {
          if (child instanceof Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        pet = {
          mover,
          motion,
          wander: createWander(
            Math.max(0.1, ROOM_SIZE / 2 - radius - 0.4),
            Math.random,
            FURNITURE_OBSTACLES.map((obstacle) => ({
              minX: obstacle.minX - radius - 0.1,
              maxX: obstacle.maxX + radius + 0.1,
              minZ: obstacle.minZ - radius - 0.1,
              maxZ: obstacle.maxZ + radius + 0.1,
            })),
          ),
        };
        // Preserve the preview's angle relative to the viewer, not the room's axes.
        const towardViewer = current.camera.getWorldDirection(new Vector3()).negate();
        pet.wander.yaw = Math.atan2(towardViewer.x, towardViewer.z) + facingYaw;
        pet.wander.wait = 3;
        mover.position.set(pet.wander.x, 0, pet.wander.z);
        mover.rotation.y = pet.wander.yaw;
        motion.update(0, pet.wander);
        manualHeading.current = null;
        walking.current = true;
        current.pet = pet;
        current.scene.add(mover);
        current.render();
        onReady();
      })
      .catch((error) => {
        if (!cancelled)
          onError(error instanceof Error ? error.message : "模型读取失败。");
      });
    return () => {
      cancelled = true;
      if (pet) {
        if (current.pet === pet) current.pet = null;
        current.scene.remove(pet.mover);
        pet.motion.dispose();
        disposeObject(pet.mover);
      }
      if (runtime.current === current) current.render();
    };
  }, [asset, facingYaw, onReady, onError]);
  return <div ref={host} className="room-canvas"><div ref={nameTag} className="pet-name-tag" hidden>{petName}</div></div>;
}
