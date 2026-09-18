import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Box3, Group } from "three";
import { createFurniture, furnitureSeats } from "./furniture";
import { furnitureObstacle, placementProblem } from "./furniture-layout";
import { freePoint, requestSeat, standUp, stepLife, worldX, type LifeWorld, type PetLife } from "./pet-life";
import { createWander } from "./wander";
import { disposeObject } from "./model";
import { createClassroom } from "../classroom/model";
import { createRoomShell, WALL_HEIGHT } from "./room-shell";

let furniture: ReturnType<typeof createFurniture>;
beforeAll(() => {
  // Only the fixed curtain texture needs a canvas; geometry is real Three.js.
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) });
  furniture = createFurniture({ "bunk-left": { x: 0, z: 0 }, "long-desk": { x: 1, z: 1 }, "stool-1": { x: 4, z: 0 } });
});
afterAll(() => { disposeObject(furniture.root); vi.unstubAllGlobals(); });

describe("four loft-bed dormitory", () => {
  it("fits four complete workstations without overlaps and leaves the centre and door corridor clear", () => {
    expect(furniture.items.filter(item => item.seat)).toHaveLength(8);
    for (const item of furniture.items) expect(placementProblem(item, item.position, furniture.items)).toBeNull();
    const meshes: string[] = [];
    furniture.root.traverse(node => meshes.push(node.name));
    for (const name of ["laptop", "mattress", "study-desktop"]) expect(meshes.filter(n => n === name)).toHaveLength(4);
    const beds = furniture.items.filter(item => item.seat?.kind === "bed");
    expect(beds.every(item => new Box3().setFromObject(item.group).max.y < 3.3)).toBe(true);
    expect(beds[0].position.z).toBe(beds[1].position.z);
    expect(beds[2].position.x).toBe(beds[3].position.x);
    const firstRowGap = furnitureObstacle(beds[1]).minX - furnitureObstacle(beds[0]).maxX;
    const sideRowGap = furnitureObstacle(beds[3]).minZ - furnitureObstacle(beds[2]).maxZ;
    expect(firstRowGap).toBeGreaterThan(.08); expect(firstRowGap).toBeLessThan(.1);
    expect(sideRowGap).toBeGreaterThan(.08); expect(sideRowGap).toBeLessThan(.1);
    for (const x of [0, 1, 2, 3, 4, 5]) {
      expect(furniture.items.some(item => { const b = furnitureObstacle(item); return b.minX < x + .7 && b.maxX > x - .7 && b.minZ < .7 && b.maxZ > -.7; })).toBe(false);
    }
  });

  it("provides four upper beds and four chairs, with each seat following moved furniture", () => {
    const seats = furnitureSeats(furniture.items);
    expect(seats.filter(s => s.kind === "bed")).toHaveLength(4);
    expect(seats.filter(s => s.backrest)).toHaveLength(4);
    expect(seats.filter(s => s.kind === "bed").every(s => s.y > 2)).toBe(true);
    const item = furniture.items[0];
    const shifted = { ...item, position: { x: item.position.x + .2, z: item.position.z } };
    expect(furnitureSeats([shifted])[0].x).toBe(shifted.position.x);
  });

  it("keeps the moved window and air conditioner clear of all loft beds", () => {
    const shell = createRoomShell();
    const airConditioner = shell.getObjectByName("wall-air-conditioner")!;
    expect(airConditioner.parent?.name).toBe("room-wall-z");
    const bounds = [new Box3().setFromObject(furniture.window), new Box3().setFromObject(airConditioner)];
    for (const b of bounds) {
      expect(b.max.y).toBeLessThan(WALL_HEIGHT);
      for (const bed of furniture.items.filter(item => item.seat?.kind === "bed")) expect(b.intersectsBox(new Box3().setFromObject(bed.group))).toBe(false);
    }
    disposeObject(shell);
  });

  it("updates saved default chair spacing while preserving a hand-positioned chair", () => {
    const layout = Object.fromEntries(furniture.items.map(item => [item.id, item.position]));
    layout["dorm-l-chair-1"] = { x: -.08, z: -2.27 };
    layout["dorm-l-chair-3"] = { x: -2.27, z: -1.70 };
    layout["dorm-l-chair-2"] = { x: 3.71, z: -2.08 };
    const restored = createFurniture(layout);
    for (const id of ["dorm-l-chair-1", "dorm-l-chair-3"]) {
      expect(restored.items.find(item => item.id === id)!.position).toEqual(furniture.items.find(item => item.id === id)!.position);
    }
    expect(restored.items.find(item => item.id === "dorm-l-chair-2")!.position).toEqual(layout["dorm-l-chair-2"]);
    disposeObject(restored.root);
  });

  it("walks four pets to actual classroom chairs and back without fading or overlapping", () => {
    const classroom = createClassroom().root; classroom.scale.setScalar(1.25); classroom.updateMatrixWorld(true);
    const solids = classroom.children.filter(node => ['chair', 'desk', 'lectern', 'classroom-prop'].includes(node.userData.kind) || node.name === 'teaching-platform').map(node => {
      const b = new Box3().setFromObject(node); return {id:node.name,minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z};
    });
    const seats = classroom.children.filter(node => node.userData.kind === 'chair').map(node => ({ id:node.name,area:'classroom' as const,x:node.position.x*1.25,z:node.position.z*1.25,y:.6075*1.25,yaw:Math.PI,width:1.3,depth:1.2 }));
    const pets = new Map<string,PetLife>();
    for(let i=0;i<4;i++) pets.set(String(i), { id:String(i),mover:new Group(),motion:{root:new Group(),height:1.65,seatHeight:.47,clearance:.1,mode:'static',update(){},dispose(){}},radius:.85,area:'bedroom',walking:false,manualHeading:null,wander:createWander(5,()=>.5,[],{x:i%2*2.2,z:Math.floor(i/2)*2.2}),seat:null,seatPhase:0,sitBlend:0,rest:0,path:[],approach:null,nextSeat:9999,transfer:0,opacity:1,destination:null });
    const world:LifeWorld = { pets,timeOrigin:0,seats:()=>[...furnitureSeats(furniture.items),...seats],solids:area=>area==='bedroom'?furniture.items.map(item=>({...furnitureObstacle(item),id:item.id})):solids };
    const run = (now:number) => {
      for (let frame=0;frame<8000;frame++) for(const pet of pets.values()) {
        const before={x:worldX(pet),z:pet.wander.z};
        stepLife(world,pet,.05,false,now);
        if (pet.commute) {
          expect(Math.hypot(worldX(pet)-before.x,pet.wander.z-before.z)).toBeLessThanOrEqual(.049);
          expect(pet.opacity).toBe(1);
          for(const other of pets.values()) if(other!==pet && other.seat?.kind!=='bed') {
            expect(Math.hypot(worldX(pet)-worldX(other),pet.wander.z-other.wander.z)).toBeGreaterThanOrEqual(pet.radius+other.radius+.179);
          }
        }
      }
    };
    run(120000);
    expect([...pets.values()].map(p=>({area:p.area,seat:p.seat?.id,sitting:p.sitBlend,commute:p.commute}))).toEqual(expect.arrayContaining(seats.map(s=>expect.objectContaining({area:'classroom',seat:s.id,sitting:1,commute:undefined}))));
    run(660000);
    for(const pet of pets.values()) {expect(pet.area).toBe('bedroom');expect(pet.destination).toBeNull();expect(pet.opacity).toBe(1);}
    disposeObject(classroom);
  });

  it("lets a pet reach and leave every chair from the side, without crossing a backrest or bed", () => {
    for (const seat of furnitureSeats(furniture.items).filter(s => s.backrest)) {
      const pet: PetLife = { id: "test", mover: new Group(), motion: { root: new Group(), height: 1.65, seatHeight: .47, clearance: .1, mode: "static", update() {}, dispose() {} }, radius: .85, area: "bedroom", walking: true, manualHeading: null, wander: createWander(5, () => .5, [], { x: 0, z: 0 }), seat: null, seatPhase: 0, sitBlend: 0, rest: 0, path: [], approach: null, nextSeat: 9999, transfer: 0, opacity: 1, destination: null };
      const world: LifeWorld = { pets: new Map([[pet.id, pet]]), timeOrigin: 0, seats: () => furnitureSeats(furniture.items), solids: () => furniture.items.map(item => ({ ...furnitureObstacle(item), id: item.id })) };
      expect(requestSeat(world, pet, seat)).toBe(true);
      const relativeZ = (pet.approach!.z - seat.z) * Math.cos(seat.yaw);
      expect(relativeZ).toBeGreaterThanOrEqual(-.001);
      for (let i = 0; i < 2400 && pet.sitBlend < 1; i++) stepLife(world, pet, .05, false, 0);
      expect(pet.sitBlend).toBe(1);
      expect(standUp(world, pet)).toBe(true);
      for (let i = 0; i < 25; i++) stepLife(world, pet, .05, false, 0);
      expect(pet.seat).toBeNull();
      expect(freePoint(world, pet, "bedroom", pet.wander.x, pet.wander.z)).toBe(true);
    }
  });
});
