import { useCallback, useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Group,
  GridHelper,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { disposeObject, loadModel } from "../lib/model";
import { preparePetModel } from "../lib/pet-motion";
import type { ModelAsset } from "../lib/assets";

export type PetProfile = {
  name: string;
  gender: string;
  mbti: string;
  age: string;
  introduction: string;
  facingYaw: number;
};

type Props = {
  asset: ModelAsset;
  onCancel: () => void;
  onConfirm: (profile: PetProfile) => void;
  onError: (message: string) => void;
};

const EMPTY_PROFILE: PetProfile = {
  name: "",
  gender: "",
  mbti: "",
  age: "",
  introduction: "",
  facingYaw: 0,
};

function ModelPreview({ asset, onError, onReady, onFacingChange }: {
  asset: ModelAsset;
  onError: (message: string) => void;
  onReady: () => void;
  onFacingChange: (yaw: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onError("无法启动 3D 预览，请开启浏览器硬件加速。");
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(new Color("#dff6ef"), 0);
    renderer.domElement.setAttribute("aria-label", "宠物 3D 预览");
    container.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 1.45));
    const key = new DirectionalLight(0xfff8df, 2.2);
    key.position.set(4, 7, 5);
    scene.add(key);
    const fill = new DirectionalLight(0xbbe9ff, 1.2);
    fill.position.set(-5, 3, -4);
    scene.add(fill);
    const grid = new GridHelper(8, 16, "#b5d9cf", "#d0e9e1");
    grid.position.y = -0.02;
    grid.material.transparent = true;
    grid.material.opacity = 0.48;
    scene.add(grid);
    const camera = new PerspectiveCamera(28, 1, 0.1, 100);
    // Same elevation as the room; horizontal orbit selects the pet's entry facing.
    camera.position.set(0, 3.72, 4.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.target.set(0, 0.8, 0);
    controls.minDistance = 2.5;
    controls.maxDistance = 8;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.update();
    controls.minPolarAngle = controls.maxPolarAngle = controls.getPolarAngle();
    const reportFacing = () => onFacingChange(-controls.getAzimuthalAngle());
    controls.addEventListener("change", reportFacing);

    let disposed = false;
    let modelRoot: Group | null = null;
    loadModel(asset)
      .then((model) => {
        if (disposed) {
          disposeObject(model.root);
          return;
        }
        modelRoot = preparePetModel(model).root;
        scene.add(modelRoot);
        setLoading(false);
        onReady();
        renderer.render(scene, camera);
      })
      .catch((error) => {
        if (disposed) return;
        setLoading(false);
        onError(error instanceof Error ? error.message : "模型读取失败。");
      });

    const render = () => {
      controls.update();
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(render);
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.removeEventListener("change", reportFacing);
      grid.geometry.dispose();
      grid.material.dispose();
      if (modelRoot) {
        scene.remove(modelRoot);
        disposeObject(modelRoot);
      }
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [asset, onError, onReady, onFacingChange]);
  return <div ref={host} className="pet-preview-canvas">{loading ? <div className="preview-loading"><span className="loading-dot" />正在准备 3D 预览…</div> : null}</div>;
}

export default function PetProfileCard({ asset, onCancel, onConfirm, onError }: Props) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [submitted, setSubmitted] = useState(false);
  const [ready, setReady] = useState(false);
  const facingYaw = useRef(0);
  const handleReady = useCallback(() => setReady(true), []);
  const handleFacing = useCallback((yaw: number) => { facingYaw.current = yaw; }, []);
  const update = (key: keyof PetProfile, value: string) =>
    setProfile((current) => ({ ...current, [key]: value }));
  const invalid = !profile.name.trim() || !profile.gender || !profile.mbti || !profile.age;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (invalid || !ready) return;
    onConfirm({ ...profile, facingYaw: facingYaw.current, name: profile.name.trim(), introduction: profile.introduction.trim() });
  }

  return (
    <section className="profile-overlay" aria-label="创建宠物档案">
      <div className="profile-card">
        <div className="profile-card-heading">
          <div>
            <span className="eyebrow">NEW COMPANION</span>
            <h1>为你的宠物写下第一章</h1>
            <p>先看看它的样子，再告诉我们它是谁。确认后，它才会来到你的家园。</p>
          </div>
          <button className="icon-button" type="button" aria-label="取消导入" onClick={onCancel}>×</button>
        </div>
        <div className="profile-card-body">
          <div className="preview-panel">
            <ModelPreview asset={asset} onError={onError} onReady={handleReady} onFacingChange={handleFacing} />
            <div className="preview-hint"><span className="drag-icon">↔</span> 拖动选择入园朝向 · 滚轮缩放</div>
          </div>
          <form className="profile-form" onSubmit={submit} noValidate>
            <div className="form-intro">
              <span className="form-step">01 / 01</span>
              <span className="form-note">带 <b>*</b> 的是必填项</span>
            </div>
            <label>宠物名字 <b>*</b><input autoFocus value={profile.name} onChange={(e) => update("name", e.target.value)} placeholder="给它取一个名字" maxLength={24} /></label>
            <div className="form-row">
              <label>性别 <b>*</b><select value={profile.gender} onChange={(e) => update("gender", e.target.value)}><option value="">请选择</option><option>男孩</option><option>女孩</option><option>不设定</option></select></label>
              <label>年龄 <b>*</b><div className="age-input"><input type="number" min="0" max="999" value={profile.age} onChange={(e) => update("age", e.target.value)} placeholder="例如 2" /><span>岁</span></div></label>
            </div>
            <label>性格 MBTI <b>*</b><select value={profile.mbti} onChange={(e) => update("mbti", e.target.value)}><option value="">选择它的性格</option>{["ENFP · 探险家", "INFP · 梦想家", "ENFJ · 照顾者", "INFJ · 观察者", "ENTP · 点子王", "INTP · 思考家", "ESFP · 开心果", "ISFP · 艺术家", "ESTP · 行动派", "ISTP · 修理匠", "ESFJ · 社交家", "ISFJ · 守护者", "ESTJ · 组织者", "ISTJ · 记录员", "ENTJ · 领队", "INTJ · 策划家"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>详细介绍 <span className="optional">选填</span><textarea value={profile.introduction} onChange={(e) => update("introduction", e.target.value)} placeholder="它喜欢什么？害怕什么？有什么特别的小习惯？" maxLength={280} rows={4} /><span className="char-count">{profile.introduction.length} / 280</span></label>
            {submitted && invalid ? <p className="form-error" role="alert">请先完成名字、性别、年龄和性格的填写。</p> : null}
            <div className="form-actions"><button className="secondary-button" type="button" onClick={onCancel}>重新导入</button><button className="primary-button" type="submit" disabled={!ready}>确认并进入家园 <span>→</span></button></div>
          </form>
        </div>
      </div>
    </section>
  );
}
