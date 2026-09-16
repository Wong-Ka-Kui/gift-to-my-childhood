import {
  AmbientLight, CanvasTexture, Color, DirectionalLight, Group,
  HemisphereLight, MathUtils, Mesh, MeshBasicMaterial, SpotLight,
  SRGBColorSpace, type Object3D, type Scene,
} from "three";
import { getGameTime } from "./game-time";
import { getDayNightState, type DayNightState } from "./day-night-state";
import { disposeObject } from "./model";

function canvasMap(width: number, height: number) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d")!;
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  return { canvas, context, texture };
}

/** A shared landscape in every window: changing sky, traveling clouds, hills and stars. */
function paintWindow(ctx: CanvasRenderingContext2D, state: DayNightState, minutes: number) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, state.top); gradient.addColorStop(.78, state.horizon); gradient.addColorStop(1, state.hill);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = state.night;
  for (let i = 0; i < 36; i++) {
    const x = ((i * 137.51 + 39) % w), y = 18 + ((i * 79.31) % (h * .57));
    ctx.fillStyle = i % 3 ? "#cbdcfa" : "#fff7de";
    ctx.beginPath(); ctx.arc(x, y, i % 4 === 0 ? 1.9 : 1, 0, Math.PI * 2); ctx.fill();
  }
  const dayProgress = (state.hour - 6) / 12;
  if (dayProgress >= 0 && dayProgress <= 1) {
    const x = w * (.12 + .76 * dayProgress), y = h * (.76 - .54 * Math.sin(dayProgress * Math.PI));
    const glow = ctx.createRadialGradient(x, y, 4, x, y, 62);
    glow.addColorStop(0, "#fff7dca6"); glow.addColorStop(1, "#fff7dc00");
    ctx.globalAlpha = MathUtils.smoothstep(dayProgress, 0, .035) * (1 - MathUtils.smoothstep(dayProgress, .965, 1)); ctx.fillStyle = glow; ctx.fillRect(x - 62, y - 62, 124, 124);
    ctx.fillStyle = "#fff1c1"; ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = state.night;
  const moonProgress = ((state.hour + 6) % 24) / 12;
  const moonX = w * (.17 + .65 * Math.min(1, moonProgress)), moonY = h * (.63 - .42 * Math.sin(Math.min(1, moonProgress) * Math.PI));
  ctx.fillStyle = "#f8efcf"; ctx.beginPath(); ctx.arc(moonX, moonY, 19, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#d6d7c5"; ctx.beginPath(); ctx.arc(moonX - 4, moonY + 6, 4, 0, Math.PI * 2); ctx.arc(moonX + 7, moonY - 5, 3, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = .17 + .53 * state.daylight;
  ctx.fillStyle = "#fff9ee";
  for (let i = 0; i < 3; i++) {
    const x = ((i * 223 + minutes * .45) % (w + 150)) - 75, y = h * (.19 + i * .13);
    ctx.beginPath();ctx.ellipse(x, y, 56, 11, 0, 0, Math.PI * 2);ctx.ellipse(x - 14, y - 10, 23, 18, 0, 0, Math.PI * 2);ctx.ellipse(x + 13, y - 12, 27, 21, 0, 0, Math.PI * 2);ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = state.hill; ctx.beginPath(); ctx.moveTo(0, h * .79);
  ctx.bezierCurveTo(w * .24, h * .58, w * .44, h * .94, w * .7, h * .77);ctx.quadraticCurveTo(w * .9, h * .66, w, h * .73);ctx.lineTo(w, h);ctx.lineTo(0, h);ctx.fill();
  ctx.fillStyle = new Color(state.hill).multiplyScalar(.62).getStyle();
  ctx.beginPath();ctx.moveTo(0, h * .93);ctx.bezierCurveTo(w * .34, h * .72, w * .62, h * 1.05, w, h * .85);ctx.lineTo(w, h);ctx.lineTo(0, h);ctx.fill();
  for (const [x,y] of [[45,.84],[80,.87],[440,.85],[475,.82]]) {
    ctx.fillRect(x - 2, h * y - 9, 4, 32);ctx.beginPath();ctx.moveTo(x, h * y - 44);ctx.lineTo(x - 17, h * y);ctx.lineTo(x + 17, h * y);ctx.fill();
  }
}

export function createDayNight(scene: Scene, roots: Object3D[], timeOrigin: number) {
  const backdrop = canvasMap(32, 256), windowSky = canvasMap(512, 384);
  scene.background = backdrop.texture;
  const windows: { material: MeshBasicMaterial; original: MeshBasicMaterial["map"]; opacity: number }[] = [];
  for (const root of roots) root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material instanceof MeshBasicMaterial && material.userData.dayNightWindow) {
        windows.push({ material, original: material.map, opacity: material.opacity }); material.map = windowSky.texture; material.needsUpdate = true;
      }
    }
  });
  const ambient = new AmbientLight("#d3e2ff", .3); ambient.name = "cycle-ambient";
  const hemisphere = new HemisphereLight("#d5e7ff", "#594d57", .6);
  const sun = new DirectionalLight("#fff1d5", 1.4); sun.name = "cycle-sun"; sun.target.position.set(8, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 23, bottom: -23, far: 90 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.0001; sun.shadow.radius = 5;
  const moon = new DirectionalLight("#a7beff", .2); moon.name = "cycle-moon"; moon.position.set(-8, 18, 9);
  scene.add(ambient, hemisphere, sun, sun.target, moon);

  const nightAmbient = new Color("#acc7f4"), dayAmbient = new Color("#fff4e4");
  // Only light is rendered: the ceiling fixture is deliberately invisible in
  // the cutaway room, and remains independent of which wall is currently shown.
  const fixtures = new Group(); fixtures.name = "hidden-ceiling-lighting";
  const lamps: SpotLight[] = [];
  for (const [x, y, z] of [[0, 4.8, 0], [13.6, 5.8, 0], [18.4, 5.8, 0]]) {
    const light = new SpotLight("#ffdfaa", 0, 18, Math.PI * .44, .85, 1.5);
    light.name = "indoor-ceiling-light";
    light.position.set(x, y, z); light.target.position.set(x, 0, z);
    fixtures.add(light, light.target); lamps.push(light);
  }
  scene.add(fixtures);
  const clock = roots[1]?.getObjectByName("wall-clock");
  const minuteHand = clock?.getObjectByName("minute-hand"), hourHand = clock?.getObjectByName("hour-hand");
  let lastPaint = -Infinity;
  function update(now = Date.now()) {
    const time = getGameTime(timeOrigin, now), state = getDayNightState(time.minuteOfDay);
    ambient.intensity = state.ambientIntensity; ambient.color.copy(nightAmbient).lerp(dayAmbient, state.daylight);
    hemisphere.intensity = state.hemisphereIntensity; hemisphere.color.set(state.top); hemisphere.groundColor.set(state.hill);
    sun.intensity = state.sunIntensity; sun.color.set(state.sunColor);
    sun.position.set(8 - Math.cos(state.solarAngle) * 24, 3 + Math.max(0, Math.sin(state.solarAngle)) * 27, 10);
    moon.intensity = .23 * state.night;
    lamps.forEach(light => { light.intensity = state.lamps * 40; });
    if (minuteHand) minuteHand.rotation.z = -time.minuteOfDay / 60 * Math.PI * 2;
    if (hourHand) hourHand.rotation.z = -time.minuteOfDay / 720 * Math.PI * 2;
    // Texture uploads run four times a second; lighting/shadows remain frame smooth.
    if (now - lastPaint >= 250 || now < lastPaint) {
      lastPaint = now;
      const gradient = backdrop.context.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, state.top); gradient.addColorStop(1, state.horizon);
      backdrop.context.fillStyle = gradient; backdrop.context.fillRect(0, 0, 32, 256); backdrop.texture.needsUpdate = true;
      paintWindow(windowSky.context, state, time.totalMinutes); windowSky.texture.needsUpdate = true;
    }
  }
  update();
  return { update, dispose() {
    windows.forEach(({material, original, opacity}) => { material.map = original; material.opacity = opacity; });
    for (const light of lamps) light.removeFromParent();
    for (const node of [ambient, hemisphere, sun, sun.target, moon, fixtures]) node.removeFromParent();
    disposeObject(fixtures); sun.shadow.dispose(); backdrop.texture.dispose(); windowSky.texture.dispose();
    scene.background = null;
  } };
}
