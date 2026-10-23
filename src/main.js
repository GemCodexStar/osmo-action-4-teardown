import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createAction4Model } from './model.js';
import { PARTS, PART_GROUPS, PART_MAP } from './data.js';
import {
  setTextureAnisotropy,
  makeGlowTexture,
  makeReticleTexture,
  makeShadowTexture,
} from './textures.js';

const stage = document.getElementById('stage');
const annotationLayer = document.getElementById('annotationLayer');
const leaderLayer = document.getElementById('leaderLayer');
const partList = document.getElementById('partList');
const detailsScroll = document.getElementById('detailsScroll');
const hoverTip = document.getElementById('hoverTip');
const hoverTipName = document.getElementById('hoverTipName');
const topState = document.getElementById('topState');
const viewState = document.getElementById('viewState');
const viewStateText = viewState.querySelector('span');
const explodedCount = document.getElementById('explodedCount');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const segmentsEl = document.getElementById('segments');
const teardownIndex = document.getElementById('teardownIndex');
const zoomValue = document.getElementById('zoomValue');
const stageFocus = document.getElementById('stageFocus');
const focusNumber = document.getElementById('focusNumber');
const focusName = document.getElementById('focusName');
const explodeAllBtn = document.getElementById('explodeAllBtn');
const resetBtn = document.getElementById('resetBtn');
const rotateBtn = document.getElementById('rotateBtn');
const labelsBtn = document.getElementById('labelsBtn');
const overviewBtn = document.getElementById('overviewBtn');
const guideBtn = document.getElementById('guideBtn');
const guideModal = document.getElementById('guideModal');
const loader = document.getElementById('loader');
const loaderBar = document.getElementById('loaderBar');
const loaderPct = document.getElementById('loaderPct');
const loaderMessage = document.getElementById('loaderMessage');
const errorState = document.getElementById('errorState');

const FOV = 34;
const DEFAULT_VIEW_DIR = new THREE.Vector3(0.55, 0.32, 0.77).normalize();
const TOTAL = PARTS.length;
const KEY_EXTERIOR = new Set(['lens', 'frontDisplay', 'rearDisplay', 'shell']);
const LABEL_CARD_WIDTH = 152;
const LABEL_CARD_HEIGHT = 39;
const LABEL_COLUMN_MARGIN = 10;
const LABEL_ROW_GAP = 9;
const RELATED_PARTS = {
  lens: ['sensor', 'frontDisplay', 'shell'],
  sensor: ['lens', 'mainboard', 'battery'],
  mainboard: ['sensor', 'thermal', 'battery'],
  thermal: ['mainboard', 'shell', 'audio'],
  audio: ['controls', 'frontDisplay', 'shell'],
  shell: ['frontDisplay', 'rearDisplay', 'lens'],
  frontDisplay: ['rearDisplay', 'controls', 'shell'],
  rearDisplay: ['frontDisplay', 'battery', 'shell'],
  controls: ['frontDisplay', 'audio', 'shell'],
  battery: ['ioCover', 'mainboard', 'rearDisplay'],
  ioCover: ['battery', 'mount', 'shell'],
  mount: ['ioCover', 'shell', 'battery'],
};
const SVG_NS = 'http://www.w3.org/2000/svg';

const state = {
  selectedId: null,
  hoveredId: null,
  labelsOn: true,
  autoRotate: false,
  cameraTween: null,
  modalOpen: false,
  pointerDown: null,
  pointerMoved: false,
  lastZoomLabel: '',
};

let renderer;
let scene;
let camera;
let controls;
let composer;
let bloomPass;
let modelRoot;
let parts = {};
let clock;
let raycaster;
let pointerNdc;
let spriteGlow;
let spriteReticle;
let shadowPlane;
let floorGlow;
let ringGroup;
let starField;
let tickGroup;
let animationId;
let totalTime = 0;
let homePose;
let currentBaseDistance = 15;

const tmpVec3 = new THREE.Vector3();
const tmpVec3b = new THREE.Vector3();
const tmpColor = new THREE.Color();
const annotationRaycaster = new THREE.Raycaster();
const occlusionCache = new Map();
let occlusionTick = 0;
const partItems = new Map();
const annotations = new Map();
const materialsByPart = new Map();

init();

function init() {
  try {
    setupRenderer();
    setupScene();
    setupCamera();
    setupModel();
    setupEnvironment();
    setupLighting();
    buildBackdrop();
    setupComposer();
    setupUi();
    setupPointerEvents();
    setupKeyboard();
    setupResize();
    observeLoad();

    clock = new THREE.Clock();
    animate();
  } catch (error) {
    showFatalError(error);
  }
}

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  if (!renderer.getContext()) {
    throw new Error('WebGL context unavailable');
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(stage.clientWidth || 1, stage.clientHeight || 1, false);
  renderer.setClearColor(0x04080c, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.01;
  renderer.shadowMap.enabled = false;

  renderer.domElement.setAttribute('aria-label', 'DJI Osmo Action 4 可交互三维模型');
  stage.insertBefore(renderer.domElement, stage.firstChild);

  setTextureAnisotropy(Math.min(renderer.capabilities.getMaxAnisotropy(), 8));

  raycaster = new THREE.Raycaster();
  pointerNdc = new THREE.Vector2();
}

function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04080c);
  scene.fog = new THREE.FogExp2(0x04080c, 0.012);
}

