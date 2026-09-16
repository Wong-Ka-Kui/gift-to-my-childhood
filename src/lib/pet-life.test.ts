import { describe, it, expect } from 'vitest';
import { Group } from 'three';
import { createWander } from './wander';
import { scheduledArea, requestSeat, stepLife, standUp, freePoint, type PetLife, type LifeWorld, type Seat } from './pet-life';
function fixture() {
  const pet: PetLife={id:'a',mover:new Group(),motion:{root:new Group(),height:1.65,seatHeight:.47,clearance:.1,mode:'procedural',update(){},dispose(){}},radius:.4,area:'bedroom',walking:true,manualHeading:null,wander:createWander(5,()=>.5,[],{x:0,z:0}),seat:null,seatPhase:0,sitBlend:0,rest:0,path:[],approach:null,nextSeat:9999,transfer:0,opacity:1,destination:null};
  const seat: Seat={id:'stool',area:'bedroom',x:2,z:1,y:.7,yaw:0,width:.9,depth:.9};
  const world: LifeWorld={pets:new Map([[pet.id,pet]]),timeOrigin:0,seats:()=>[seat],solids:area=>area==='bedroom'?[{id:seat.id,minX:1.55,maxX:2.45,minZ:.55,maxZ:1.45}]:[]};
  return {pet,seat,world};
}
describe('daily pet routines',()=>{
  it('uses the exact 10:00 and 19:00 boundaries, including midnight',()=>{
    expect(scheduledArea(599.999)).toBe('bedroom');expect(scheduledArea(600)).toBe('classroom');expect(scheduledArea(1139.999)).toBe('classroom');expect(scheduledArea(1140)).toBe('bedroom');expect(scheduledArea(0)).toBe('bedroom');
  });
  it('transfers each way, preserves world identity and picks a free destination',()=>{
    const {pet,world}=fixture();
    for(let i=0;i<25;i++)stepLife(world,pet,.05,false,120000);
    expect(pet.area).toBe('classroom');expect(pet.destination).toBeNull();expect(pet.mover.scale.x).toBe(1);expect(freePoint(world,pet,pet.area,pet.wander.x,pet.wander.z)).toBe(true);
    for(let i=0;i<25;i++)stepLife(world,pet,.05,false,660000);
    expect(pet.area).toBe('bedroom');expect(pet.destination).toBeNull();
  });
  it('walks to a seat, sits with a smooth pose, stands and walks away',()=>{
    const {pet,world,seat}=fixture();expect(requestSeat(world,pet,seat)).toBe(true);
    for(let i=0;i<2400&&pet.sitBlend<1;i++)stepLife(world,pet,.05,false,0);
    expect(pet.sitBlend).toBe(1);expect(pet.wander.x).toBeCloseTo(seat.x);expect(pet.wander.z).toBeCloseTo(seat.z);
    expect(standUp(world,pet)).toBe(true);for(let i=0;i<20;i++)stepLife(world,pet,.05,false,0);
    expect(pet.seat).toBeNull();expect(pet.sitBlend).toBe(0);expect(freePoint(world,pet,pet.area,pet.wander.x,pet.wander.z)).toBe(true);
  });
  it('autonomously chooses a seat then gets up without a user request',()=>{
    const {pet,world}=fixture();pet.nextSeat=0;
    let sat=false,stood=false;
    for(let i=0;i<2400;i++){stepLife(world,pet,.05,false,0);if(pet.sitBlend===1)sat=true;if(sat&&!pet.seat){stood=true;break;}}
    expect(sat).toBe(true);expect(stood).toBe(true);expect(pet.walking).toBe(true);
  });
  it('allows carrying onto an edge stool without requiring a floor approach beyond the wall',()=>{
    const {pet,world,seat}=fixture();seat.x=4.8;seat.z=4.8;world.solids=()=>[{id:seat.id,minX:4.35,maxX:5.25,minZ:4.35,maxZ:5.25},{id:'desk',minX:-5,maxX:5.2,minZ:3,maxZ:3.7}];
    expect(requestSeat(world,pet,seat,true)).toBe(true);
    for(let i=0;i<20;i++)stepLife(world,pet,.05,false,0);
    expect(pet.sitBlend).toBe(1);expect(pet.wander.x).toBe(seat.x);
  });
  it('does not double book a seat or enter a chair blocked by other furniture',()=>{
    const {pet,world,seat}=fixture();expect(requestSeat(world,pet,seat)).toBe(true);
    const other={...pet,id:'b',seat:null,wander:createWander(5,()=>.5,[],{x:-2,z:-2})};world.pets.set(other.id,other);
    expect(requestSeat(world,other,seat)).toBe(false);
    pet.seat=null;world.solids=()=>[{id:'table',minX:1,maxX:3,minZ:0,maxZ:2}];expect(requestSeat(world,pet,seat)).toBe(false);
  });
});
