import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ACESFilmicToneMapping, AmbientLight, Box3, Color, DirectionalLight, Group, HemisphereLight, Mesh, MOUSE, OrthographicCamera, PCFSoftShadowMap, Scene, SRGBColorSpace, TOUCH, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createClassroom } from "./model";
import { disposeObject, loadModel } from "../lib/model";
import { createWallCutaway } from "../lib/room-view";
import { loadLocalHome } from "../lib/pet-storage";
import { createPetMotion, type PetMotion } from "../lib/pet-motion";
import { CAMPUS_VIEWS, CLASSROOM_X, createCampus, findClassroomSpot, type CampusView } from "./campus";
import "./styles.css";

function ClassroomPreview() {
  const host = useRef<HTMLDivElement>(null);
  const reset = useRef<(() => void) | null>(null);
  const focus = useRef<((view: CampusView) => void) | null>(null);
  const [view, setView] = useState<CampusView>("overview");
  const [petNames, setPetNames] = useState<string[]>([]);
  const [petStatus, setPetStatus] = useState("正在接伙伴来教室…");
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const container = host.current!;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    async function start() {
      const home = await loadLocalHome().catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "读取宠物存档失败。");
        return null;
      });
      if (cancelled) return;
      setPetNames([]); setPetStatus("正在接伙伴来教室…");
      let renderer: WebGLRenderer;
      try { renderer = new WebGLRenderer({ antialias: true }); }
      catch { setError("无法启动 3D 预览，请开启浏览器硬件加速后刷新。"); return; }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = .88;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
      renderer.domElement.setAttribute("aria-label", "卧室与教室 3D 场景，可拖动旋转");
      container.append(renderer.domElement);
      const scene = new Scene(); scene.background = new Color("#e8eee5");
      const campus = createCampus(home?.furniture); scene.add(campus.root);
      const camera = new OrthographicCamera(-15, 15, 10, -10, .1, 150);
      const viewOffset = new Vector3(10, 19, 30);
      let currentView: CampusView = "overview";
      camera.position.copy(CAMPUS_VIEWS.overview.target).add(viewOffset);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(CAMPUS_VIEWS.overview.target);
      controls.enableDamping = true; controls.dampingFactor = .085; controls.rotateSpeed = .65;
      controls.minPolarAngle = Math.PI / 12; controls.maxPolarAngle = Math.PI * .4;
      controls.minZoom = .65; controls.maxZoom = 4;
      controls.mouseButtons.LEFT = MOUSE.ROTATE; controls.mouseButtons.RIGHT = MOUSE.PAN;
      controls.touches.ONE = TOUCH.ROTATE; controls.touches.TWO = TOUCH.DOLLY_PAN;
      controls.update(); controls.saveState();
      const cutaway = createWallCutaway(campus.walls);
      scene.add(new AmbientLight("#fff3df", .9), new HemisphereLight("#eefcff", "#b6a47d", 1.1));
      const sun = new DirectionalLight("#fff2ce", 2);
      sun.position.set(0, 16, 10); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 12, bottom: -12, near: .1, far: 55 });
      sun.shadow.normalBias = .025; sun.shadow.bias = -.0001; sun.shadow.radius = 4;
      scene.add(sun);
      const fill = new DirectionalLight("#e8f5ff", 1.1); fill.position.set(7, 6, -1); scene.add(fill);
      const visitors: { mover: Group; motion: PetMotion; label: HTMLDivElement; x: number; z: number; radius: number }[] = [];
      const projected = new Vector3();
      const render = () => {
        controls.update(); cutaway.update(camera, true); renderer.render(scene, camera);
        for (const pet of visitors) {
          projected.set(pet.x + CLASSROOM_X, pet.motion.height + .22, pet.z).project(camera);
          pet.label.hidden = Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1;
          pet.label.style.transform = `translate(${(projected.x + 1) / 2 * container.clientWidth}px, ${(1 - projected.y) / 2 * container.clientHeight}px) translate(-50%, -100%)`;
        }
      };
      const resize = () => {
        const { width, height } = container.getBoundingClientRect(); if (!width || !height) return;
        const preset = CAMPUS_VIEWS[currentView];
        const aspect = width / height, span = Math.max(preset.vertical, preset.horizontal / aspect);
        camera.left = -span * aspect; camera.right = span * aspect; camera.top = span; camera.bottom = -span;
        camera.updateProjectionMatrix(); renderer.setSize(width, height); render();
      };
      focus.current = (nextView) => {
        const damping = controls.enableDamping; controls.enableDamping = false; controls.update();
        currentView = nextView;
        controls.target.copy(CAMPUS_VIEWS[nextView].target);
        camera.position.copy(controls.target).add(viewOffset); camera.zoom = 1;
        controls.update(); controls.enableDamping = damping;
        resize();
      };
      reset.current = () => { focus.current?.("overview"); setView("overview"); };
      const observer = new ResizeObserver(resize); observer.observe(container); resize();
      renderer.setAnimationLoop(render); setReady(true);
      cleanup = () => {
        reset.current = null; focus.current = null; observer.disconnect(); renderer.setAnimationLoop(null);
        visitors.forEach(pet => { pet.label.remove(); pet.motion.dispose(); });
        cutaway.dispose(); controls.dispose(); disposeObject(campus.root); sun.shadow.dispose();
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      };
      const records = home?.pets ?? [];
      if (!records.length) { setPetStatus("当前浏览器还没有宠物存档，请用保存奶蛙等伙伴的浏览器打开这里。"); return; }
      const failed: string[] = [];
      // Load one model at a time: three imported meshes can each be tens of MB.
      for (const [index, record] of records.entries()) {
        if (cancelled) return;
        let motion: PetMotion | undefined;
        let loaded: Awaited<ReturnType<typeof loadModel>> | undefined;
        try {
          loaded = await loadModel(record.asset, new URL("../draco/", window.location.href).href);
          if (cancelled) { disposeObject(loaded.root); return; }
          // Measure the normalized asset before procedural bones alter its local bounds.
          const size = new Box3().setFromObject(loaded.root).getSize(new Vector3());
          motion = createPetMotion(loaded);
          const radius = Math.hypot(size.x, size.z) / 2 + motion.clearance;
          const spot = findClassroomSpot(radius, campus.obstacles, visitors, index);
          if (!spot) throw new Error("教室空位不足");
          const mover = new Group(); mover.name = `classroom-pet-${record.id}`;
          mover.userData = { kind: "pet", name: record.profile.name, radius };
          mover.add(motion.root); mover.position.set(spot.x, .018, spot.z);
          mover.rotation.y = Math.atan2(viewOffset.x, viewOffset.z) + record.profile.facingYaw;
          mover.traverse(node => { if (node instanceof Mesh) node.castShadow = node.receiveShadow = true; });
          motion.update(0, { ...spot, yaw: mover.rotation.y });
          const label = document.createElement("div"); label.className = "classroom-pet-name";
          label.textContent = record.profile.name; label.hidden = true; container.append(label);
          campus.classroom.root.add(mover);
          visitors.push({ mover, motion, label, radius, ...spot });
          setPetNames(previous => [...previous, record.profile.name]);
          setPetStatus(`已到教室 ${visitors.length} / ${records.length}`);
          render();
        } catch (reason) {
          if (motion) { motion.dispose(); disposeObject(motion.root); }
          else if (loaded) disposeObject(loaded.root);
          failed.push(`${record.profile.name}（${reason instanceof Error ? reason.message : "模型读取失败"}）`);
        }
      }
      if (!cancelled) {
        setPetStatus(`已到教室 ${visitors.length} / ${records.length}`);
        if (failed.length) setError(`${failed.join("、")}暂时未能进入教室，请刷新重试。`);
      }
    }
    start().catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "场景加载失败，请刷新重试。"); });
    return () => { cancelled = true; cleanup?.(); };
  }, []);
  async function download() {
    if (exporting) return;
    setExporting(true); setError(""); setMessage("");
    // Export a fresh complete model, including walls hidden by the preview camera.
    let model: ReturnType<typeof createClassroom> | undefined;
    try {
      const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
      model = createClassroom();
      const buffer = await new GLTFExporter().parseAsync(model.root, { binary: true });
      if (!(buffer instanceof ArrayBuffer)) throw new Error("模型导出失败，请重试。");
      const url = URL.createObjectURL(new Blob([buffer], { type: "model/gltf-binary" }));
      const link = document.createElement("a"); link.href = url; link.download = "little-classroom.glb"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage("教室模型已导出，包含全部家具与贴图。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "模型导出失败，请重试。"); }
    finally { if (model) disposeObject(model.root); setExporting(false); }
  }
  return <main className="classroom-app">
    <div ref={host} className="classroom-canvas" />
    <header className="classroom-header">
      <div><span className="eyebrow">LITTLE NEIGHBORHOOD / 01</span><h1>家旁边的小教室</h1><p>一边是家，一边是新的小世界。</p></div>
      <span className="preview-badge"><i />卧室 ＋ 教室</span>
    </header>
    <aside className="classroom-inventory" aria-label="教室物件清单"><span>教室布置</span><ul><li><b>02</b> 扇窗户</li><li><b>01</b> 块黑板</li><li><b>01</b> 张讲台桌</li><li><b>03</b> 套课桌椅</li></ul><div className="classroom-attendance" role="status"><strong>{petStatus}</strong>{petNames.length ? <span>{petNames.join(" · ")}</span> : <a href="../">回到房间导入宠物 ↗</a>}</div></aside>
    <nav className="classroom-views" aria-label="场景视角">{([ ["overview", "一起看"], ["bedroom", "看卧室"], ["classroom", "看教室"] ] as const).map(([key, title]) => <button key={key} disabled={!ready} aria-pressed={view === key} onClick={() => { setView(key); focus.current?.(key); }}>{title}</button>)}</nav>
    <footer className="classroom-controls">
      <div><strong>两个房间，各自精彩</strong><span>拖动旋转 · 滚轮 / 双指缩放 · 右键拖动平移</span></div>
      <button type="button" disabled={!ready} onClick={() => reset.current?.()}>重置视角</button>
      <button type="button" className="download-button" disabled={!ready || exporting} onClick={download}>{exporting ? "正在导出…" : "下载教室 .GLB"}<span aria-hidden="true">↓</span></button>
    </footer>
    {!ready && !error ? <div className="preview-loading" role="status">正在布置教室…</div> : null}
    {message || error ? <div className={`classroom-message${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>{error || message}<button aria-label="关闭提示" onClick={() => { setError(""); setMessage(""); }}>×</button></div> : null}
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><ClassroomPreview /></StrictMode>);