function setupCamera() {
  const width = stage.clientWidth || 800;
  const height = stage.clientHeight || 700;
  camera = new THREE.PerspectiveCamera(FOV, width / height, 0.1, 140);
  homePose = computeHomePose();

  const farPosition = homePose.target
    .clone()
    .add(homePose.position.clone().sub(homePose.target).multiplyScalar(1.16));
  camera.position.copy(farPosition);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(homePose.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.rotateSpeed = 0.58;
  controls.zoomSpeed = 0.8;
  controls.minDistance = 8.5;
  controls.maxDistance = 46;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.autoRotateSpeed = 0.85;
  controls.update();

  controls.addEventListener('start', () => {
    state.cameraTween = null;
    stage.classList.add('is-dragging');
    hideHover();
  });

  controls.addEventListener('end', () => {
    stage.classList.remove('is-dragging');
  });
}

function computeHomePose() {
  const width = stage.clientWidth || 800;
  const height = stage.clientHeight || 700;
  const aspect = Math.max(width / height, 0.72);
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  const centralWidth = Math.max(
    width - (LABEL_CARD_WIDTH + LABEL_COLUMN_MARGIN) * 2,
    330
  );
  const targetPixels = centralWidth * 0.98;
  const visibleWorldWidth = 7.6 * (width / targetPixels);
  const distance = THREE.MathUtils.clamp(
    visibleWorldWidth / (2 * tan * aspect),
    10.5,
    38
  );
  const target = new THREE.Vector3(0, 0.34, 0);
  const position = target.clone().addScaledVector(DEFAULT_VIEW_DIR, distance);
  return { target, position, distance };
}

function computeExplodedPose() {
  const width = stage.clientWidth || 800;
  const height = stage.clientHeight || 700;
  const aspect = Math.max(width / height, 0.72);
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  const centralWidth = Math.max(
    width - (LABEL_CARD_WIDTH + LABEL_COLUMN_MARGIN) * 2,
    330
  );
  const targetPixels = centralWidth * 0.98;
  const visibleWorldWidth = 12.9 * (width / targetPixels);
  const distance = THREE.MathUtils.clamp(
    Math.max(visibleWorldWidth / (2 * tan * aspect), 18),
    18,
    44
  );
  const target = new THREE.Vector3(0, 0.16, 0);
  const direction = camera.position.clone().sub(controls.target).normalize();
  const position = target.clone().addScaledVector(direction, distance);
  return { target, position, distance };
}

function setupModel() {
  const result = createAction4Model();
  modelRoot = result.root;
  parts = result.parts;
  scene.add(modelRoot);
  modelRoot.updateMatrixWorld(true);

  PARTS.forEach((partData) => {
    const part = parts[partData.id];
    if (!part) return;

    const box = new THREE.Box3().setFromObject(part.group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    part.localCenter = part.group.worldToLocal(center.clone());
    part.fxRadius = THREE.MathUtils.clamp(size.length() * 0.28, 0.7, 4.4);
    part.lastHighlightMode = undefined;

    if (part.isShell && part.ghostMats) {
      part.ghostMaterialState = [];
      const seen = new Set();
      part.group.traverse((object) => {
        const materials = object.material
          ? Array.isArray(object.material)
            ? object.material
            : [object.material]
          : [];
        materials.forEach((material) => {
          if (!material || material === part.ghostOutlineMat || seen.has(material)) return;
          seen.add(material);
          part.ghostMaterialState.push({
            material,
            opacity: material.opacity,
            transparent: material.transparent,
            depthWrite: material.depthWrite,
          });
        });
      });
      part.currentGhostTransparency = null;
    }

    collectMaterials(partData.id);
  });
}

function collectMaterials(id) {
  const part = parts[id];
  const list = [];
  const seen = new Set();
  part.group.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material || !material.emissive || seen.has(material)) return;
      if (material.transparent && material.depthWrite === false) return;
      seen.add(material);
      if (material.userData.baseEmissive === undefined) {
        material.userData.baseEmissive = material.emissive.clone();
        material.userData.baseEmissiveIntensity = material.emissiveIntensity || 0;
      }
      list.push(material);
    });
  });
  materialsByPart.set(id, list);
}

function setupEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTexture = pmrem.fromScene(room, 0.04).texture;
  scene.environment = envTexture;
  room.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) object.material.dispose();
  });
  pmrem.dispose();
}

function setupLighting() {
  const hemi = new THREE.HemisphereLight(0x9bd9ea, 0x05090b, 0.4);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xddf8ff, 2.2);
  key.position.set(8, 11, 9);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x38bce0, 2.0);
  rim.position.set(-9, 4, -7);
  scene.add(rim);

  const warm = new THREE.PointLight(0xff7a5d, 11, 15, 2);
  warm.position.set(-5, -2.2, 4.2);
  scene.add(warm);

  const fill = new THREE.DirectionalLight(0x6e8fa2, 0.7);
  fill.position.set(-2, -5, 7);
  scene.add(fill);
}

function buildBackdrop() {
  const bgGeometry = new THREE.SphereGeometry(64, 40, 24);
  const bgMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x0a1820) },
      uMid: { value: new THREE.Color(0x050c11) },
      uBottom: { value: new THREE.Color(0x020406) },
      uGlow: { value: new THREE.Color(0x1b677a) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uBottom;
      uniform vec3 uGlow;
      void main() {
        vec3 dir = normalize(vPos);
        float h = dir.y;
        vec3 color = mix(uBottom, uMid, smoothstep(-0.85, 0.06, h));
        color = mix(color, uTop, smoothstep(0.02, 0.9, h));
        float backGlow = pow(max(dot(dir, normalize(vec3(-0.16, 0.08, -1.0))), 0.0), 5.0);
        float sideGlow = pow(max(dot(dir, normalize(vec3(-0.9, 0.25, 0.35))), 0.0), 9.0);
        color += uGlow * backGlow * 0.12;
        color += vec3(0.12, 0.3, 0.36) * sideGlow * 0.035;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const bgSphere = new THREE.Mesh(bgGeometry, bgMaterial);
  bgSphere.renderOrder = -10;
  scene.add(bgSphere);

  const starCount = 540;
  const positions = new Float32Array(starCount * 3);
  const color = new THREE.Color();
  const colors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const radius = 22 + Math.random() * 26;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[i * 3 + 1] = Math.cos(phi) * radius * 0.7;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    color.setHSL(0.52 + Math.random() * 0.08, 0.35, 0.55 + Math.random() * 0.3);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const starMaterial = new THREE.PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  });
  starField = new THREE.Points(starGeometry, starMaterial);
  starField.renderOrder = -5;
  scene.add(starField);

  buildFloor();
  buildSelectionFx();
}

