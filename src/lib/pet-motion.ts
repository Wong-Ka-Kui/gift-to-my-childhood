import {
  AnimationMixer,
  Bone,
  Box3,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
  type AnimationClip,
} from "three";

export type PetModel = { root: Group; animations: AnimationClip[] };
export type MotionPose = { x: number; z: number; yaw: number };
export type PetMotion = {
  root: Group;
  height: number;
  clearance: number;
  mode: "procedural" | "clip" | "static";
  update: (delta: number, pose: MotionPose) => void;
  dispose: () => void;
};

type Anatomy = { forwardYaw: number; ankleHeight: number; hipHeight: number };
const UP = new Vector3(0, 1, 0);
const smooth = (value: number) => {
  const t = MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Only infer a biped when the ankle band actually contains two separate legs. */
function findAnatomy(points: Vector3[], height: number): Anatomy | null {
  const ankles = points.filter((p) => p.y > height * 0.07 && p.y < height * 0.14);
  const toes = points.filter((p) => p.y < height * 0.035);
  if (ankles.length < 20 || toes.length < 20) return null;
  const mean = (group: Vector3[]) => group.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(group.length);
  const ankle = mean(ankles);
  let xx = 0, zz = 0, xz = 0;
  for (const p of ankles) {
    const x = p.x - ankle.x, z = p.z - ankle.z;
    xx += x * x; zz += z * z; xz += x * z;
  }
  const theta = 0.5 * Math.atan2(2 * xz, xx - zz);
  const side = new Vector3(Math.cos(theta), 0, Math.sin(theta));
  const lateral = ankles.map((p) => p.clone().sub(ankle).dot(side));
  const spread = lateral.reduce((max, n) => Math.max(max, n), -Infinity) - lateral.reduce((min, n) => Math.min(min, n), Infinity);
  const middle = lateral.filter((v) => Math.abs(v) < spread * 0.15).length / lateral.length;
  if (spread < height * 0.14 || spread > height * 0.65 || middle > 0.12) return null;
  if (lateral.filter((v) => v > 0).length < lateral.length * 0.2 || lateral.filter((v) => v < 0).length < lateral.length * 0.2) return null;
  const front = new Vector3(-side.z, 0, side.x);
  const toeOffset = mean(toes).sub(ankle).dot(front);
  if (Math.abs(toeOffset) < height * 0.012) return null;
  if (toeOffset < 0) front.negate();
  return {
    forwardYaw: Math.atan2(front.x, front.z),
    ankleHeight: height * 0.06,
    hipHeight: height * 0.285,
  };
}

type Leg = {
  hip: Bone;
  knee: Bone;
  foot: Bone;
  hipRest: Vector3;
  ankleRest: Vector3;
  upperLength: number;
  lowerLength: number;
  upperRest: Vector3;
  lowerRest: Vector3;
  planted: Vector3;
  from: Vector3;
  to: Vector3;
  world: Vector3;
  progress: number;
  swinging: boolean;
};

/** World-space planted feet, a flat sole and two-bone IK. No vertex work per frame. */
export class BipedGait {
  readonly body = new Bone();
  readonly legs: Leg[];
  readonly stepReach: number;
  private initialized = false;
  private lastPose: MotionPose = { x: 0, z: 0, yaw: 0 };
  private lastLeg = 1;
  private bodyDrop = 0;
  private readonly local = new Vector3();
  private readonly expected = new Vector3();
  private readonly direction = new Vector3();
  private readonly bend = new Vector3();
  private readonly kneeTarget = new Vector3();
  private readonly upperRotation = new Quaternion();
  private readonly lowerRotation = new Quaternion();
  private readonly inverse = new Quaternion();

  constructor(readonly height: number, ankles: Vector3[], hipHeight: number) {
    this.body.name = "PetBody";
    this.stepReach = height * 0.115;
    this.legs = ankles.map((ankle, side) => {
      const hip = new Bone(), knee = new Bone(), foot = new Bone();
      hip.name = side === 0 ? "LeftUpperLeg" : "RightUpperLeg";
      knee.name = side === 0 ? "LeftLowerLeg" : "RightLowerLeg";
      foot.name = side === 0 ? "LeftFoot" : "RightFoot";
      const hipRest = new Vector3(ankle.x * 0.87, hipHeight, ankle.z);
      const kneeRest = hipRest.clone().lerp(ankle, 0.52);
      // A small forward rest bend gives IK an unambiguous knee direction.
      kneeRest.z += height * 0.025;
      hip.position.copy(hipRest);
      knee.position.copy(kneeRest).sub(hipRest);
      foot.position.copy(ankle).sub(kneeRest);
      this.body.add(hip); hip.add(knee); knee.add(foot);
      return {
        hip, knee, foot, hipRest, ankleRest: ankle,
        upperLength: knee.position.length(), lowerLength: foot.position.length(),
        upperRest: knee.position.clone().normalize(), lowerRest: foot.position.clone().normalize(),
        planted: new Vector3(), from: new Vector3(), to: new Vector3(), world: new Vector3(),
        progress: 0, swinging: false,
      };
    });
  }

  private toWorld(local: Vector3, pose: MotionPose, target: Vector3) {
    target.copy(local).applyAxisAngle(UP, pose.yaw);
    target.x += pose.x; target.z += pose.z;
    return target;
  }

  update(delta: number, pose: MotionPose) {
    if (!this.initialized) {
      for (const leg of this.legs) {
        this.toWorld(leg.ankleRest, pose, leg.planted);
        leg.world.copy(leg.planted);
      }
      this.lastPose = { ...pose };
      this.initialized = true;
    }
    if (!Number.isFinite(delta) || delta <= 0) return;
    const dt = Math.min(delta, 0.05);
    const dx = pose.x - this.lastPose.x, dz = pose.z - this.lastPose.z;
    const speed = Math.min(Math.hypot(dx, dz) / dt, 0.8);
    const turning = Math.abs(Math.atan2(Math.sin(pose.yaw - this.lastPose.yaw), Math.cos(pose.yaw - this.lastPose.yaw))) / dt;
    const active = speed > 0.015 || turning > 0.025;
    const duration = 0.26;

    if (!this.legs.some((leg) => leg.swinging)) {
      const errors = this.legs.map((leg) => this.toWorld(leg.ankleRest, pose, this.expected).distanceTo(leg.planted));
      const candidate = 1 - this.lastLeg;
      const index = errors[candidate] > (active ? this.height * 0.027 : 0.006)
        ? candidate : errors[1 - candidate] > (active ? this.height * 0.055 : 0.006) ? 1 - candidate : -1;
      if (index !== -1) {
        const leg = this.legs[index];
        leg.from.copy(leg.planted);
        this.toWorld(leg.ankleRest, pose, leg.to);
        // Predict the next landing, capped so feet stay inside collision clearance.
        const lead = Math.min(speed * duration, this.stepReach * 0.86);
        if (speed > 0.015) {
          leg.to.x += dx / Math.hypot(dx, dz) * lead;
          leg.to.z += dz / Math.hypot(dx, dz) * lead;
        }
        leg.progress = 0; leg.swinging = true; this.lastLeg = index;
      }
    }

    const movingFeet = this.legs.some((leg) => leg.swinging);
    this.bodyDrop = MathUtils.damp(this.bodyDrop, movingFeet || active ? this.height * 0.026 : 0, 12, dt);
    this.body.position.y = -this.bodyDrop;
    for (const leg of this.legs) {
      if (leg.swinging) {
        leg.progress = Math.min(1, leg.progress + dt / duration);
        const t = leg.progress;
        const ease = t * t * t * (t * (t * 6 - 15) + 10);
        leg.world.lerpVectors(leg.from, leg.to, ease);
        // Flat foot lift with zero vertical velocity on takeoff and landing.
        leg.world.y += Math.sin(t * Math.PI) ** 2 * this.height * 0.035;
        if (t === 1) { leg.swinging = false; leg.planted.copy(leg.to); }
      } else leg.world.copy(leg.planted);

      this.local.copy(leg.world);
      this.local.x -= pose.x; this.local.z -= pose.z;
      this.local.applyAxisAngle(UP, -pose.yaw);
      this.local.y += this.bodyDrop;
      this.direction.copy(this.local).sub(leg.hipRest);
      const distance = MathUtils.clamp(this.direction.length(), 0.001, leg.upperLength + leg.lowerLength - 0.00001);
      this.direction.normalize();
      const along = (leg.upperLength ** 2 - leg.lowerLength ** 2 + distance ** 2) / (2 * distance);
      const rise = Math.sqrt(Math.max(0, leg.upperLength ** 2 - along ** 2));
      this.bend.set(0, 0, 1).addScaledVector(this.direction, -this.direction.z).normalize();
      this.kneeTarget.copy(leg.hipRest).addScaledVector(this.direction, along).addScaledVector(this.bend, rise);
      this.upperRotation.setFromUnitVectors(leg.upperRest, this.expected.copy(this.kneeTarget).sub(leg.hipRest).normalize());
      this.lowerRotation.setFromUnitVectors(leg.lowerRest, this.expected.copy(this.local).sub(this.kneeTarget).normalize());
      leg.hip.quaternion.copy(this.upperRotation);
      this.inverse.copy(this.upperRotation).invert();
      leg.knee.quaternion.copy(this.inverse).multiply(this.lowerRotation);
      // Cancel leg rotation at the ankle so the sole stays parallel to the floor.
      leg.foot.quaternion.copy(this.lowerRotation).invert();
    }
    this.lastPose.x = pose.x; this.lastPose.z = pose.z; this.lastPose.yaw = pose.yaw;
  }
}

export function preparePetModel(model: PetModel) {
  const root = new Group();
  root.add(model.root);
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  const height = box.max.y - box.min.y;
  const meshes: Mesh[] = [];
  root.traverse((child) => { if (child instanceof Mesh) meshes.push(child); });
  const samples: Vector3[] = [];
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute("position");
    if (!positions) continue;
    const stride = Math.max(1, Math.ceil(positions.count / 16000));
    for (let i = 0; i < positions.count; i += stride) {
      samples.push(new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
    }
  }
  const anatomy = findAnatomy(samples, height);
  // Rotate a wrapper, preserving the loader's centering and floor alignment.
  const aligned = new Group();
  root.remove(model.root); aligned.add(model.root); root.add(aligned);
  aligned.rotation.y = anatomy ? -anatomy.forwardYaw : 0;
  root.updateMatrixWorld(true);
  return { root, height, meshes, samples, anatomy };
}

/** Same normalization in the creation card and room keeps the chosen facing. */
export function createPetMotion(model: PetModel): PetMotion {
  const { root, height, meshes, samples, anatomy } = preparePetModel(model);
  const clip = model.animations.find((animation) => /walk|walking|locomotion|行走/i.test(animation.name));
  if (clip) {
    const mixer = new AnimationMixer(model.root);
    // Keep locomotion under the room controller; discard translation of the asset root.
    const inPlace = clip.clone();
    inPlace.tracks = inPlace.tracks.filter((track) => !/^(?:\.?position|[^.]*root\.position|[^.]*hips\.position)$/i.test(track.name));
    const action = mixer.clipAction(inPlace).play();
    let previous: MotionPose | null = null;
    let weight = 0;
    return {
      root, height, clearance: height * 0.13, mode: "clip",
      update(delta, pose) {
        const speed = previous && delta > 0 ? Math.hypot(pose.x - previous.x, pose.z - previous.z) / delta : 0;
        weight = MathUtils.damp(weight, speed > 0.01 ? 1 : 0, 10, delta);
        action.setEffectiveWeight(weight).setEffectiveTimeScale(MathUtils.clamp(speed / 0.52, 0.5, 1.5));
        mixer.update(delta); previous = { ...pose };
      },
      dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model.root); },
    };
  }
  if (!anatomy || meshes.some((mesh) => mesh instanceof SkinnedMesh || Object.keys(mesh.geometry.morphAttributes).length || mesh.children.length)) {
    return { root, height, clearance: 0, mode: "static", update() {}, dispose() {} };
  }

  const normalized = samples.map((p) => p.clone().applyAxisAngle(UP, -anatomy.forwardYaw));
  const ankles = [-1, 1].map((side) => {
    const band = normalized.filter((p) => p.x * side > 0 && p.y > height * 0.07 && p.y < height * 0.14);
    const average = band.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(band.length);
    average.y = anatomy.ankleHeight;
    return average;
  });
  const gait = new BipedGait(height, ankles, anatomy.hipHeight);
  root.add(gait.body);
  root.updateMatrixWorld(true);
  const bones = [gait.body, ...gait.legs.flatMap((leg) => [leg.hip, leg.knee, leg.foot])];
  const skeleton = new Skeleton(bones);
  const point = new Vector3();
  const skinned: SkinnedMesh[] = [];
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute("position");
    const weights = new Float32Array(positions.count * 4);
    const indices = new Uint16Array(positions.count * 4);
    for (let i = 0; i < positions.count; i += 1) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      const side = point.x < 0 ? 0 : 1;
      const ankle = ankles[side];
      const legWeight = (1 - smooth((point.y / height - 0.235) / 0.075)) * smooth(Math.abs(point.x) / (Math.abs(ankle.x) * 0.7));
      const calf = 1 - smooth((point.y / height - 0.13) / 0.055);
      const foot = 1 - smooth((point.y / height - 0.055) / 0.035);
      indices.set([0, side * 3 + 1, side * 3 + 2, side * 3 + 3], i * 4);
      weights.set([1 - legWeight, legWeight * (1 - calf), legWeight * calf * (1 - foot), legWeight * calf * foot], i * 4);
    }
    mesh.geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
    mesh.geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
    const skin = new SkinnedMesh(mesh.geometry, mesh.material);
    skin.name = mesh.name; skin.position.copy(mesh.position); skin.quaternion.copy(mesh.quaternion); skin.scale.copy(mesh.scale);
    skin.castShadow = skin.receiveShadow = true;
    mesh.parent!.add(skin); mesh.removeFromParent();
    skin.updateWorldMatrix(true, false);
    skin.bind(skeleton, skin.matrixWorld);
    // Conservative static bounds cover both feet through the entire gait, without
    // re-scanning a million-vertex mesh every frame or clipping animated shadows.
    skin.geometry.computeBoundingBox(); skin.geometry.computeBoundingSphere();
    const worldScale = Math.max(0.0001, Math.abs(skin.getWorldScale(point).x));
    skin.boundingBox = skin.geometry.boundingBox!.clone().expandByScalar(height * 0.2 / worldScale);
    skin.boundingSphere = skin.geometry.boundingSphere!.clone();
    skin.boundingSphere.radius += height * 0.2 / worldScale;
    skinned.push(skin);
  }
  return {
    root, height, clearance: gait.stepReach, mode: "procedural",
    update: (delta, pose) => gait.update(delta, pose),
    dispose() { skeleton.dispose(); for (const mesh of skinned) { mesh.geometry.deleteAttribute("skinWeight"); mesh.geometry.deleteAttribute("skinIndex"); } },
  };
}
