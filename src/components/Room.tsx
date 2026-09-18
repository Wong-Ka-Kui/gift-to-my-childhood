import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
  Box3,
  Group,
  Mesh,
  Plane,
  OrthographicCamera,
  PCFSoftShadowMap,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
  SRGBColorSpace,
  type Material,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { disposeObject, loadModel } from "../lib/model";
import { createWander, resumeWander, type WanderState } from "../lib/wander";
import { MAX_PETS, type PetRecord } from "../lib/pets";
import { AREA, scheduledArea, requiredRoutine, requestBed, worldX, obstaclesFor, spawnPoint, freePoint, requestSeat, standUp, cancelSeat, stepLife, type PetLife, type LifeWorld, type Seat, type Solid } from "../lib/pet-life";
import { getGameTime } from "../lib/game-time";
import { createRoomShell } from "../lib/room-shell";
import { createFurniture, furnitureSeats, type FurnitureItem } from "../lib/furniture";
import { createFurnitureEditor } from "../lib/furniture-editor";
import { furnitureObstacle, type FurnitureLayout } from "../lib/furniture-layout";
import { CARE_TICK_MS, CLEANABLE_RADIUS, type CareTick, type CleanableItem } from "../lib/home-items";
import { createDayNight } from "../lib/day-night";
import { isWorldVisible } from "../lib/visibility";
import { createCleanableModel } from "../lib/cleanable-model";
import { capturePetPortrait } from "../lib/pet-portrait";
import { createRoomView, createWallCutaway, DEFAULT_ROOM_POSITION, DEFAULT_ROOM_TARGET } from "../lib/room-view";
import { createPetMotion, type PetMotion } from "../lib/pet-motion";
import { createClassroom } from "../classroom/model";
import { createCampusPath } from "../lib/campus-path";

import type { WanderObstacle } from "../lib/wander";
const CLASSROOM_OFFSET = 16;
const CLASSROOM_SCALE = 1.25;

type PetRuntime = PetLife & {
  id: string;
  name: string;
  mover: Group;
  motion: PetMotion;
  wander: WanderState;
  radius: number;
  label: HTMLDivElement;
  walking: boolean;
  manualHeading: number | null;
  materials: { material: Material; opacity: number; transparent: boolean; depthWrite: boolean }[];
  lastOpacity: number;
  landing: number;
};
type Runtime = {
  scene: Scene;
  renderer: WebGLRenderer;
  cleanables: Map<string, { item: CleanableItem; model: Group; button: HTMLButtonElement }>;
  camera: OrthographicCamera;
  view: ReturnType<typeof createRoomView>;
  render: () => void;
  pets: Map<string, PetRuntime>;
  loading: Set<string>;
  disposed: boolean;
  furniture: FurnitureItem[];
  classroom: Group;
  classroomObstacles: WanderObstacle[];
  life: LifeWorld;
};

function disposePet(pet: PetRuntime) {
  pet.mover.removeFromParent();
  pet.label.remove();
  pet.motion.dispose();
  disposeObject(pet.mover);
}

function petObstacles(current: Runtime, pet: PetRuntime) {
  return obstaclesFor(current.life, pet.area, pet.radius);
}
function updateNeighbors(pet: PetRuntime, current: Runtime) {
  pet.wander.neighbors = Array.from(current.pets.values()).filter(other=>other!==pet&&other.area===pet.area)
    .map(other=>({x:other.wander.x,z:other.wander.z,radius:pet.radius+other.radius+.18}));
}
function petY(pet: PetRuntime) {
  if(!pet.seat)return 0;
  if(pet.seat.kind==="bed")return pet.seat.y+.38;
  const t=pet.sitBlend;
  if(pet.seatPhase>=0&&pet.approach&&Math.hypot(pet.approach.x-pet.seat.x,pet.approach.z-pet.seat.z)<.001)
    return pet.seat.y+.05-pet.motion.seatHeight*t;
  // Lift above the cushion while entering/leaving it, then settle onto it.
  return Math.max(0,pet.seat.y-pet.motion.seatHeight+.05)*t + Math.sin(Math.PI*t)*.32;
}

