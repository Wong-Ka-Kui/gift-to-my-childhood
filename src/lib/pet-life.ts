import { MathUtils, type Group } from 'three';
import { createWander, resumeWander, stepWander, routeBlocked, type WanderObstacle, type WanderState } from './wander';
import type { PetMotion } from './pet-motion';
import { getGameTime } from './game-time';

export type PetArea = 'bedroom' | 'classroom';
export const AREA = {
  bedroom: { offset: 0, halfX: 5.8, halfZ: 5.8 },
  classroom: { offset: 16, halfX: 6.05, halfZ: 4.8 },
};
export const scheduledArea = (minute: number): PetArea => minute >= 600 && minute < 1140 ? 'classroom' : 'bedroom';
export type Routine = 'free' | 'class' | 'sleep';
export function requiredRoutine(minute: number): Routine {
  if(minute>=1410||minute<420)return 'sleep';
  if((minute>=600&&minute<720)||(minute>=810&&minute<1020)||(minute>=1080&&minute<1140))return 'class';
  return 'free';
}
export type Seat = { kind?: 'bed'; furnitureId?: string; id: string; area: PetArea; x: number; z: number; y: number; yaw: number; width: number; depth: number };
export type Solid = WanderObstacle & { id: string };
export type PetLife = {
  id: string; mover: Group; motion: PetMotion; radius: number; wander: WanderState;
  area: PetArea; walking: boolean; manualHeading: number | null;
  seat: Seat | null; seatPhase: number; sitBlend: number; rest: number;
  path: {x:number;z:number}[]; approach: {x:number;z:number} | null;
  required?: Routine; sleepBlend?: number; relocation?: { target: Seat | null; elapsed: number; placed: boolean };
  nextSeat: number; transfer: number; opacity: number; destination: PetArea | null;
};
export type LifeWorld = { pets: Map<string, PetLife>; solids(area: PetArea): Solid[]; seats(): Seat[]; timeOrigin: number };
export function worldX(pet: PetLife) { return pet.wander.x + AREA[pet.area].offset; }
export function obstaclesFor(world: LifeWorld, area: PetArea, radius: number, exclude?: string): WanderObstacle[] {
  const a = AREA[area], pad = radius + .1;
  return [...world.solids(area).filter(o=>o.id !== exclude).map(o=>({minX:o.minX-pad,maxX:o.maxX+pad,minZ:o.minZ-pad,maxZ:o.maxZ+pad})),
    {minX:-20,maxX:20,minZ:a.halfZ-radius,maxZ:20}, {minX:-20,maxX:20,minZ:-20,maxZ:-a.halfZ+radius}];
}
export function freePoint(world: LifeWorld, pet: PetLife, area: PetArea, x: number, z: number, exclude?: string) {
  const a=AREA[area];
  return Math.abs(x)<=a.halfX-pet.radius && Math.abs(z)<=a.halfZ-pet.radius &&
    !obstaclesFor(world,area,pet.radius,exclude).some(o=>x>o.minX&&x<o.maxX&&z>o.minZ&&z<o.maxZ) &&
    [...world.pets.values()].every(p=>p===pet||p.seat?.kind==='bed'||p.area!==area||Math.hypot(x-p.wander.x,z-p.wander.z)>=pet.radius+p.radius+.18);
}
export function spawnPoint(world: LifeWorld, pet: PetLife, area: PetArea) {
  const a=AREA[area], candidates:{x:number;z:number}[]=[];
  for(let x=-a.halfX+pet.radius;x<=a.halfX-pet.radius;x+=.22) for(let z=-a.halfZ+pet.radius;z<=a.halfZ-pet.radius;z+=.22) if(freePoint(world,pet,area,x,z)) candidates.push({x,z});
  candidates.sort((a,b)=>a.x*a.x+a.z*a.z-b.x*b.x-b.z*b.z);
  const first=![...world.pets.values()].some(p=>p!==pet&&p.area===area);
  return (first ? candidates[0] : candidates[Math.floor(Math.random()*candidates.length)]) ?? null;
}
export function refreshNavigation(world: LifeWorld, pet: PetLife) {
  pet.wander.obstacles=obstaclesFor(world,pet.area,pet.radius);
  pet.wander.neighbors=[...world.pets.values()].filter(p=>p!==pet&&p.area===pet.area&&p.seat?.kind!=='bed').map(p=>({x:p.wander.x,z:p.wander.z,radius:p.radius+pet.radius+.18}));
}
// Navigation and wandering share exact segment/rectangle intersection checks.
// This includes even a tiny corner crossing, rather than sampling past it.
export function clearSegment(world: LifeWorld, pet: PetLife, from:{x:number;z:number}, to:{x:number;z:number}, exclude?:string) {
  if(!freePoint(world,pet,pet.area,from.x,from.z,exclude)||!freePoint(world,pet,pet.area,to.x,to.z,exclude))return false;
  const state={...pet.wander,...from,obstacles:obstaclesFor(world,pet.area,pet.radius,exclude),neighbors:[...world.pets.values()].filter(p=>p!==pet&&p.area===pet.area&&p.seat?.kind!=='bed').map(p=>({x:p.wander.x,z:p.wander.z,radius:p.radius+pet.radius+.18}))};
  return !routeBlocked(state,to.x,to.z);
}
export function routeTo(world: LifeWorld, pet: PetLife, goal:{x:number;z:number}) {
  const start={x:pet.wander.x,z:pet.wander.z};
  if(clearSegment(world,pet,start,goal)) return [goal];
  const step=.35, a=AREA[pet.area], nodes=[{...start,parent:-1}], queue=[0], seen=new Set<string>();
  for(let cursor=0;cursor<queue.length&&nodes.length<2500;cursor++) {
    const idx=queue[cursor], node=nodes[idx];
    if(Math.hypot(node.x-goal.x,node.z-goal.z)<.7&&clearSegment(world,pet,node,goal)) {
      const path=[goal]; let j=idx;
      while(j>0){path.unshift({x:nodes[j].x,z:nodes[j].z});j=nodes[j].parent;}
      // Remove unnecessary intermediate corners without cutting through furniture.
      const smooth: typeof path=[];let anchor=start;
      while(path.length){let last=0;for(let k=1;k<path.length;k++){if(clearSegment(world,pet,anchor,path[k]))last=k;else break;} anchor=path[last];smooth.push(anchor);path.splice(0,last+1);}
      return smooth;
    }
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const x=node.x+dx*step,z=node.z+dz*step,key=`${Math.round((x-start.x)/step)},${Math.round((z-start.z)/step)}`;
      if(seen.has(key)||Math.abs(x)>a.halfX||Math.abs(z)>a.halfZ)continue;seen.add(key);
      if(clearSegment(world,pet,node,{x,z})){nodes.push({x,z,parent:idx});queue.push(nodes.length-1);}
    }
  }
  return null;
}
export function seatAvailable(world: LifeWorld, pet: PetLife, seat: Seat) {
  return seat.area===pet.area && [...world.pets.values()].every(p=>p===pet||p.seat?.id!==seat.id) &&
    freePoint(world,pet,seat.area,seat.x,seat.z,seat.id);
}
export function requestSeat(world: LifeWorld, pet: PetLife, seat: Seat, carried = false) {
  if(seat.kind==='bed')return requestBed(world,pet,seat);
  if(!seatAvailable(world,pet,seat))return false;
  // A carried pet is already above the destination: floor access routes do
  // not constrain placement onto a clear, unoccupied cushion.
  if(carried){
    pet.seat=seat;pet.path=[];pet.approach={x:seat.x,z:seat.z};
    pet.wander.x=seat.x;pet.wander.z=seat.z;pet.wander.speed=0;
    pet.wander.targetX=seat.x;pet.wander.targetZ=seat.z;
    pet.seatPhase=0;pet.sitBlend=0;pet.manualHeading=null;pet.walking=true;
    return true;
  }
  // Approach from either side or the front. Never cross the chair back or desk.
  for(const angle of (seat.area==="classroom"?[Math.PI/2,-Math.PI/2,Math.PI/4,-Math.PI/4]:[Math.PI/2,-Math.PI/2,0,Math.PI,Math.PI/4,-Math.PI/4,Math.PI*3/4,-Math.PI*3/4])) {
    const yaw=seat.yaw+angle, distance=pet.radius+Math.max(seat.width,seat.depth)/2+.18;
    const approach={x:seat.x+Math.sin(yaw)*distance,z:seat.z+Math.cos(yaw)*distance};
    if(!freePoint(world,pet,pet.area,approach.x,approach.z)||!clearSegment(world,pet,approach,seat,seat.id))continue;
    const path=carried?[]:routeTo(world,pet,approach);if(!path)continue;
    if(carried){pet.wander.x=approach.x;pet.wander.z=approach.z;pet.wander.speed=0;}
    pet.seat=seat;pet.path=path;pet.approach=approach;pet.seatPhase=0;pet.manualHeading=null;pet.walking=true;pet.wander.wait=0;return true;
  }
  return false;
}
export function standUp(world: LifeWorld, pet: PetLife) {
  if(pet.required && pet.required!=='free')return false;
  if(!pet.seat)return true;
  if(pet.seat.kind==='bed'){pet.relocation={target:null,elapsed:0,placed:false};return true;}
  // Reserve a free landing before leaving the chair, including other pets.
  const seat=pet.seat;
  const angles=seat.area==="classroom"?[Math.PI/2,-Math.PI/2,Math.PI/4,-Math.PI/4]:Array.from({length:8},(_,i)=>i*Math.PI/4);
  const candidates=[pet.approach,...angles.map(angle=>({x:seat.x+Math.sin(seat.yaw+angle)*(pet.radius+Math.max(seat.width,seat.depth)/2+.2),z:seat.z+Math.cos(seat.yaw+angle)*(pet.radius+Math.max(seat.width,seat.depth)/2+.2)}))];
  const landing=candidates.find(p=>p&&freePoint(world,pet,pet.area,p.x,p.z)&&clearSegment(world,pet,seat,p,seat.id));
  if(!landing)return false;
  pet.approach=landing;pet.seatPhase=-1;return true;
}
export function cancelSeat(pet: PetLife) { pet.seat=null;pet.path=[];pet.approach=null;pet.seatPhase=0;pet.sitBlend=0;pet.sleepBlend=0;pet.nextSeat=12+Math.random()*15; }
export function requestBed(world: LifeWorld, pet: PetLife, bed: Seat) {
  if(bed.kind!=='bed'||pet.area!==bed.area||[...world.pets.values()].some(p=>p!==pet&&(p.seat?.id===bed.id||p.relocation?.target?.id===bed.id)))return false;
  pet.path=[];pet.manualHeading=null;pet.relocation={target:bed,elapsed:0,placed:false};return true;
}
function stepRelocation(world: LifeWorld, pet: PetLife, dt: number) {
  const move=pet.relocation!;move.elapsed+=dt;
  if(move.elapsed>=.4&&!move.placed){
    if(move.target){pet.seat=move.target;pet.wander.x=move.target.x;pet.wander.z=move.target.z;pet.wander.yaw=move.target.yaw;pet.sitBlend=move.target.kind==='bed'?0:1;pet.sleepBlend=move.target.kind==='bed'?1:0;pet.seatPhase=1;pet.rest=20;}
    else {const point=spawnPoint(world,pet,pet.area);if(!point){move.elapsed=.39;return;}cancelSeat(pet);pet.wander.x=point.x;pet.wander.z=point.z;pet.walking=true;}
    pet.wander.targetX=pet.wander.x;pet.wander.targetZ=pet.wander.z;pet.wander.speed=0;pet.wander.wait=1;move.placed=true;
  }
  pet.opacity=Math.min(1,Math.abs(move.elapsed-.4)/.4);
  if(move.elapsed>=.8){pet.opacity=1;pet.relocation=undefined;}
}
export function stepLife(world: LifeWorld, pet: PetLife, dt: number, held=false, now=Date.now()) {
  const minute=getGameTime(world.timeOrigin,now).minuteOfDay;
  const routine=requiredRoutine(minute), previous=pet.required;
  pet.required=routine;
  if(pet.relocation){stepRelocation(world,pet,dt);return;}
  if(previous && previous!=='free'&&routine==='free'&&pet.seat){pet.relocation={target:null,elapsed:0,placed:false};return;}
  const desired=scheduledArea(minute);
  if(!held && !pet.destination && desired!==pet.area) {pet.destination=desired;pet.transfer=0;pet.path=[];}
  if(pet.destination && !held) {
    pet.transfer+=dt;
    // Separate buildings deliberately have no connecting floor. Fade between
    // them instead of walking through walls or across the empty gap.
    if(pet.transfer>=.45 && pet.area!==pet.destination) {
      const point=spawnPoint(world,pet,pet.destination);
      if(!point){pet.transfer=.44;return;}
      pet.area=pet.destination;cancelSeat(pet);pet.walking=true;pet.manualHeading=null;
      pet.wander=createWander(AREA[pet.area].halfX-pet.radius,Math.random,obstaclesFor(world,pet.area,pet.radius),point);
    }
    pet.opacity=Math.min(1,Math.abs(pet.transfer-.45)/.45);
    pet.wander.speed=0;
    if(pet.transfer>=.9){pet.destination=null;pet.opacity=1;}
    return;
  }
  if(held)return;
  if(routine!=='free') {
    const isBed=routine==='sleep';
    if(pet.seat&&(pet.seat.kind==='bed')===isBed&&pet.seat.area===pet.area&&((isBed&&pet.sleepBlend===1)||(!isBed&&pet.sitBlend===1)))return;
    const occupied=new Set([...world.pets.values()].filter(p=>p!==pet).flatMap(p=>[p.seat?.id,p.relocation?.target?.id]));
    const target=world.seats().find(s=>s.area===pet.area&&(s.kind==='bed')===isBed&&!occupied.has(s.id));
    if(target){pet.path=[];pet.manualHeading=null;pet.relocation={target,elapsed:0,placed:false};}
    return;
  }
  if(pet.seat?.kind==='bed'){pet.rest-=dt;if(pet.rest<=0)pet.relocation={target:null,elapsed:0,placed:false};return;}
  refreshNavigation(world,pet);
  if(pet.seat) {
    const seat=pet.seat;
    if(pet.path.length) {
      const target=pet.path[0];
      if(!clearSegment(world,pet,pet.wander,target)){cancelSeat(pet);return;}
      pet.wander.targetX=target.x;pet.wander.targetZ=target.z;pet.wander.wait=0;
      stepWander(pet.wander,dt,()=>0);
      if(Math.hypot(pet.wander.x-target.x,pet.wander.z-target.z)<.025)pet.path.shift();
    } else if(pet.seatPhase<0) {
      if(!clearSegment(world,pet,pet.wander,pet.approach!,seat.id))return;
      pet.sitBlend=Math.max(0,pet.sitBlend-dt*1.4);
      const t=pet.sitBlend*pet.sitBlend*(3-2*pet.sitBlend);
      pet.wander.x=MathUtils.lerp(pet.approach!.x,seat.x,t);pet.wander.z=MathUtils.lerp(pet.approach!.z,seat.z,t);
      if(pet.sitBlend===0){cancelSeat(pet);resumeWander(pet.wander);}
    } else {
      if(pet.sitBlend<1&&!clearSegment(world,pet,pet.wander,seat,seat.id))return;
      pet.wander.speed=0;pet.sitBlend=Math.min(1,pet.sitBlend+dt*1.4);
      const t=pet.sitBlend*pet.sitBlend*(3-2*pet.sitBlend);
      pet.wander.x=MathUtils.lerp(pet.approach!.x,seat.x,t);pet.wander.z=MathUtils.lerp(pet.approach!.z,seat.z,t);
      pet.wander.yaw+=Math.atan2(Math.sin(seat.yaw-pet.wander.yaw),Math.cos(seat.yaw-pet.wander.yaw))*Math.min(1,dt*8);
      if(pet.sitBlend===1){if(!pet.seatPhase){pet.seatPhase=1;pet.rest=8+Math.random()*14;} pet.rest-=dt;if(pet.rest<=0)standUp(world,pet);}
    }
    return;
  }
  if(pet.manualHeading!==null){const turn=Math.atan2(Math.sin(pet.manualHeading-pet.wander.yaw),Math.cos(pet.manualHeading-pet.wander.yaw));pet.wander.yaw+=MathUtils.clamp(turn,-.85*dt,.85*dt);if(Math.abs(turn)<.015)pet.manualHeading=null;return;}
  if(!pet.walking)return;
  pet.nextSeat-=dt;
  if(pet.nextSeat<=0){pet.nextSeat=8+Math.random()*15;const seats=world.seats().filter(s=>s.area===pet.area&&s.kind!=='bed').sort(()=>Math.random()-.5);if(seats.some(s=>requestSeat(world,pet,s)))return;}
  stepWander(pet.wander,dt);
}