function buildFloor() {
  const floorY = -5.05;

  const gridGeometry = new THREE.PlaneGeometry(42, 42);
  const gridMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x42b8d0) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      float gridLine(vec2 p, float scale) {
        vec2 c = p * scale;
        vec2 grid = abs(fract(c - 0.5) - 0.5) / fwidth(c);
        return 1.0 - min(min(grid.x, grid.y), 1.0);
      }
      void main() {
        vec2 p = (vUv - 0.5) * 38.0;
        float dist = length(p);
        float fade = 1.0 - smoothstep(3.0, 18.5, dist);
        float fine = gridLine(p, 1.0) * 0.15;
        float major = gridLine(p, 0.2) * 0.065;
        float ring = 1.0 - smoothstep(0.0, 0.07, abs(dist - 7.1));
        float pulse = 0.5 + 0.5 * sin(uTime * 0.9 - dist * 0.55);
        float alpha = (fine + major + ring * (0.1 + pulse * 0.07)) * fade;
        gl_FragColor = vec4(uColor, alpha * 0.62);
      }
    `,
  });
  const grid = new THREE.Mesh(gridGeometry, gridMaterial);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = floorY;
  grid.renderOrder = -2;
  scene.add(grid);

  const tickPositions = [];
  const tickCount = 84;
  for (let i = 0; i < tickCount; i += 1) {
    const angle = (i / tickCount) * Math.PI * 2;
    const inner = i % 7 === 0 ? 4.52 : 4.62;
    const outer = 4.74;
    tickPositions.push(
      Math.cos(angle) * inner,
      floorY + 0.012,
      Math.sin(angle) * inner,
      Math.cos(angle) * outer,
      floorY + 0.012,
      Math.sin(angle) * outer
    );
  }
  const tickGeometry = new THREE.BufferGeometry();
  tickGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tickPositions, 3));
  const tickMaterial = new THREE.LineBasicMaterial({
    color: 0x5bcfe4,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  tickGroup = new THREE.LineSegments(tickGeometry, tickMaterial);
  scene.add(tickGroup);

  ringGroup = new THREE.Group();
  ringGroup.position.y = floorY + 0.015;

  const createRing = (radius, opacity, dashed = false) => {
    const points = [];
    const steps = 180;
    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = dashed
      ? new THREE.LineDashedMaterial({
          color: 0x78e8ff,
          transparent: true,
          opacity,
          depthWrite: false,
          dashSize: 0.16,
          gapSize: 0.12,
        })
      : new THREE.LineBasicMaterial({
          color: 0x78e8ff,
          transparent: true,
          opacity,
          depthWrite: false,
        });
    const line = new THREE.Line(geometry, material);
    if (dashed) line.computeLineDistances();
    ringGroup.add(line);
    return line;
  };

  createRing(3.3, 0.17, true);
  createRing(4.48, 0.26);
  createRing(5.55, 0.1, true);

  const arcPoints = [];
  for (let i = 0; i <= 60; i += 1) {
    const angle = Math.PI * 0.18 + (i / 60) * Math.PI * 0.56;
    arcPoints.push(new THREE.Vector3(Math.cos(angle) * 4.48, 0, Math.sin(angle) * 4.48));
  }
  const arc = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(arcPoints),
    new THREE.LineBasicMaterial({
      color: 0x9bf2ff,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    })
  );
  ringGroup.add(arc);
  scene.add(ringGroup);

  const shadowTexture = makeShadowTexture();
  shadowTexture.anisotropy = 4;
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    color: 0x000000,
  });
  shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 8.4), shadowMaterial);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = floorY + 0.02;
  scene.add(shadowPlane);

  const glowTexture = makeGlowTexture();
  glowTexture.anisotropy = 4;
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0x4ddbf5,
  });
  floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(17, 17), glowMaterial);
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.y = floorY + 0.01;
  floorGlow.renderOrder = -1;
  scene.add(floorGlow);
}

function buildSelectionFx() {
  const glowTexture = makeGlowTexture();
  const reticleTexture = makeReticleTexture();

  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0x5ee7ff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  spriteGlow = new THREE.Sprite(glowMaterial);
  spriteGlow.visible = false;
  spriteGlow.renderOrder = 20;
  scene.add(spriteGlow);

  const reticleMaterial = new THREE.SpriteMaterial({
    map: reticleTexture,
    color: 0x78edff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  spriteReticle = new THREE.Sprite(reticleMaterial);
  spriteReticle.visible = false;
  spriteReticle.renderOrder = 21;
  scene.add(spriteReticle);
}

function setupComposer() {
  const width = stage.clientWidth || 1;
  const height = stage.clientHeight || 1;
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,
  });
  renderTarget.samples = 4;

  composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(width, height);

  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.37, 0.55, 0.9);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

function setupUi() {
  renderPartList();
  buildSegments();
  renderOverview();
  syncUi();
  setupModal();

  explodeAllBtn.addEventListener('click', explodeAll);
  resetBtn.addEventListener('click', resetAll);
  rotateBtn.addEventListener('click', () => setAutoRotate(!state.autoRotate));
  labelsBtn.addEventListener('click', () => setLabels(!state.labelsOn));
  overviewBtn.addEventListener('click', clearSelection);

  detailsScroll.addEventListener('click', (event) => {
    const related = event.target.closest('[data-related-part]');
    if (related) {
      handlePartClick(related.dataset.relatedPart);
      return;
    }
    const action = event.target.closest('[data-part-action]');
    if (!action) return;
    togglePart(action.dataset.partAction);
  });
}

function renderPartList() {
  const markup = PART_GROUPS.map(
    (group) => `
      <section class="part-group" aria-label="${group.name}">
        <div class="group-head">
          <span>${group.index}</span>
          <b>${group.name}</b>
          <em>${group.en}</em>
        </div>
        ${group.parts
          .map((id) => {
            const part = PART_MAP[id];
            return `
              <button
                class="part-item"
                type="button"
                data-part="${part.id}"
                style="--part-color:${part.color}"
                aria-pressed="false"
              >
                <span class="part-index">${part.index}</span>
                <span class="part-orb"></span>
                <span class="part-copy">
                  <strong>${part.name}</strong>
                  <small>${part.en}</small>
                </span>
                <span class="part-state" aria-hidden="true"></span>
              </button>
            `;
          })
          .join('')}
      </section>
    `
  ).join('');

  partList.innerHTML = markup;

  partList.querySelectorAll('.part-item').forEach((item) => {
    partItems.set(item.dataset.part, item);
    item.addEventListener('click', () => handlePartClick(item.dataset.part));
    item.addEventListener('mouseenter', () => {
      if (!state.pointerDown) setHoveredPart(item.dataset.part);
    });
    item.addEventListener('mouseleave', () => {
      if (state.hoveredId === item.dataset.part) setHoveredPart(null);
    });
  });
}

function createAnnotations() {
  PARTS.forEach((part) => {
    const el = document.createElement('div');
    el.className = 'anno';
    el.dataset.part = part.id;
    el.dataset.side = 'right';
    el.innerHTML = `
      <span class="anno-dot"></span>
      <button class="anno-card" type="button" aria-label="查看${part.name}">
        <span class="anno-num">${part.index}</span>
        <span class="anno-copy">
          <span class="anno-name">${part.name}</span>
          <span class="anno-spec">${part.short}</span>
        </span>
      </button>
    `;
    annotationLayer.appendChild(el);

    const card = el.querySelector('.anno-card');
    card.addEventListener('click', (event) => {
      event.stopPropagation();
      handlePartClick(part.id);
    });
    card.addEventListener('mouseenter', () => {
      hoverTip.classList.remove('is-visible');
      if (!state.pointerDown) setHoveredPart(part.id);
    });
    card.addEventListener('mouseleave', () => {
      if (state.hoveredId === part.id) setHoveredPart(null);
    });

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'leader-path');
    path.setAttribute('d', '');
    leaderLayer.appendChild(path);

    annotations.set(part.id, { el, card, path, wasVisible: false });
  });
}

function buildSegments() {
  segmentsEl.innerHTML = PARTS.map(() => '<i></i>').join('');
}

function syncUi() {
  const exploded = PARTS.filter((part) => parts[part.id]?.target > 0.5);
  const count = exploded.length;
  const allExploded = count === TOTAL;
  const pad = String(count).padStart(2, '0');

  explodedCount.textContent = pad;
  progressText.textContent = `${Math.round((count / TOTAL) * 100)}%`;
  progressBar.style.width = `${(count / TOTAL) * 100}%`;
  teardownIndex.textContent = pad;

  topState.textContent = allExploded ? 'FULLY EXPLODED' : count > 0 ? `PARTIAL / ${pad}` : 'ASSEMBLED';
  viewStateText.textContent = allExploded
    ? 'EXPLODED VIEW'
    : count > 0
      ? 'TEARDOWN ACTIVE'
      : 'ASSEMBLED VIEW';
  viewState.classList.toggle('is-exploded', count > 0);

  explodeAllBtn.classList.toggle('is-on', allExploded);
  explodeAllBtn.setAttribute('aria-pressed', String(allExploded));
  rotateBtn.classList.toggle('is-on', state.autoRotate);
  rotateBtn.setAttribute('aria-pressed', String(state.autoRotate));
  labelsBtn.classList.toggle('is-on', state.labelsOn);
  labelsBtn.setAttribute('aria-pressed', String(state.labelsOn));

  Array.from(segmentsEl.children).forEach((segment, index) => {
    segment.classList.toggle('is-on', parts[PARTS[index].id]?.target > 0.5);
  });

  partItems.forEach((item, id) => {
    const part = parts[id];
    const isOpen = (part?.target || 0) > 0.5;
    item.classList.toggle('is-open', isOpen);
    item.classList.toggle('is-active', state.selectedId === id);
    item.setAttribute('aria-pressed', String(isOpen));
  });

  annotations.forEach(({ el }) => {
    el.classList.toggle('is-selected', state.selectedId === el.dataset.part);
  });

  const selected = state.selectedId ? PART_MAP[state.selectedId] : null;
  stageFocus.classList.toggle('is-visible', Boolean(selected));
  if (selected) {
    focusNumber.textContent = selected.index;
    focusName.textContent = selected.name;
  }

  overviewBtn.hidden = !selected;
  refreshDetailAction();
}

function renderOverview() {
  const html = `
    <div class="overview-hero">
      <div class="hero-meta-row">
        <span>PRODUCT / OSMO ACTION 4</span>
        <b>REF. 2023</b>
      </div>
      <div class="blueprint-wrap">
        <div class="blueprint-grid"></div>
        <svg viewBox="0 0 300 142" aria-hidden="true">
          <path class="bp-line bp-line--dash" d="M16 126h268M22 16v110" />
          <path class="bp-fill" d="M47 25h208a13 13 0 0 1 13 13v66a13 13 0 0 1-13 13H47a13 13 0 0 1-13-13V38a13 13 0 0 1 13-13z" />
          <rect class="bp-line" x="34" y="25" width="234" height="92" rx="13" />
          <rect class="bp-line" x="54" y="42" width="77" height="62" rx="5" />
          <path class="bp-line bp-line--dash" d="M61 96h63" />
          <circle class="bp-line" cx="201" cy="72" r="31" />
          <circle class="bp-line bp-line--bright" cx="201" cy="72" r="21" />
          <circle class="bp-line bp-line--dash" cx="201" cy="72" r="13" />
          <circle class="bp-dot" cx="201" cy="72" r="1.6" />
          <rect class="bp-line" x="159" y="104" width="78" height="9" rx="3" />
          <text class="bp-label" x="169" y="111">ACTION · 4</text>
          <text class="bp-label" x="62" y="57">FRONT DISPLAY</text>
          <text class="bp-label" x="181" y="43">FOV 155°</text>
          <path class="bp-line bp-line--dash" d="M256 35h22v24" />
          <path class="bp-line bp-line--dash" d="M34 105h-16v22" />
          <text class="bp-label" x="258" y="30">Z / OPTICAL AXIS</text>
          <text class="bp-label" x="3" y="138">70.5 MM</text>
        </svg>
      </div>
      <div class="hero-text">
        <span class="hero-eyebrow">FLAGSHIP ACTION CAMERA</span>
        <h2>OSMO ACTION <span>4</span></h2>
        <p>1/1.3 英寸 CMOS、前后双触控屏与磁吸快拆结构，被收进仅 145 g 的紧凑耐寒机身。</p>
        <div class="hero-tags">
          <span>1/1.3″ CMOS</span>
          <span>4K / 120fps</span>
          <span>10-bit D-Log M</span>
        </div>
      </div>
    </div>

    <div class="section-block">
      <div class="section-head">
        <strong>核心规格</strong>
        <span>KEY SPECIFICATIONS</span>
      </div>
      <div class="spec-grid">
        <div class="spec-tile" style="--tile-color:#5ee7ff">
          <i></i><span>VIDEO / 视频</span><b>4K<small>120fps</small></b>
        </div>
        <div class="spec-tile" style="--tile-color:#6ee7c8">
          <i></i><span>FIELD OF VIEW</span><b>155<small>°</small></b>
        </div>
        <div class="spec-tile" style="--tile-color:#7dd3fc">
          <i></i><span>WATERPROOF / 防水</span><b>18<small>m</small></b>
        </div>
        <div class="spec-tile" style="--tile-color:#ffc66b">
          <i></i><span>MAX RUNTIME</span><b>160<small>min</small></b>
        </div>
      </div>
    </div>

    <div class="section-block">
      <div class="section-head">
        <strong>关键参数</strong>
        <span>KEY FIGURES</span>
      </div>
      <div class="spec-rows">
        <div class="spec-row"><span>影像传感器</span><b>1/1.3″ CMOS</b></div>
        <div class="spec-row"><span>最大光圈 / 视场角</span><b>f/2.8 · 155°</b></div>
        <div class="spec-row"><span>色彩模式</span><b>10-bit D-Log M</b></div>
        <div class="spec-row"><span>耐寒电池</span><b>1770 mAh · 6.8 Wh</b></div>
        <div class="spec-row"><span>机身尺寸</span><b>70.5 × 44.2 × 32.8 mm</b></div>
      </div>
    </div>

  `;

  detailsScroll.innerHTML = html;
  detailsScroll.scrollTop = 0;
  overviewBtn.hidden = !state.selectedId;
}

function renderDetail(id) {
  const part = PART_MAP[id];
  if (!part) {
    renderOverview();
    return;
  }

  const group = PART_GROUPS.find((item) => item.id === part.group);
  const partState = parts[id];
  const isExploded = partState.target > 0.5;
  const origin = partState.home;
  const coordinate = `X ${origin.x.toFixed(2)} · Y ${origin.y.toFixed(2)} · Z ${origin.z.toFixed(2)}`;

  const specTiles = part.specs
    .map(
      ([label, value]) => `
        <div class="spec-tile" style="--tile-color:${part.color}">
          <i></i><span>${label}</span><b>${value}</b>
        </div>
      `
    )
    .join('');

  detailsScroll.innerHTML = `
    <div class="component-head">
      <div>
        <span class="component-kicker">COMPONENT ${part.index} · ${group?.en || ''}</span>
        <h2 class="component-title">${part.name}</h2>
        <p class="component-en">${part.en}</p>
      </div>
      <div class="component-orb" style="--part-color:${part.color}">
        <b>${part.index}</b>
        <span>MODULE</span>
      </div>
    </div>

    <div class="component-state" style="--part-color:${part.color}">
      <i></i>STRUCTURE STATE&nbsp;&nbsp;<b>${isExploded ? 'EXPLODED / 已分离' : 'ASSEMBLED / 原位'}</b>
    </div>

    <p class="component-description">${part.description}</p>

    <div class="tag-row">
      ${part.tags.map((tag) => `<span>${tag}</span>`).join('')}
    </div>

    <div class="part-coordinate">
      ORIGIN LOCK
      <b>${coordinate}</b>
    </div>

    <div class="section-block">
      <div class="section-head">
        <strong>技术参数</strong>
        <span>TECHNICAL PARAMETERS</span>
      </div>
      <div class="spec-grid detail-spec-grid">
        ${specTiles}
      </div>
    </div>

    <div class="section-block">
      <div class="section-head">
        <strong>相关结构</strong>
        <span>RELATED MODULES</span>
      </div>
      <div class="related-list">
        ${(RELATED_PARTS[part.id] || [])
          .map((relatedId) => {
            const relatedPart = PART_MAP[relatedId];
            return `
              <button class="related-item" type="button" data-related-part="${relatedId}">
                <span>${relatedPart.index}</span>
                <b>${relatedPart.name}</b>
                <em>INSPECT ↗</em>
              </button>
            `;
          })
          .join('')}
      </div>
    </div>

    <button class="part-action" type="button" data-part-action="${part.id}">
      <span>${isExploded ? '置回原位' : '拆解此部件'}</span>
      <em>${isExploded ? 'RETURN TO BODY' : 'EXPLODE PART'}</em>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        ${
          isExploded
            ? '<path d="M12 20V6M6.5 11.5 12 6l5.5 5.5" />'
            : '<path d="M12 4v14M6.5 12.5 12 18l5.5-5.5" />'
        }
      </svg>
    </button>
  `;

  detailsScroll.scrollTop = 0;
  overviewBtn.hidden = false;
}

function refreshDetailAction() {
  if (!state.selectedId) {
    overviewBtn.hidden = true;
    return;
  }
  const part = parts[state.selectedId];
  if (!part) return;
  const isExploded = part.target > 0.5;
  const statusEl = detailsScroll.querySelector('.component-state b');
  const actionButton = detailsScroll.querySelector('.part-action');
  if (statusEl) {
    statusEl.textContent = isExploded ? 'EXPLODED / 已分离' : 'ASSEMBLED / 原位';
  }
  if (actionButton) {
    const label = actionButton.querySelector('span');
    const caption = actionButton.querySelector('em');
    const iconPath = actionButton.querySelector('svg path');
    if (label) label.textContent = isExploded ? '置回原位' : '拆解此部件';
    if (caption) caption.textContent = isExploded ? 'RETURN TO BODY' : 'EXPLODE PART';
    if (iconPath) {
      iconPath.setAttribute(
        'd',
        isExploded ? 'M12 20V6M6.5 11.5 12 6l5.5 5.5' : 'M12 4v14M6.5 12.5 12 18l5.5-5.5'
      );
    }
  }
  overviewBtn.hidden = false;
}

function handlePartClick(id) {
  if (!id || !parts[id]) {
    clearSelection();
    return;
  }

  const part = parts[id];
  const alreadySelected = state.selectedId === id;

  if (alreadySelected && part.target > 0.5) {
    part.target = 0;
  } else {
    state.selectedId = id;
    part.target = 1;
  }

  if (state.selectedId === id) {
    renderDetail(id);
    scrollListItemIntoView(id);
  } else {
    renderOverview();
  }

  syncUi();
  hideHover();
}

function togglePart(id) {
  const part = parts[id];
  if (!part) return;
  part.target = part.target > 0.5 ? 0 : 1;
  state.selectedId = id;
  renderDetail(id);
  syncUi();
}

function clearSelection() {
  if (!state.selectedId) return;
  state.selectedId = null;
  renderOverview();
  syncUi();
}

function scrollListItemIntoView(id) {
  const item = partItems.get(id);
  if (!item) return;
  const listRect = partList.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  if (itemRect.top < listRect.top + 4) {
    partList.scrollTop += itemRect.top - listRect.top - 4;
  } else if (itemRect.bottom > listRect.bottom - 4) {
    partList.scrollTop += itemRect.bottom - listRect.bottom + 4;
  }
}

function explodeAll() {
  PARTS.forEach((part) => {
    parts[part.id].target = 1;
  });
  syncUi();
  if (state.selectedId) refreshDetailAction();
  flyCameraToExploded();
  hideHover();
}

function resetAll() {
  PARTS.forEach((part) => {
    parts[part.id].target = 0;
  });
  state.selectedId = null;
  state.hoveredId = null;
  setAutoRotate(false);
  hideHover();
  renderOverview();
  syncUi();
  flyCameraToHome();
}

function setAutoRotate(value) {
  state.autoRotate = value;
  if (controls) controls.autoRotate = value;
  rotateBtn.classList.toggle('is-on', value);
  rotateBtn.setAttribute('aria-pressed', String(value));
}

function setLabels(value) {
  state.labelsOn = value;
  labelsBtn.classList.toggle('is-on', value);
  labelsBtn.setAttribute('aria-pressed', String(value));
  if (!value) {
    annotations.forEach((entry) => {
      entry.el.classList.remove('is-visible');
      entry.path.style.display = 'none';
      entry.wasVisible = false;
    });
  }
}

function flyCameraToHome() {
  const pose = computeHomePose();
  homePose = pose;
  startCameraTween(pose.position, pose.target, 1.15);
}

function flyCameraToExploded() {
  const pose = computeExplodedPose();
  startCameraTween(pose.position, pose.target, 1.2);
}

function startCameraTween(position, target, duration) {
  state.cameraTween = {
    fromPosition: camera.position.clone(),
    toPosition: position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: target.clone(),
    start: performance.now(),
    duration: duration * 1000,
  };
}

function updateCameraTween(now) {
  const tween = state.cameraTween;
  if (!tween) return;
  const progress = THREE.MathUtils.clamp((now - tween.start) / tween.duration, 0, 1);
  const eased = 1 - Math.pow(1 - progress, 4);
  camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
  if (progress >= 1) state.cameraTween = null;
}

function updateParts(dt) {
  PARTS.forEach((partData, index) => {
    const part = parts[partData.id];
    if (!part) return;
    const rate = part.isShell ? 4.1 : 5.1;
    part.progress += (part.target - part.progress) * (1 - Math.exp(-dt * rate));
    if (Math.abs(part.target - part.progress) < 0.0007) part.progress = part.target;

    const progress = part.progress;
    part.group.position.copy(part.home).addScaledVector(part.explodeOffset, progress);
    if (state.selectedId === part.id && progress > 0.6) {
      part.group.position.y += Math.sin(totalTime * 1.9 + index * 0.7) * 0.018;
    }
    part.group.rotation.set(
      part.homeRotation.x + part.explodeRotation.x * progress,
      part.homeRotation.y + part.explodeRotation.y * progress,
      part.homeRotation.z + part.explodeRotation.z * progress
    );

    if (part.isShell) updateShellGhost(part);
    updatePartHighlight(part, partData);
  });
}

function updateShellGhost(part) {
  if (!part.ghostMaterialState) return;
  const shellProgress = part.progress;
  const transparency = THREE.MathUtils.smoothstep(shellProgress, 0.06, 0.92);
  const opacityFactor = 1 - 0.7 * transparency;
  const transparencyChanged = part.currentGhostTransparency !== (transparency > 0.02);

  if (transparencyChanged) {
    part.currentGhostTransparency = transparency > 0.02;
    const needsTransparent = transparency > 0.02;
    part.ghostMaterialState.forEach((entry) => {
      entry.material.transparent = needsTransparent || entry.transparent;
      entry.material.needsUpdate = true;
    });
  }

  part.ghostMaterialState.forEach((entry) => {
    entry.material.opacity = entry.opacity * opacityFactor;
    entry.material.depthWrite = transparency > 0.02 ? false : entry.depthWrite;
  });

  if (part.ghostOutlineMat) {
    part.ghostOutlineMat.opacity = transparency * 0.72;
  }
}

function updatePartHighlight(part, partData) {
  const selected = state.selectedId === partData.id;
  const hovered = !selected && state.hoveredId === partData.id;
  const mode = selected ? 'selected' : hovered ? 'hover' : 'none';
  if (mode === part.lastHighlightMode && !selected) return;
  part.lastHighlightMode = mode;

  const materials = materialsByPart.get(partData.id);
  if (!materials) return;
  tmpColor.set(partData.color);
  const deep = partData.id === 'shell' ? 0.038 : 0.075;

  materials.forEach((material) => {
    if (!material.emissive) return;
    const base = material.userData.baseEmissive;
    const baseIntensity = material.userData.baseEmissiveIntensity;
    if (mode === 'none') {
      material.emissive.copy(base);
      material.emissiveIntensity = baseIntensity;
    } else if (mode === 'hover') {
      material.emissive.copy(tmpColor);
      material.emissiveIntensity = deep * 0.38;
    } else {
      material.emissive.copy(tmpColor);
      material.emissiveIntensity = deep * (0.82 + Math.sin(totalTime * 3.2) * 0.18);
    }
  });
}

function updateSelectionFx() {
  if (!state.selectedId) {
    spriteGlow.visible = false;
    spriteReticle.visible = false;
    return;
  }

  const part = parts[state.selectedId];
  const partData = PART_MAP[state.selectedId];
  if (!part) {
    spriteGlow.visible = false;
    spriteReticle.visible = false;
    return;
  }

  tmpVec3.copy(part.localCenter).applyMatrix4(part.group.matrixWorld);
  const baseScale = part.fxRadius * 2.5;
  const pulse = 1 + Math.sin(totalTime * 2.3) * 0.035;

  spriteGlow.visible = true;
  spriteGlow.position.copy(tmpVec3);
  spriteGlow.scale.set(baseScale * 2.2 * pulse, baseScale * 2.2 * pulse, 1);
  spriteGlow.material.color.set(partData.color);
  spriteGlow.material.opacity = 0.15 + Math.sin(totalTime * 2.3) * 0.025;

  spriteReticle.visible = true;
  spriteReticle.position.copy(tmpVec3);
  spriteReticle.scale.set(baseScale * 1.42, baseScale * 1.42, 1);
  spriteReticle.material.color.set(partData.color);
  spriteReticle.material.opacity = 0.34;
  spriteReticle.material.rotation = totalTime * 0.13;
}

function refreshOcclusionCache() {
  occlusionTick += 1;
  if (occlusionTick % 6 !== 0 && occlusionCache.size) return;

  camera.updateMatrixWorld();
  modelRoot.updateMatrixWorld(true);
  KEY_EXTERIOR.forEach((id) => {
    const part = parts[id];
    if (!part) {
      occlusionCache.set(id, false);
      return;
    }
    const point = part.labelPoint.clone().applyMatrix4(part.group.matrixWorld);
    const direction = point.clone().sub(camera.position);
    const distance = direction.length();
    direction.normalize();
    annotationRaycaster.set(camera.position, direction);
    annotationRaycaster.near = 0.08;
    annotationRaycaster.far = Math.max(0.1, distance - 0.05);
    const hits = annotationRaycaster.intersectObjects(modelRoot.children, true);
    let occluded = false;
    for (const hit of hits) {
      const hitId = hit.object.userData.partId;
      if (!hitId) continue;
      if (hitId === id) {
        occluded = false;
        break;
      }
      if (hitId === 'shell' && parts.shell.progress > 0.12) continue;
      occluded = true;
      break;
    }
    occlusionCache.set(id, occluded);
  });
}

function updateAnnotations() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height) return;

  if (!state.labelsOn) return;

  const anyExploded = PARTS.some((part) => parts[part.id].target > 0.5);
  if (!anyExploded) {
    refreshOcclusionCache();
  }
  const visibleItems = [];

  PARTS.forEach((partData) => {
    const part = parts[partData.id];
    const entry = annotations.get(partData.id);
    if (!part || !entry) return;

    const isExplodedVisible = part.progress > 0.06;
    const isSelected = state.selectedId === partData.id;
    const show =
      isSelected ||
      isExplodedVisible ||
      (!anyExploded && KEY_EXTERIOR.has(partData.id));

    if (!show) {
      setAnnotationVisible(entry, false);
      return;
    }

    if (!anyExploded && occlusionCache.get(partData.id)) {
      setAnnotationVisible(entry, false);
      return;
    }

    tmpVec3b.copy(part.labelPoint).applyMatrix4(part.group.matrixWorld);
    const projected = tmpVec3b.clone().project(camera);
    if (
      projected.z < -1 ||
      projected.z > 1 ||
      projected.x < -1.1 ||
      projected.x > 1.1 ||
      projected.y < -1.1 ||
      projected.y > 1.1
    ) {
      setAnnotationVisible(entry, false);
      return;
    }

    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const side = x < width * 0.5 ? 'left' : 'right';

    visibleItems.push({
      id: partData.id,
      entry,
      x,
      y,
      side,
      cardY: THREE.MathUtils.clamp(y, 62, height - 50),
    });
  });

  ['left', 'right'].forEach((side) => {
    const group = visibleItems.filter((item) => item.side === side);
    group.sort((a, b) => a.cardY - b.cardY);
    const gap = LABEL_CARD_HEIGHT + LABEL_ROW_GAP;
    const minY = 62;
    const maxY = height - 50;

    for (let i = 0; i < group.length; i += 1) {
      const min = i === 0 ? minY : group[i - 1].cardY + gap;
      group[i].cardY = Math.max(group[i].cardY, min);
    }

    const overflow = group.length ? group[group.length - 1].cardY - maxY : 0;
    if (overflow > 0) {
      group.forEach((item) => {
        item.cardY -= overflow;
      });
      for (let i = group.length - 2; i >= 0; i -= 1) {
        group[i].cardY = Math.min(group[i].cardY, group[i + 1].cardY - gap);
      }
      if (group[0] && group[0].cardY < minY) {
        const correction = minY - group[0].cardY;
        group.forEach((item) => {
          item.cardY += correction;
        });
      }
    }
  });

  visibleItems.forEach(({ id, entry, x, y, side, cardY }) => {
    setAnnotationVisible(entry, true);
    entry.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (entry.el.dataset.side !== side) entry.el.dataset.side = side;

    const cardX =
      side === 'left'
        ? LABEL_COLUMN_MARGIN
        : width - LABEL_COLUMN_MARGIN - LABEL_CARD_WIDTH;
    const cardYTop = cardY - LABEL_CARD_HEIGHT / 2;
    entry.card.style.left = `${(cardX - x).toFixed(1)}px`;
    entry.card.style.top = `${(cardYTop - y).toFixed(1)}px`;
    entry.card.style.right = 'auto';

    const direction = side === 'left' ? -1 : 1;
    const cardEdgeX = side === 'left' ? cardX + LABEL_CARD_WIDTH : cardX;
    const bend = Math.min(96, Math.abs(x - cardEdgeX) * 0.42 + 14);
    entry.path.setAttribute(
      'd',
      `M ${x.toFixed(1)} ${y.toFixed(1)} C ${(x + direction * bend).toFixed(1)} ${y.toFixed(
        1
      )}, ${(cardEdgeX - direction * 34).toFixed(1)} ${cardY.toFixed(1)}, ${cardEdgeX.toFixed(
        1
      )} ${cardY.toFixed(1)}`
    );
    entry.path.style.display = '';
    entry.path.classList.toggle('is-selected', state.selectedId === id);
    entry.el.classList.toggle('is-selected', state.selectedId === id);
  });
}

function setAnnotationVisible(entry, visible) {
  if (entry.wasVisible === visible) return;
  entry.wasVisible = visible;
  entry.el.classList.toggle('is-visible', visible);
  entry.path.style.display = visible ? '' : 'none';
}

function setHoveredPart(id) {
  if (state.hoveredId === id) return;
  state.hoveredId = id;
  if (!id) hideHover();
}

function hideHover() {
  hoverTip.classList.remove('is-visible');
  if (state.hoveredId && !state.pointerDown) {
    state.hoveredId = null;
  }
}

function updateHoverFromEvent(event) {
  if (state.pointerDown) return;
  const id = pickPartAt(event.clientX, event.clientY);
  if (id !== state.hoveredId) {
    state.hoveredId = id;
  }

  if (!id) {
    hoverTip.classList.remove('is-visible');
    return;
  }

  if (state.selectedId === id) {
    hoverTip.classList.remove('is-visible');
    return;
  }

  const part = PART_MAP[id];
  const partState = parts[id];
  hoverTipName.textContent = part.name;
  const actionText = hoverTip.querySelector('.hover-tip__copy span');
  if (actionText) {
    actionText.textContent =
      partState.target > 0.5 ? '点击复位 / RETURN PART' : '点击拆解 / EXPLODE PART';
  }

  const rect = stage.getBoundingClientRect();
  const x = THREE.MathUtils.clamp(event.clientX - rect.left, 12, rect.width - 190);
  const y = THREE.MathUtils.clamp(event.clientY - rect.top, 12, rect.height - 76);
  hoverTip.style.left = `${x}px`;
  hoverTip.style.top = `${y}px`;
  hoverTip.classList.add('is-visible');
}

function pickPartAt(clientX, clientY) {
  if (!camera || !modelRoot) return null;
  const rect = stage.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  camera.updateMatrixWorld();
  modelRoot.updateMatrixWorld(true);
  raycaster.setFromCamera(pointerNdc, camera);
  const intersections = raycaster.intersectObjects(modelRoot.children, true);

  for (const intersection of intersections) {
    const id = intersection.object.userData.partId;
    if (!id) continue;
    if (id === 'shell' && parts.shell.progress > 0.12) continue;
    return id;
  }
  return null;
}

function setupPointerEvents() {
  const canvas = renderer.domElement;

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    state.pointerDown = { x: event.clientX, y: event.clientY };
    state.pointerMoved = false;
    hideHover();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (state.pointerDown) {
      const moved = Math.hypot(
        event.clientX - state.pointerDown.x,
        event.clientY - state.pointerDown.y
      );
      if (moved > 5) state.pointerMoved = true;
      return;
    }
    updateHoverFromEvent(event);
  });

  canvas.addEventListener('pointerup', (event) => {
    if (event.button !== 0) return;
    const wasDown = Boolean(state.pointerDown);
    const moved = state.pointerMoved;
    state.pointerDown = null;
    state.pointerMoved = false;
    if (!wasDown || moved) return;

    const id = pickPartAt(event.clientX, event.clientY);
    if (id) {
      handlePartClick(id);
    } else {
      clearSelection();
    }
  });

  canvas.addEventListener('pointercancel', () => {
    state.pointerDown = null;
    state.pointerMoved = false;
  });

  canvas.addEventListener('pointerleave', () => {
    if (!state.pointerDown) {
      state.hoveredId = null;
      hoverTip.classList.remove('is-visible');
    }
  });
}

function setupKeyboard() {
  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (state.modalOpen) {
      if (event.key === 'Escape') closeModal();
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'e') {
      event.preventDefault();
      explodeAll();
    } else if (key === 'r') {
      event.preventDefault();
      resetAll();
    } else if (key === 'a') {
      event.preventDefault();
      setAutoRotate(!state.autoRotate);
    } else if (key === 'l') {
      event.preventDefault();
      setLabels(!state.labelsOn);
    } else if (event.key === 'Escape') {
      if (state.selectedId) clearSelection();
    }
  });
}

function setupModal() {
  guideBtn.addEventListener('click', openModal);
  guideModal.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });
}

function openModal() {
  state.modalOpen = true;
  guideModal.hidden = false;
  const closeButton = guideModal.querySelector('.modal-close');
  if (closeButton) closeButton.focus();
}

function closeModal() {
  state.modalOpen = false;
  guideModal.hidden = true;
  guideBtn.focus();
}

function setupResize() {
  const resizeObserver = new ResizeObserver(() => {
    resizeStage();
  });
  resizeObserver.observe(stage);
  window.addEventListener('resize', resizeStage);
}

function resizeStage() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height || !renderer || !composer) return;

  const previousHome = homePose;
  const previousAspect = camera.aspect;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(width, height);
  bloomPass?.setSize(width, height);

  if (previousHome && Math.abs(previousAspect - camera.aspect) > 0.001) {
    const nextHome = computeHomePose();
    const ratio = nextHome.distance / previousHome.distance;
    if (Number.isFinite(ratio) && Math.abs(ratio - 1) > 0.002) {
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(ratio);
      camera.position.copy(controls.target).add(offset);
    }
    homePose = nextHome;
  }
}

function observeLoad() {
  createAnnotations();
  let value = 0;
  const messages = [
    'BUILDING OPTICAL ARRAY',
    'CALIBRATING SENSOR PLANE',
    'MAPPING MAGNETIC CHASSIS',
    'INDEXING 12 MODULES',
  ];
  loaderBar.style.width = '4%';
  loaderPct.textContent = '04';

  const timer = window.setInterval(() => {
    value = Math.min(100, value + 8 + Math.random() * 17);
    const rounded = Math.floor(value);
    loaderBar.style.width = `${Math.max(4, rounded)}%`;
    loaderPct.textContent = String(rounded).padStart(2, '0');
    loaderMessage.textContent = messages[Math.min(messages.length - 1, Math.floor(rounded / 26))];

    if (rounded >= 100) {
      window.clearInterval(timer);
      window.setTimeout(() => {
        loader.classList.add('is-hidden');
        const pose = computeHomePose();
        homePose = pose;
        startCameraTween(pose.position, pose.target, 1.65);
      }, 280);
    }
  }, 58);
}

function animate() {
  animationId = requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  totalTime += dt;

  updateParts(dt);
  modelRoot.updateMatrixWorld(true);

  const now = performance.now();
  updateCameraTween(now);
  controls.autoRotate = state.autoRotate;
  controls.update();
  camera.updateMatrixWorld();

  updateSelectionFx();
  updateAnnotations();

  const currentDistance = camera.position.distanceTo(controls.target);
  const zoomLabel = `${Math.round((homePose.distance / currentDistance) * 100)}%`;
  if (zoomLabel !== state.lastZoomLabel) {
    state.lastZoomLabel = zoomLabel;
    zoomValue.textContent = zoomLabel;
  }

  if (starField) {
    starField.rotation.y += dt * 0.004;
    starField.rotation.x = Math.sin(totalTime * 0.02) * 0.014;
  }
  if (ringGroup) {
    ringGroup.rotation.y += dt * 0.028;
  }
  if (tickGroup) {
    tickGroup.rotation.y = Math.sin(totalTime * 0.03) * 0.012;
  }
  if (shadowPlane) {
    shadowPlane.material.opacity = 0.52 + Math.sin(totalTime * 0.8) * 0.025;
  }
  if (floorGlow) {
    floorGlow.material.opacity = 0.085 + Math.sin(totalTime * 0.65) * 0.018;
  }

  composer.render();
}

function showFatalError(error) {
  console.error(error);
  if (loader) loader.classList.add('is-hidden');
  if (stage) stage.style.opacity = '0.25';
  if (errorState) errorState.hidden = false;
  if (animationId) cancelAnimationFrame(animationId);
}

window.addEventListener('beforeunload', () => {
  if (animationId) cancelAnimationFrame(animationId);
});