export default function Room({
  pets,
  initialLayout,
  timeOrigin,
  cleanables,
  paused,
  viewReset,
  focusArea,
  onCareTick,
  onClean,
  onPortrait,
  onFurnitureEditing,
  onFurnitureLayout,
  onReady,
  onError,
  onPetError,
}: {
  pets: readonly PetRecord[];
  initialLayout: FurnitureLayout;
  timeOrigin: number;
  cleanables: readonly CleanableItem[];
  paused: boolean;
  viewReset: number;
  focusArea: "all" | "bedroom" | "classroom";
  onCareTick: (tick: CareTick) => void;
  onClean: (id: string) => Promise<void>;
  onPortrait: (id: string, portrait: string) => void;
  onFurnitureEditing: (active: boolean) => void;
  onFurnitureLayout: (layout: FurnitureLayout) => void;
  onReady: (id: string) => void;
  onError: (message: string) => void;
  onPetError: (id: string, message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const startingLayout = useRef(initialLayout);
  const callbacks = useRef({ paused, onCareTick, onClean, onPortrait });
  callbacks.current = { paused, onCareTick, onClean, onPortrait };

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
    renderer.localClippingEnabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "宠物房间");
    container.appendChild(renderer.domElement);
    const scene = new Scene();
    const camera = new OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
    // View predominantly along one wall, placing the rear corner to the right.
    camera.position.copy(DEFAULT_ROOM_POSITION);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minZoom = 0.65;
    controls.maxZoom = 2.4;
    controls.target.copy(DEFAULT_ROOM_TARGET);
    controls.update();
    const view = createRoomView(camera, controls, renderer.domElement);
    const room = createRoomShell();
    const furniture = createFurniture(startingLayout.current);
    room.add(furniture.root);
    scene.add(room);
    const classroom = createClassroom();
    classroom.root.scale.setScalar(CLASSROOM_SCALE);
    classroom.root.updateMatrixWorld(true);
    const classroomObstacles: Solid[] = [];
    for (const item of classroom.root.children) {
      if (!["desk", "chair", "lectern", "classroom-prop"].includes(item.userData.kind) && item.name !== "teaching-platform") continue;
      const b = new Box3().setFromObject(item);
      classroomObstacles.push({ id: item.name, minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z });
    }
    classroom.root.position.x = CLASSROOM_OFFSET;
    scene.add(classroom.root);
    const campusPath = createCampusPath(); scene.add(campusPath);
    const doors = [
      { leaf: room.getObjectByName("home-door-leaf")!, x: 6.03 },
      { leaf: classroom.root.getObjectByName("classroom-door-leaf")!, x: CLASSROOM_OFFSET + 5.02 * CLASSROOM_SCALE },
    ];
    const classroomFixtures = [...classroom.root.children];
    const cutaway = createWallCutaway([
      { root: room.getObjectByName("room-wall-x")!, axis: "x", side: -1, center: 0 },
      { root: room.getObjectByName("room-wall-z")!, axis: "z", side: -1, center: 0 },
      { root: room.getObjectByName("room-wall-x-back")!, axis: "x", side: 1, center: 0 },
      { root: room.getObjectByName("room-wall-z-back")!, axis: "z", side: 1, center: 0 },
      { root: furniture.window, axis: "x", side: -1, center: 0 },
      { root: classroom.walls[0].root, axis: "x", side: -1, center: CLASSROOM_OFFSET },
      { root: classroom.walls[1].root, axis: "z", side: -1, center: 0 },
      { root: classroom.root.getObjectByName("classroom-door-wall")!, axis: "x", side: 1, center: CLASSROOM_OFFSET },
      { root: classroom.root.getObjectByName("classroom-rear-window-wall")!, axis: "z", side: 1, center: 0 },
    ]);
    const dayNight = createDayNight(scene, [room, classroom.root], timeOrigin);
    const labelPosition = new Vector3();
    const itemPosition = new Vector3();
    const itemRay = new Raycaster();
    const itemPointer = new Vector2();
    const occlusionSphere = new Sphere();
    const occlusionHit = new Vector3();
    let lastOcclusionCheck = -Infinity;
    const render = () => {
      dayNight.update();
      cutaway.update(camera);
      renderer.render(scene, camera);
      const checkOcclusion = performance.now() - lastOcclusionCheck > 180;
      if (checkOcclusion) lastOcclusionCheck = performance.now();

      for (const { item, button } of current.cleanables.values()) {
        itemPosition.set(item.x, .24, item.z).project(camera);
        const hidden = Math.abs(itemPosition.x) > 1 || Math.abs(itemPosition.y) > 1 || Math.abs(itemPosition.z) > 1;
        if (!hidden && checkOcclusion) {
          itemPointer.set(itemPosition.x, itemPosition.y); itemRay.setFromCamera(itemPointer, camera);
          const point = new Vector3(item.x, .24, item.z);
          itemRay.far = Math.max(0, point.distanceTo(itemRay.ray.origin) - .3);
          let occluded = itemRay.intersectObjects([furniture.root, ...classroomFixtures], true).some(hit => isWorldVisible(hit.object));
          // Pet models can contain millions of triangles. Match their interaction
          // spheres instead of raycasting all those triangles for each floor item.
          if (!occluded) for (const pet of current.pets.values()) {
            occlusionSphere.center.set(worldX(pet), petY(pet) + pet.motion.height * .5, pet.wander.z);
            occlusionSphere.radius = pet.motion.height * .42;
            if (itemRay.ray.intersectSphere(occlusionSphere, occlusionHit) && itemRay.ray.origin.distanceTo(occlusionHit) < itemRay.far) { occluded = true; break; }
          }
          button.dataset.occluded = String(occluded);
        }
        button.hidden = hidden || button.dataset.occluded === "true";
        button.disabled = callbacks.current.paused || furnitureEditor.active || button.dataset.busy === "true";
        button.style.transform = `translate(${(itemPosition.x + 1) / 2 * container.clientWidth}px, ${(1 - itemPosition.y) / 2 * container.clientHeight}px) translate(-50%, -50%)`;
      }
      for (const pet of current.pets.values()) {
          const label = pet.label;
          labelPosition.set(worldX(pet), petY(pet) + (pet.sleepBlend ? .55 : pet.motion.height) + 0.15, pet.wander.z).project(camera);
          label.style.opacity=String(pet.opacity);
          label.hidden = Math.abs(labelPosition.x) > 1 || Math.abs(labelPosition.y) > 1 || Math.abs(labelPosition.z) > 1;
          const x = (labelPosition.x + 1) / 2 * container.clientWidth;
          const y = (1 - labelPosition.y) / 2 * container.clientHeight;
          label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
    };
    const petMap = new Map<string, PetRuntime>();
    const life: LifeWorld = {
      pets: petMap, timeOrigin,
      solids(area) {
        const solid: Solid[] = area === "bedroom" ? furniture.items.map(item=>({...furnitureObstacle(item),id:item.id})) : classroomObstacles;
        return [...solid, ...Array.from(current.cleanables.values(),({item})=>({id:item.id,minX:item.x-AREA[area].offset-.28,maxX:item.x-AREA[area].offset+.28,minZ:item.z-.28,maxZ:item.z+.28}))];
      },
      seats() {
        const seats: Seat[] = furnitureSeats(furniture.items);
        classroom.root.children.filter(item=>item.userData.kind==="chair").forEach(item=>seats.push({id:item.name,area:"classroom",x:item.position.x*CLASSROOM_SCALE,z:item.position.z*CLASSROOM_SCALE,y:.6075*CLASSROOM_SCALE,yaw:Math.PI,width:1.04*CLASSROOM_SCALE,depth:.96*CLASSROOM_SCALE}));
        return seats;
      },
    };
    const current: Runtime = { scene, renderer, cleanables: new Map(), camera, view, render, pets: petMap, loading: new Set(), disposed: false, furniture: furniture.items, classroom: classroom.root, classroomObstacles, life };
    runtime.current = current;

    // Drag pets onto the floor or beside a seat; Shift-drag adjusts facing.
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const hitBounds = new Sphere();
    const intersection = new Vector3();
    let gesture: { pet: PetRuntime; pointer: number; startX: number; startY: number; lastX: number; dragging: boolean; rotate: boolean; drop: Vector3 | null; offset: Vector3 } | null = null;
    let lastTap: { id: string; time: number; x: number; y: number } | null = null;
    let lastToggle: { id: string; time: number } | null = null;
    let lastDragTime = -Infinity;
    let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
    const canvas = renderer.domElement;
    const floorPlane = new Plane(new Vector3(0,1,0),0);
    const floorPoint = (event: MouseEvent) => {
      const rect=canvas.getBoundingClientRect();
      pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
      raycaster.setFromCamera(pointer,camera);
      return raycaster.ray.intersectPlane(floorPlane,new Vector3());
    };
    const say = (message: string) => { if(feedback.current)feedback.current.textContent=message;clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>{if(feedback.current)feedback.current.textContent="";},2200); };

    const hitPet = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      let nearest: PetRuntime | null = null;
      let nearestDistance = Infinity;
      for (const pet of current.pets.values()) {
        hitBounds.center.set(worldX(pet), petY(pet) + (pet.sleepBlend ? .2 : pet.motion.height * 0.5), pet.wander.z);
        hitBounds.radius = pet.motion.height * 0.42;
        if (raycaster.ray.intersectSphere(hitBounds, intersection)) {
          const distance = raycaster.ray.origin.distanceToSquared(intersection);
          if (distance < nearestDistance) { nearestDistance = distance; nearest = pet; }
        }
      }
      return nearest;
    };
    const toggleWalking = (pet: PetRuntime, time: number) => {
      tickCare();
      if(requiredRoutine(getGameTime(timeOrigin).minuteOfDay)!=="free"){say("现在是规定作息时间，稍后再一起玩");return;}
      if(pet.seat){ if(pet.sitBlend>0) standUp(life,pet);else cancelSeat(pet);pet.walking=true;return; }
      pet.walking = !pet.walking;
      pet.manualHeading = null;
      pet.wander.speed = 0;
      if (pet.walking) {
        updateNeighbors(pet, current);
        resumeWander(pet.wander);
      }
      lastToggle = { id: pet.id, time };
      if (feedback.current) feedback.current.textContent = `${pet.name}${pet.walking ? "开始活动" : "已停止"}`;
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => { if (feedback.current) feedback.current.textContent = ""; }, 1600);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (callbacks.current.paused || furnitureEditor.active || event.button !== 0 || gesture) return;
      const pet = hitPet(event);
      if (!pet || pet.destination || pet.relocation) { lastTap = null; return; }
      if(requiredRoutine(getGameTime(timeOrigin).minuteOfDay)!=="free"){say("现在是规定作息时间，稍后再一起玩");event.stopPropagation();return;}
      gesture = { pet, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, dragging: false, rotate: event.shiftKey, drop: null, offset: new Vector3(worldX(pet),0,pet.wander.z).sub(floorPoint(event) ?? new Vector3(worldX(pet),0,pet.wander.z)) };
      controls.enabled = false;
      canvas.setPointerCapture?.(event.pointerId);
      event.stopPropagation();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      const { pet } = gesture;
      if (!gesture.dragging && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 5) {
        gesture.dragging = true;
        lastTap = null;
        pet.manualHeading = pet.wander.yaw;
        pet.wander.targetX = pet.wander.x;
        pet.wander.targetZ = pet.wander.z;
        pet.wander.wait = 1.2;
        pet.wander.speed = 0;
      }
      if (gesture.dragging) {
        if(gesture.rotate) pet.manualHeading! += (event.clientX - gesture.lastX) * 0.015;
        else {
          const point=floorPoint(event)?.add(gesture.offset);
          if(point){gesture.drop=point;pet.mover.position.set(point.x,.4,point.z);say("拖到凳旁坐下，拖到床垫上睡觉");}
        }
      }
      gesture.lastX = event.clientX;
      event.preventDefault();
      event.stopPropagation();
    };
    const stopPetRotation = (event: PointerEvent) => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      const completed = gesture;
      gesture = null;
      controls.enabled = true;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (completed.dragging) {
        if(!completed.rotate)completed.pet.landing=.4;
        lastDragTime = event.timeStamp; lastTap = null;
        if(!completed.rotate && completed.drop && event.type==="pointerup") {
          const pet=completed.pet, drop=completed.drop;
          const rect=canvas.getBoundingClientRect();
          const cushion=life.seats().filter(s=>s.kind!=="bed"&&s.area===pet.area).map(s=>{const v=new Vector3(s.x+AREA[s.area].offset,s.y,s.z).project(camera);return {s,d:Math.hypot(rect.left+(v.x+1)/2*rect.width-event.clientX,rect.top+(1-v.y)/2*rect.height-event.clientY)};}).sort((a,b)=>a.d-b.d)[0];
          const seat=(cushion&&cushion.d<42?cushion.s:undefined)??life.seats().filter(s=>s.kind!=="bed"&&s.area===pet.area&&Math.hypot(s.x+AREA[s.area].offset-drop.x,s.z-drop.z)<1.6).sort((a,b)=>Math.hypot(a.x+AREA[a.area].offset-drop.x,a.z-drop.z)-Math.hypot(b.x+AREA[b.area].offset-drop.x,b.z-drop.z))[0];
          const bed=life.seats().filter(s=>s.kind==="bed"&&s.area===pet.area).map(s=>{const v=new Vector3(s.x,s.y,s.z).project(camera);return {s,d:Math.hypot(rect.left+(v.x+1)/2*rect.width-event.clientX,rect.top+(1-v.y)/2*rect.height-event.clientY)};}).sort((a,b)=>a.d-b.d)[0];
          if(requiredRoutine(getGameTime(timeOrigin).minuteOfDay)!=="free"){say("已到作息时间，奶蛙要遵守作息啦");}
          else if(bed&&bed.d<60){say(requestBed(life,pet,bed.s)?`${pet.name}准备睡觉`:"这个床位已有伙伴了");}
          else if(pet.seat?.kind==="bed"){standUp(life,pet);say("奶蛙起床啦");}
          else if(pet.seat && pet.sitBlend>0){standUp(life,pet);say("先从凳子上起立，再拖动到其他位置");}
          else if(seat){cancelSeat(pet);say(requestSeat(life,pet,seat,true)?`${pet.name}准备坐下`:"这个座位已占用或被挡住了");}
          else if(freePoint(life,pet,pet.area,drop.x-AREA[pet.area].offset,drop.z)){
            cancelSeat(pet);pet.wander.x=drop.x-AREA[pet.area].offset;pet.wander.z=drop.z;pet.wander.targetX=pet.wander.x;pet.wander.targetZ=pet.wander.z;pet.wander.wait=1;pet.manualHeading=null;say(`${pet.name}已放下`);
          }else say("这里无法放置，已回到原处");
          pet.manualHeading=null;
        }
      }
      else if (event.type === "pointerup") {
        if (lastTap?.id === completed.pet.id && event.timeStamp - lastTap.time < 400 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 24) {
          toggleWalking(completed.pet, event.timeStamp);
          lastTap = null;
        } else lastTap = { id: completed.pet.id, time: event.timeStamp, x: event.clientX, y: event.clientY };
      } else lastTap = null;
      event.stopPropagation();
    };
    const onDoubleClick = (event: MouseEvent) => {
      const pet = hitPet(event);
      if (callbacks.current.paused || !pet || event.timeStamp - lastDragTime < 400) return;
      // Pointer-up handles mouse double taps and touch. Native dblclick is a
      // fallback, not a second toggle of the same gesture.
      if (!(lastToggle?.id === pet.id && event.timeStamp - lastToggle.time < 100)) toggleWalking(pet, event.timeStamp);
      lastTap = null;
      event.preventDefault();
      event.stopPropagation();
    };
    const furnitureEditor = createFurnitureEditor({
      canvas, camera, scene, controls, furniture,
      getPets: () => Array.from(current.pets.values(), (pet) => ({ x: worldX(pet), z: pet.wander.z, radius: pet.radius, height: pet.motion.height + petY(pet) })),
      canEdit: () => requiredRoutine(getGameTime(timeOrigin).minuteOfDay)==="free" && !callbacks.current.paused && !gesture && !current.loading.size && ![...current.pets.values()].some(pet => pet.destination),
      getCleanables: () => Array.from(current.cleanables.values(), ({ item }) => ({ ...item, radius: CLEANABLE_RADIUS })),
      onActive: (active) => {
        lastTap = null;
        if (active) for (const pet of current.pets.values()) pet.wander.speed = 0;
        onFurnitureEditing(active);
      },
      onCommit: (layout) => {
        for (const pet of current.pets.values()) {
          pet.wander.obstacles = petObstacles(current, pet);
          pet.wander.targetX = pet.wander.x;
          pet.wander.targetZ = pet.wander.z;
          pet.wander.speed = 0;
          pet.wander.wait = 0.8;
        }
        onFurnitureLayout(layout);
      },
    });
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMove, true);
    canvas.addEventListener("pointerup", stopPetRotation, true);
    canvas.addEventListener("pointercancel", stopPetRotation, true);
    canvas.addEventListener("lostpointercapture", stopPetRotation, true);
    canvas.addEventListener("dblclick", onDoubleClick, true);

    let careTime = Date.now();
    let wasVisible = !document.hidden;
    const tickCare = () => {
      const now = Date.now(), from = careTime;
      careTime = now;
      if (!wasVisible || callbacks.current.paused || furnitureEditor.active || current.loading.size) return;
      callbacks.current.onCareTick({
        from, to: now,
        pets: Array.from(current.pets.values(), (pet) => ({ id: pet.id, x: worldX(pet), z: pet.wander.z, radius: pet.radius, yaw: pet.wander.yaw, active: pet.walking && !pet.seat && !pet.destination && gesture?.pet !== pet })),
        obstacles: [
          ...life.solids(scheduledArea(getGameTime(timeOrigin).minuteOfDay)).map(o => ({...o,minX:o.minX+AREA[scheduledArea(getGameTime(timeOrigin).minuteOfDay)].offset,maxX:o.maxX+AREA[scheduledArea(getGameTime(timeOrigin).minuteOfDay)].offset})),
          // Keep new litter away from both entrances so it cannot block school traffic.
          { minX: 4, maxX: 6.2, minZ: -1.2, maxZ: 1.2 },
          { minX: 20.1, maxX: 22.3, minZ: -1.2, maxZ: 1.2 },
        ],
        area: { centerX: AREA[scheduledArea(getGameTime(timeOrigin).minuteOfDay)].offset, halfWidth: 5.6, halfDepth: scheduledArea(getGameTime(timeOrigin).minuteOfDay)==="bedroom"?5.4:4.4 },
      });
    };
    const careVisibility = () => { tickCare(); wasVisible = !document.hidden; careTime = Date.now(); };
    const careTimer = setInterval(tickCare, CARE_TICK_MS);
    document.addEventListener("visibilitychange", careVisibility);
    window.addEventListener("pagehide", tickCare);
    let previousTime: number | null = null;
    renderer.setAnimationLoop((time) => {
      const delta =
        previousTime === null
          ? 0
          : Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      // A drag that spans a schedule boundary must not hold a pet out of class
      // or bed indefinitely. Release capture and let the routine take over.
      if(gesture && requiredRoutine(getGameTime(timeOrigin).minuteOfDay)!=="free") {
        const pointerId=gesture.pointer;gesture=null;controls.enabled=true;lastTap=null;
        if(canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);
      }
      if (controls.enabled) controls.update();
      furnitureEditor.update();
      for (const pet of current.pets.values()) {
        const frameDelta = document.hidden ? 0 : delta;
        if (furnitureEditor.active || callbacks.current.paused) { pet.wander.speed = 0; }
        else stepLife(life,pet,frameDelta,gesture?.pet===pet);
        const carried=gesture?.pet===pet&&gesture.dragging&&!gesture.rotate;
        if(!carried){pet.landing*=Math.exp(-18*frameDelta);if(pet.landing<.001)pet.landing=0;pet.mover.position.set(worldX(pet),petY(pet)+pet.landing,pet.wander.z);}
        if(gesture?.pet===pet&&gesture.rotate&&pet.manualHeading!==null)pet.wander.yaw=pet.manualHeading;
        if(pet.lastOpacity!==pet.opacity){
          for(const original of pet.materials){const m=original.material;const transparent=original.transparent||pet.opacity<1;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.opacity=original.opacity*pet.opacity;m.depthWrite=original.depthWrite&&pet.opacity===1;}
          pet.lastOpacity=pet.opacity;
        }
        pet.mover.rotation.y = pet.wander.yaw;
        pet.motion.update(frameDelta,{...pet.wander,carried,sitting:carried?0:pet.sitBlend,sleeping:carried?0:pet.sleepBlend??0});
      }
      for (const door of doors) {
        const open = [...current.pets.values()].some(pet => pet.commute && Math.hypot(worldX(pet) - door.x, pet.wander.z) < 3.5);
        door.leaf.rotation.y += ((open ? Math.PI / 2 : 0) - door.leaf.rotation.y) * Math.min(1, delta * 7);
      }
      render();
    });
    function resize() {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      const aspect = width / height;
      const span = Math.max(10.2, 17 / aspect);
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
      clearInterval(careTimer);
      document.removeEventListener("visibilitychange", careVisibility);
      window.removeEventListener("pagehide", tickCare);
      for (const entry of current.cleanables.values()) { entry.button.remove(); entry.model.removeFromParent(); disposeObject(entry.model); }
      current.cleanables.clear();
      view.dispose();
      dayNight.dispose();
      cutaway.dispose();
      furnitureEditor.dispose();
      runtime.current = null;
      current.disposed = true;
      current.loading.clear();
      for (const pet of current.pets.values()) disposePet(pet);
      current.pets.clear();
      clearTimeout(feedbackTimer);
      renderer.setAnimationLoop(null);
      observer.disconnect();
      disposeObject(room);
      disposeObject(classroom.root);
      disposeObject(campusPath);
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
  }, [onError, onFurnitureEditing, onFurnitureLayout, timeOrigin]);

  useEffect(() => {
    runtime.current?.view.focus(focusArea);
  }, [focusArea]);

  const lastViewReset = useRef(viewReset);
  useEffect(() => {
    if (viewReset !== lastViewReset.current) {
      lastViewReset.current = viewReset;
      runtime.current?.view.reset();
    }
  }, [viewReset]);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    const ids = new Set(cleanables.map((item) => item.id));
    for (const [id, entry] of current.cleanables) if (!ids.has(id)) {
      entry.button.remove(); entry.model.removeFromParent(); disposeObject(entry.model); current.cleanables.delete(id);
    }
    for (const item of cleanables) {
      if (current.cleanables.has(item.id)) continue;
      const model = createCleanableModel(item);
      const button = document.createElement("button");
      button.type = "button"; button.className = "cleanable-target";
      button.setAttribute("aria-label", `清扫${item.kind === "poop" ? "便便" : "纸团"}，获得 5 金币`);
      button.title = "点击清扫 · +5 金币";
      button.innerHTML = '<span aria-hidden="true">✦ +5</span>';
      let press: { x: number; y: number } | null = null;
      let dragged = false;
      button.addEventListener("pointerdown", (event) => { press = { x: event.clientX, y: event.clientY }; dragged = false; button.setPointerCapture(event.pointerId); });
      button.addEventListener("pointermove", (event) => { if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) dragged = true; });
      button.addEventListener("pointerup", () => { press = null; });
      button.addEventListener("pointercancel", () => { press = null; dragged = true; });
      button.addEventListener("click", async (event) => {
        if ((event.detail > 0 && dragged) || button.disabled || callbacks.current.paused) return;
        button.dataset.busy = "true"; button.disabled = true;
        try { await callbacks.current.onClean(item.id); }
        finally { button.dataset.busy = "false"; button.disabled = false; }
      });
      current.cleanables.set(item.id, { item, model, button });
      current.scene.add(model); host.current!.append(button);
    }
    for (const pet of current.pets.values()) {
      pet.wander.obstacles = petObstacles(current, pet);
      pet.wander.targetX = pet.wander.x; pet.wander.targetZ = pet.wander.z; pet.wander.speed = 0;
    }
  }, [cleanables]);

  useEffect(() => {
    if (!runtime.current) return;
    const current = runtime.current;
    const ids = new Set(pets.map((pet) => pet.id));
    for (const [id, pet] of current.pets) {
      if (!ids.has(id)) { disposePet(pet); current.pets.delete(id); }
    }
    for (const id of current.loading) if (!ids.has(id)) current.loading.delete(id);
    for (const record of pets) {
      if (current.pets.has(record.id) || current.loading.has(record.id)) continue;
      if (current.pets.size + current.loading.size >= MAX_PETS) {
        onPetError(record.id, "房间最多可以放置 4 只宠物。");
        continue;
      }
      current.loading.add(record.id);
      let motion: PetMotion | null = null;
      loadModel(record.asset)
      .then((model) => {
        if (current.disposed || !current.loading.has(record.id)) {
          disposeObject(model.root);
          return;
        }
        const size = new Box3()
          .setFromObject(model.root)
          .getSize(new Vector3());
        // A rotation-safe radius keeps the whole model inside the walls and edges.
        motion = createPetMotion(model);
        if (!record.portrait) {
          try { callbacks.current.onPortrait(record.id, capturePetPortrait(current.renderer, motion.root, record.profile.facingYaw)); }
          catch { /* A thumbnail failure must not prevent a saved pet from loading. */ }
        }
        const radius = Math.hypot(size.x, size.z) / 2 + motion.clearance;
        const area=scheduledArea(getGameTime(current.life.timeOrigin).minuteOfDay);
        const mover = new Group();
        mover.add(motion.root);
        motion.root.traverse((child) => {
          if (child instanceof Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        const label = document.createElement("div");
        label.className = "pet-name-tag";
        label.textContent = record.profile.name;
        label.hidden = true;
        host.current!.appendChild(label);
        const pet: PetRuntime = {
          id: record.id,
          materials: [], lastOpacity: 1, opacity: 1, landing: 0,
          name: record.profile.name,
          label,
          radius,
          walking: true,
          manualHeading: null,
          mover,
          motion,
          area, seat: null, seatPhase:0, sitBlend:0, rest:0, path:[], approach:null, nextSeat:8+Math.random()*15, transfer:0, destination:null,
          wander: createWander(AREA[area].halfX-radius),
        };
        const materials=new Set<Material>();
        motion.root.traverse(child=>{if(child instanceof Mesh)for(const material of Array.isArray(child.material)?child.material:[child.material])materials.add(material);});
        pet.materials=[...materials].map(material=>({material,opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite}));
        const spawn=spawnPoint(current.life,pet,area);
        if(!spawn){ label.remove(); throw new Error("房间暂时没有足够的空位"); }
        pet.wander=createWander(AREA[area].halfX-radius,Math.random,petObstacles(current,pet),spawn);
        // Preserve the preview's angle relative to the viewer, not the room's axes.
        const towardViewer = current.camera.getWorldDirection(new Vector3()).negate();
        pet.wander.yaw = Math.atan2(towardViewer.x, towardViewer.z) + record.profile.facingYaw;
        pet.wander.wait = 3;
        mover.position.set(worldX(pet), 0, pet.wander.z);
        mover.rotation.y = pet.wander.yaw;
        motion.update(0, pet.wander);
        current.pets.set(record.id, pet);
        current.loading.delete(record.id);
        current.scene.add(mover);
        current.render();
        onReady(record.id);
      })
      .catch((error) => {
        if (motion && !current.pets.has(record.id)) { motion.dispose(); disposeObject(motion.root); }
        if (!current.disposed && current.loading.delete(record.id))
          onPetError(record.id, error instanceof Error ? error.message : "模型读取失败。");
      });
    }
  }, [pets, onReady, onPetError]);
  return <div ref={host} className="room-canvas"><div ref={feedback} className="room-feedback" role="status" aria-live="polite" /></div>;
}
