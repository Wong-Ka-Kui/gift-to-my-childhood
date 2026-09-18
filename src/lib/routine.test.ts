import {describe,it,expect} from 'vitest';
import {Group} from 'three';
import {createWander} from './wander';
import {requiredRoutine,stepLife,requestBed,standUp,type LifeWorld,type PetLife,type Seat} from './pet-life';
import {isFutureDate,localDateKey} from './diary-date';
function fixture(){
 const seats:Seat[]=Array.from({length:4},(_,i)=>({id:`chair${i}`,area:'classroom',x:i%2?2.94:-2.94,z:i<2?-1.875:3.625,y:.76,yaw:Math.PI,width:1,depth:1}));
 const beds:Seat[]=Array.from({length:4},(_,i)=>({id:`bed${i}`,kind:'bed',area:'bedroom',x:i<2?-3:3,z:-3,y:i%2?2.33:.76,yaw:0,width:2,depth:3}));
 const pets=new Map<string,PetLife>();
 for(let i=0;i<4;i++)pets.set('p'+i,{id:'p'+i,mover:new Group(),motion:{root:new Group(),height:1.65,clearance:0,seatHeight:.47,mode:'procedural',update(){},dispose(){}},radius:.7,wander:createWander(5,()=>.5,[],{x:i*2-3,z:0}),area:'bedroom',walking:false,manualHeading:null,seat:null,seatPhase:0,sitBlend:0,rest:0,path:[],approach:null,nextSeat:999,transfer:0,opacity:1,destination:null});
 const world:LifeWorld={pets,solids:()=>[],seats:()=>[...seats,...beds],timeOrigin:0};
 const run=(minute:number, frames=7000)=>{const now=(minute<480?minute+1440:minute)-480;for(let i=0;i<frames;i++)for(const p of pets.values())stepLife(world,p,.05,false,now*1000);};
 return {world,pets,beds,run};
}
describe('four-person required schedule',()=>{
 it.each([[599,'free'],[600,'class'],[719.99,'class'],[720,'free'],[809.99,'free'],[810,'class'],[1019.99,'class'],[1020,'free'],[1079.99,'free'],[1080,'class'],[1139.99,'class'],[1140,'free'],[1409.99,'free'],[1410,'sleep'],[0,'sleep'],[419.99,'sleep'],[420,'free']] as const)('at minute %s requires %s',(m,r)=>expect(requiredRoutine(m)).toBe(r));
 it('seats four stopped pets in unique chairs for every lesson and releases them at breaks',()=>{
  const f=fixture();for(const m of [600,810,1080]){f.run(m);expect(new Set([...f.pets.values()].map(p=>p.seat?.id)).size).toBe(4);for(const p of f.pets.values()){expect(p.area).toBe('classroom');expect(p.sitBlend).toBe(1);expect(standUp(f.world,p)).toBe(false);}f.run(m===600?720:m===810?1020:1140,100);for(const p of f.pets.values())expect(p.seat).toBeNull();}
 });
 it('assigns four distinct bunks across midnight, wakes at seven',()=>{
  const f=fixture();f.run(1410);expect(new Set([...f.pets.values()].map(p=>p.seat?.id)).size).toBe(4);for(const p of f.pets.values()){expect(p.sleepBlend).toBe(1);expect(p.seat?.kind).toBe('bed');expect(standUp(f.world,p)).toBe(false);}f.run(30);for(const p of f.pets.values())expect(p.sleepBlend).toBe(1);f.run(420);for(const p of f.pets.values()){expect(p.seat).toBeNull();expect(p.sleepBlend).toBe(0);}
 });
 it('reserves upper and lower beds independently for manual sleep',()=>{const f=fixture(),[a,b]=[...f.pets.values()];expect(requestBed(f.world,a,f.beds[0])).toBe(true);expect(requestBed(f.world,b,f.beds[0])).toBe(false);expect(requestBed(f.world,b,f.beds[1])).toBe(true);f.run(480,100);expect(a.sleepBlend).toBe(1);expect(b.sleepBlend).toBe(1);});
});
describe('real calendar cutoff',()=>{
 it('caps at local today and handles month/year changes',()=>{const today=new Date(2026,8,16);expect(localDateKey(today)).toBe('2026-09-16');expect(isFutureDate('2026-09-17',today)).toBe(true);expect(isFutureDate('2026-09-16',today)).toBe(false);expect(isFutureDate('2027-01-01',new Date(2026,11,31))).toBe(true);});
});
