/** Positions live on the room's X/Z floor; yaw is measured from +Z. */
export interface WanderObstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WanderState {
  bound: number;
  /** Furniture footprints already expanded by the pet's horizontal radius. */
  obstacles: readonly WanderObstacle[];
  x: number;
  z: number;
  yaw: number;
  targetX: number;
  targetZ: number;
  wait: number;
  speed: number;
  /** Other pets' centers, with radii expanded by this pet's radius and a gap. */
  neighbors?: readonly { x: number; z: number; radius: number }[];
}

type Random = () => number;

// Keep movement gentle while giving the pet long pauses between walks.
const SPEED = 0.52;
const ACCELERATION = 1.3;
const TURN_SPEED = 0.85;
const MAX_DELTA = 0.1;
const IDLE_PROBABILITY = 0.7;
const INITIAL_WAIT = 1.2;
const IDLE_WAIT_MIN = 2.8;
const IDLE_WAIT_RANGE = 2.4;
const MOVE_WAIT_MIN = 0.8;
const MOVE_WAIT_RANGE = 1.0;

function angle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

export function routeBlocked(state: WanderState, targetX: number, targetZ: number) {
  const furnitureBlocked = state.obstacles.some((obstacle) => {
    let enter = 0;
    let exit = 1;
    const axes = [
      [state.x, targetX - state.x, obstacle.minX, obstacle.maxX],
      [state.z, targetZ - state.z, obstacle.minZ, obstacle.maxZ],
    ];
    for (const [start, direction, min, max] of axes) {
      if (min >= max) return false;
      if (Math.abs(direction) < 1e-12) {
        // A path touching an edge may slide along it, but must not enter it.
        if (start <= min || start >= max) return false;
      } else {
        const first = (min - start) / direction;
        const last = (max - start) / direction;
        enter = Math.max(enter, Math.min(first, last));
        exit = Math.min(exit, Math.max(first, last));
      }
      if (enter >= exit) return false;
    }
    return enter < exit;
  });
  if (furnitureBlocked) return true;
  const dx = targetX - state.x, dz = targetZ - state.z;
  const lengthSquared = dx * dx + dz * dz;
  return (state.neighbors ?? []).some((pet) => {
    const fraction = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((pet.x - state.x) * dx + (pet.z - state.z) * dz) / lengthSquared)) : 0;
    return Math.hypot(state.x + dx * fraction - pet.x, state.z + dz * fraction - pet.z) < pet.radius;
  });
}

function chooseTarget(state: WanderState, random: Random) {
  const minimumDistance = Math.min(1, state.bound * 0.5);
  const tryTarget = (x: number, z: number) => {
    if (
      Math.abs(x) <= state.bound &&
      Math.abs(z) <= state.bound &&
      Math.hypot(x - state.x, z - state.z) >= minimumDistance &&
      !routeBlocked(state, x, z)
    ) {
      state.targetX = x;
      state.targetZ = z;
      return true;
    }
    return false;
  };

  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (
      tryTarget(
        (random() * 2 - 1) * state.bound,
        (random() * 2 - 1) * state.bound,
      )
    ) return;
  }

  // Even a repeated random value should not strand the pet at its current spot.
  if (
    tryTarget(
      (state.x > 0 ? -1 : 1) * state.bound * 0.65,
      (state.z > 0 ? -1 : 1) * state.bound * 0.65,
    )
  ) return;

  for (let direction = 0; direction < 8; direction += 1) {
    const yaw = (direction * Math.PI) / 4;
    if (
      tryTarget(
        state.x + Math.sin(yaw) * minimumDistance * 1.01,
        state.z + Math.cos(yaw) * minimumDistance * 1.01,
      )
    ) return;
  }

  // No reachable destination: keep the current position and retry after resting.
  state.targetX = state.x;
  state.targetZ = state.z;
}

