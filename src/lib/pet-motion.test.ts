import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { BipedGait } from "./pet-motion";

const ankleHeight = 0.099;
function setup() {
  return new BipedGait(1.65, [new Vector3(-0.232, ankleHeight, -0.052), new Vector3(0.232, ankleHeight, -0.052)], 0.47025);
}

describe("biped foot placement", () => {
  it("resets planted feet after carrying and a long drop without dragging them from the old floor",()=>{
    const gait=setup();const pose={x:0,z:0,yaw:0,carried:false};
    for(let i=0;i<60;i++){pose.z+=.008;gait.update(1/60,pose);}
    pose.carried=true;for(let i=0;i<60;i++)gait.update(1/60,pose);
    for(const leg of gait.legs){expect(leg.swinging).toBe(false);expect(leg.hip.quaternion.angleTo(new (leg.hip.quaternion.constructor as typeof import('three').Quaternion)())).toBeLessThan(.001);}
    pose.carried=false;pose.x=4;pose.z=-3;gait.update(1/60,pose);gait.body.updateMatrixWorld(true);
    for(const leg of gait.legs){expect(leg.planted.x).toBeCloseTo(pose.x+leg.ankleRest.x);expect(leg.planted.z).toBeCloseTo(pose.z+leg.ankleRest.z);expect(leg.foot.getWorldPosition(new Vector3()).y).toBeGreaterThanOrEqual(ankleHeight-.001);}
  });
  it("bends both legs for sitting and returns to planted walking feet",()=>{
    const gait=setup(),pose={x:0,z:0,yaw:0,sitting:0};
    for(let i=0;i<=60;i++){pose.sitting=i/60;gait.update(1/60,pose);}
    for(const leg of gait.legs){expect(leg.hip.rotation.x).toBeCloseTo(-Math.PI*.48);expect(leg.knee.rotation.x).toBeCloseTo(Math.PI*.48);}
    for(let i=60;i>=0;i--){pose.sitting=i/60;gait.update(1/60,pose);}
    for(let i=0;i<120;i++)gait.update(1/60,pose);
    gait.body.updateMatrixWorld(true);
    for(const leg of gait.legs)expect(leg.foot.getWorldPosition(new Vector3()).y).toBeCloseTo(ankleHeight,3);
  });
  it("alternates lifted feet, keeps stance feet planted and soles level", () => {
    const gait = setup();
    const pose = { x: 0, z: 0, yaw: 0 };
    const previous = [new Vector3(), new Vector3()];
    const lastSwing = [false, false];
    const world = new Vector3();
    const sole = new Vector3();
    const lifted = [0, 0];
    for (let frame = 0; frame < 360; frame += 1) {
      pose.z += frame < 24 ? 1.3 * (frame / 60) / 60 : 0.52 / 60;
      gait.update(1 / 60, pose);
      gait.body.updateMatrixWorld(true);
      expect(gait.legs.filter((leg) => leg.swinging).length).toBeLessThanOrEqual(1);
      gait.legs.forEach((leg, i) => {
        leg.foot.getWorldPosition(world);
        world.z += pose.z;
        expect(world.distanceTo(leg.world)).toBeLessThan(0.0001);
        expect(world.y).toBeGreaterThanOrEqual(ankleHeight - 0.0001);
        sole.set(0, 1, 0).transformDirection(leg.foot.matrixWorld);
        expect(sole.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(0.0001);
        if (frame && !leg.swinging && !lastSwing[i]) expect(world.distanceTo(previous[i])).toBeLessThan(0.0001);
        if (leg.swinging && world.y > ankleHeight + 0.02) lifted[i] += 1;
        previous[i].copy(world); lastSwing[i] = leg.swinging;
      });
    }
    expect(Math.min(...lifted)).toBeGreaterThan(50);
  });

  it("settles both feet after stopping, without snapping the gait to rest", () => {
    const gait = setup();
    const pose = { x: 0, z: 0, yaw: 0 };
    for (let frame = 0; frame < 48; frame += 1) { pose.z += 0.52 / 60; gait.update(1 / 60, pose); }
    let maxJump = 0;
    for (let frame = 0; frame < 180; frame += 1) {
      const before = gait.legs.map((leg) => leg.world.clone());
      gait.update(1 / 60, pose);
      gait.legs.forEach((leg, i) => { maxJump = Math.max(maxJump, leg.world.distanceTo(before[i])); });
    }
    expect(maxJump).toBeLessThan(0.05);
    for (const leg of gait.legs) {
      expect(leg.swinging).toBe(false);
      expect(leg.world.y).toBeCloseTo(ankleHeight, 5);
      expect(leg.world.z).toBeCloseTo(pose.z + leg.ankleRest.z, 3);
    }
    expect(gait.body.position.y).toBeCloseTo(0, 5);
  });

  it("steps through a full turn without crossing feet or sending them through the floor", () => {
    const gait = setup();
    const pose = { x: 0, z: 0, yaw: 0 };
    for (let frame = 0; frame < 600; frame += 1) {
      pose.yaw += 0.85 / 60;
      gait.update(1 / 60, pose);
      gait.body.updateMatrixWorld(true);
      const feet = gait.legs.map((leg) => leg.foot.getWorldPosition(new Vector3()));
      expect(feet[0].x).toBeLessThan(-0.1);
      expect(feet[1].x).toBeGreaterThan(0.1);
      for (const foot of feet) expect(foot.y).toBeGreaterThanOrEqual(ankleHeight - 0.0001);
    }
  });
});