/** Pick whether the pet should keep resting or head to a new destination. */
function scheduleNextAction(state: WanderState, random: Random) {
  const roll = random();
  if (roll < IDLE_PROBABILITY) {
    // A stationary action keeps the current destination, so the next update
    // will schedule another action after this deliberately long pause.
    state.targetX = state.x;
    state.targetZ = state.z;
    state.wait = IDLE_WAIT_MIN + roll / IDLE_PROBABILITY * IDLE_WAIT_RANGE;
    return;
  }

  chooseTarget(state, random);
  // Reuse the branch roll to avoid an extra random draw when selecting a
  // destination (which keeps deterministic callers predictable).
  state.wait = MOVE_WAIT_MIN + ((roll - IDLE_PROBABILITY) / (1 - IDLE_PROBABILITY)) * MOVE_WAIT_RANGE;
}

export function createWander(
  bound: number,
  random: Random = Math.random,
  obstacles: readonly WanderObstacle[] = [],
  start?: { x: number; z: number },
): WanderState {
  const state: WanderState = {
    bound: Number.isFinite(bound) ? Math.max(0, bound) : 0,
    obstacles,
    x: start?.x ?? 0,
    z: start?.z ?? 0,
    yaw: 0,
    targetX: 0,
    targetZ: 0,
    wait: INITIAL_WAIT,
    speed: 0,
  };
  // Expanded furniture may cover the room center. Start in the nearest clear
  // spot so a larger animated pet is never born overlapping a table or chair.
  const blocked = (x: number, z: number) => obstacles.some((o) => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ);
  if (!start && blocked(0, 0)) {
    const candidates: { x: number; z: number }[] = [];
    for (let x = -state.bound; x <= state.bound; x += 0.25) {
      for (let z = -state.bound; z <= state.bound; z += 0.25) {
        if (!blocked(x, z)) candidates.push({ x, z });
      }
    }
    candidates.sort((a, b) => a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z);
    if (candidates[0]) { state.x = candidates[0].x; state.z = candidates[0].z; }
  }
  chooseTarget(state, random);
  return state;
}

/** User-requested resume bypasses the random resting schedule. */
export function resumeWander(state: WanderState, random: Random = Math.random) {
  state.wait = 0;
  state.speed = 0;
  if (Math.hypot(state.targetX - state.x, state.targetZ - state.z) < 0.001 || routeBlocked(state, state.targetX, state.targetZ)) {
    chooseTarget(state, random);
  }
}

/** Mutates state once per frame. Stop calling this function to pause wandering. */
export function stepWander(
  state: WanderState,
  dt: number,
  random: Random = Math.random,
): void {
  if (!Number.isFinite(dt) || dt <= 0 || state.bound <= 0) return;
  // Background tabs can produce very large frame gaps. Never teleport on return.
  const delta = Math.min(dt, MAX_DELTA);
  if (state.wait > 0) {
    state.speed = 0;
    state.wait = Math.max(0, state.wait - delta);
    return;
  }

  const dx = state.targetX - state.x;
  const dz = state.targetZ - state.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 0.0001) {
    // Recheck in case furniture was added or the caller replaced the destination.
    if (routeBlocked(state, state.targetX, state.targetZ)) {
      chooseTarget(state, random);
      state.wait = MOVE_WAIT_MIN;
      state.speed = 0;
      return;
    }
    const desiredYaw = Math.atan2(dx, dz);
    const turn = angle(desiredYaw - state.yaw);
    const maxTurn = TURN_SPEED * delta;
    state.yaw = angle(
      state.yaw + Math.max(-maxTurn, Math.min(maxTurn, turn)),
    );

    // Turn toward the next destination before setting off, avoiding sideways slides.
    if (Math.abs(angle(desiredYaw - state.yaw)) > 0.12) { state.speed = 0; return; }
    const desiredSpeed = Math.min(SPEED, Math.sqrt(2 * ACCELERATION * distance));
    state.speed += Math.max(-ACCELERATION * delta, Math.min(ACCELERATION * delta, desiredSpeed - state.speed));
    const travel = Math.min(state.speed * delta, distance);
    state.x = Math.max(
      -state.bound,
      Math.min(state.bound, state.x + (dx / distance) * travel),
    );
    state.z = Math.max(
      -state.bound,
      Math.min(state.bound, state.z + (dz / distance) * travel),
    );
    if (travel < distance) return;
  }

  state.speed = 0;
  scheduleNextAction(state, random);
}
