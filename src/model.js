import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  makeSurfaceNoise,
  makeFrontScreenTexture,
  makeRearScreenTexture,
  makeLensFaceTexture,
  makeLensInnerTexture,
  makePcbTexture,
  makeBatteryLabelTexture,
  makeActionBadgeTexture,
  makeDjiLogoTex,
  makeTextTexture,
  makeVentTexture,
} from './textures.js';

const BODY_W = 7.05;
const BODY_H = 4.42;
const BODY_D = 3.28;
const FRONT_Z = BODY_D / 2;
const BACK_Z = -BODY_D / 2;

function roundedRectShape(width, height, radius) {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  shape.closePath();
  return shape;
}

function roundedSlab(width, height, depth, radius, bevel = 0.025) {
  const b = Math.min(bevel, depth / 2 - 0.001, radius * 0.7);
  const shape = roundedRectShape(width - b * 2, height - b * 2, Math.max(0.02, radius - b));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - b * 2),
    bevelEnabled: b > 0.0001,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: b > 0.06 ? 4 : 2,
    curveSegments: 18,
    steps: 1,
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

function ringLineGeometry(width, height, radius, z) {
  const shape = roundedRectShape(width, height, radius);
  const points = shape.getPoints(80).map((p) => new THREE.Vector3(p.x, p.y, z));
  points.push(points[0].clone());
  return new THREE.BufferGeometry().setFromPoints(points);
}

function makeStandard(color, metalness, roughness, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    envMapIntensity: 1.15,
    ...extra,
  });
}

function makeDarkMetal(color = 0x141719, roughness = 0.35) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.82,
    roughness,
    envMapIntensity: 1.5,
  });
}

function createScreenGlassMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x0a1215,
    metalness: 0.2,
    roughness: 0.045,
    transparent: true,
    opacity: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2,
    depthWrite: false,
  });
}

function addDecal(parent, texture, width, height, position, rotation = [0, 0, 0], opacity = 1) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.userData.decal = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radius, depth, material, position, segments = 48, axis = 'z') {
  const geometry = new THREE.CylinderGeometry(radius, radius, depth, segments);
  if (axis === 'z') geometry.rotateX(Math.PI / 2);
  if (axis === 'x') geometry.rotateZ(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addScrew(parent, x, y, z, axis = 'z', size = 0.05) {
  const material = makeDarkMetal(0x24282a, 0.28);
  const group = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(size, size * 0.94, 0.024, 20), material);
  head.rotation.x = Math.PI / 2;
  group.add(head);
  const slotMat = new THREE.MeshBasicMaterial({ color: 0x050607 });
  const slotA = new THREE.Mesh(new THREE.BoxGeometry(size * 1.15, size * 0.14, 0.005), slotMat);
  slotA.position.z = 0.014;
  group.add(slotA);
  const slotB = new THREE.Mesh(new THREE.BoxGeometry(size * 0.14, size * 1.15, 0.005), slotMat);
  slotB.position.z = 0.014;
  group.add(slotB);
  group.position.set(x, y, z);
  if (axis === 'x') group.rotation.y = Math.PI / 2;
  if (axis === '-x') group.rotation.y = -Math.PI / 2;
  if (axis === 'y') group.rotation.x = -Math.PI / 2;
  parent.add(group);
  return group;
}

function makeKnurledGeometry(radius, depth, ridges = 84) {
  const geometry = new THREE.CylinderGeometry(radius, radius * 0.985, depth, 200, 1, false);
  const positions = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 1) {
    v.fromBufferAttribute(positions, i);
    const radiusHere = Math.hypot(v.x, v.z);
    if (radiusHere > radius * 0.95) {
      const angle = Math.atan2(v.z, v.x);
      const ridge = 1 + Math.sin(angle * ridges) * 0.009 + Math.sin(angle * 7) * 0.003;
      v.x *= ridge;
      v.z *= ridge;
      positions.setX(i, v.x);
      positions.setZ(i, v.z);
    }
  }
  geometry.computeVertexNormals();
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function makePortPanelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 1024);

  ctx.fillStyle = 'rgba(178,199,208,.48)';
  ctx.font = '500 54px Bahnschrift, sans-serif';
  ctx.save();
  ctx.translate(96, 760);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('USB-C', 0, 0);
  ctx.font = '400 35px Bahnschrift, sans-serif';
  ctx.fillStyle = 'rgba(178,199,208,.3)';
  ctx.fillText('microSD', 260, 0);
  ctx.restore();

  ctx.strokeStyle = 'rgba(160,190,202,.3)';
  ctx.lineWidth = 3;
  ctx.strokeRect(108, 120, 290, 270);
  ctx.beginPath();
  ctx.arc(253, 255, 84, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(142,235,255,.65)';
  ctx.beginPath();
  ctx.moveTo(280, 168);
  ctx.lineTo(306, 206);
  ctx.lineTo(291, 206);
  ctx.lineTo(305, 245);
  ctx.lineTo(278, 207);
  ctx.lineTo(293, 207);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function markPickable(group, id) {
  group.userData.partId = id;
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.partId = id;
    }
  });
}

export function createAction4Model() {
  const root = new THREE.Group();
  root.name = 'Osmo Action 4';
  const parts = {};
  const surfaceNoise = makeSurfaceNoise();

  const home = {
    lens: new THREE.Vector3(1.62, 0.32, FRONT_Z + 0.05),
    sensor: new THREE.Vector3(1.62, 0.32, 0.6),
    mainboard: new THREE.Vector3(0.38, 0.3, -0.32),
    thermal: new THREE.Vector3(-0.55, -0.15, -1.0),
    audio: new THREE.Vector3(-1.28, -1.58, 0.55),
    shell: new THREE.Vector3(0, 0, 0),
    frontDisplay: new THREE.Vector3(-1.72, 0.26, FRONT_Z + 0.04),
    rearDisplay: new THREE.Vector3(0, 0.08, BACK_Z - 0.05),
    controls: new THREE.Vector3(0, BODY_H / 2, 0),
    battery: new THREE.Vector3(0.78, -0.32, 0.24),
    ioCover: new THREE.Vector3(-BODY_W / 2, 0.06, 0.18),
    mount: new THREE.Vector3(0, -BODY_H / 2, 0.05),
  };

  const explodeOffsets = {
    lens: new THREE.Vector3(0.04, 2.26, 2.5),
    sensor: new THREE.Vector3(-0.18, -0.34, 3.15),
    mainboard: new THREE.Vector3(0.35, 3.5, -0.2),
    thermal: new THREE.Vector3(-2.35, 2.7, -1.35),
    audio: new THREE.Vector3(2.7, -1.6, 1.8),
    shell: new THREE.Vector3(0, -0.1, -0.25),
    frontDisplay: new THREE.Vector3(-1.42, 0.9, 2.55),
    rearDisplay: new THREE.Vector3(0.9, 0.44, -2.9),
    controls: new THREE.Vector3(-1.35, 2.55, 0.95),
    battery: new THREE.Vector3(4.05, 0.12, 0.55),
    ioCover: new THREE.Vector3(-2.15, -0.3, 0.55),
    mount: new THREE.Vector3(0, -2.65, 0.85),
  };

  const explodeRotations = {
    lens: new THREE.Euler(0.02, -0.08, 0.02),
    sensor: new THREE.Euler(0.02, 0.18, -0.04),
    mainboard: new THREE.Euler(0.02, -0.08, 0.03),
    thermal: new THREE.Euler(0.05, 0.06, 0.3),
    audio: new THREE.Euler(0.06, -0.18, -0.1),
    shell: new THREE.Euler(0, 0, 0),
    frontDisplay: new THREE.Euler(0.02, -0.12, 0.03),
    rearDisplay: new THREE.Euler(0.08, 0.08, 0.02),
    controls: new THREE.Euler(0.02, 0.12, -0.12),
    battery: new THREE.Euler(0.04, -0.08, 0.05),
    ioCover: new THREE.Euler(0.02, 0.22, 0.04),
    mount: new THREE.Euler(0.14, 0.04, 0.02),
  };

  const labelPoints = {
    lens: new THREE.Vector3(0, 0, 0.38),
    sensor: new THREE.Vector3(0, 0, 0.12),
    mainboard: new THREE.Vector3(0.4, 0.35, 0.15),
    thermal: new THREE.Vector3(0, 0.2, 0.2),
    audio: new THREE.Vector3(0, 0.1, 0.32),
    shell: new THREE.Vector3(2.55, -1.72, FRONT_Z),
    frontDisplay: new THREE.Vector3(-1.22, 0.9, 0.12),
    rearDisplay: new THREE.Vector3(0, 0, -0.12),
    controls: new THREE.Vector3(0.3, 0.16, 0.15),
    battery: new THREE.Vector3(0, 0, 0.65),
    ioCover: new THREE.Vector3(0, -0.15, 0.12),
    mount: new THREE.Vector3(0, -0.1, 0.5),
  };

  const register = (id, group, options = {}) => {
    group.position.copy(home[id]);
    group.rotation.set(0, 0, 0);
    if (id === 'rearDisplay') group.rotation.y = Math.PI;
    if (id === 'ioCover') group.rotation.y = -Math.PI / 2;
    markPickable(group, id);
    root.add(group);
    parts[id] = {
      id,
      group,
      home: home[id].clone(),
      homeRotation: group.rotation.clone(),
      explodeOffset: explodeOffsets[id],
      explodeRotation: explodeRotations[id],
      labelPoint: labelPoints[id],
      progress: 0,
      target: 0,
      ...options,
    };
  };

  // -------------------------------------------------------------------------
  // Shell
  // -------------------------------------------------------------------------
  const shell = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x14181b,
    metalness: 0.38,
    roughness: 0.68,
    roughnessMap: surfaceNoise,
    bumpMap: surfaceNoise,
    bumpScale: 0.025,
    envMapIntensity: 0.7,
  });
  const bodyGeometry = roundedSlab(BODY_W, BODY_H, BODY_D, 0.72, 0.22);
  const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMat);
  shell.add(bodyMesh);

  const frontSeamMat = new THREE.LineBasicMaterial({
    color: 0x090b0c,
    transparent: true,
    opacity: 0.75,
  });
  const frontSeam = new THREE.Line(
    ringLineGeometry(BODY_W - 0.34, BODY_H - 0.34, 0.62, FRONT_Z - 0.004),
    frontSeamMat
  );
  shell.add(frontSeam);

  const backSeam = new THREE.Line(
    ringLineGeometry(BODY_W - 0.42, BODY_H - 0.42, 0.58, BACK_Z + 0.004),
    frontSeamMat
  );
  shell.add(backSeam);

  const sideDoorGroup = new THREE.Group();
  const sideDoorMat = makeStandard(0x1d2225, 0.52, 0.48);
  const sideDoor = new THREE.Mesh(
    roundedSlab(2.68, 3.45, 0.09, 0.18, 0.025),
    sideDoorMat
  );
  sideDoor.rotation.y = Math.PI / 2;
  sideDoor.position.set(BODY_W / 2 + 0.035, 0.02, 0.12);
  sideDoorGroup.add(sideDoor);
  shell.add(sideDoorGroup);

  const sideDoorLineMat = new THREE.LineBasicMaterial({
    color: 0x060809,
    transparent: true,
    opacity: 0.8,
  });
  const sideDoorSeam = new THREE.Line(
    ringLineGeometry(2.42, 3.2, 0.12, FRONT_Z * 0 - 0.045),
    sideDoorLineMat
  );
  sideDoorSeam.rotation.y = Math.PI / 2;
  sideDoorSeam.position.set(BODY_W / 2 + 0.092, 0.02, 0.12);
  shell.add(sideDoorSeam);

  const sideLatch = new THREE.Mesh(
    new RoundedBoxGeometry(0.07, 0.62, 0.16, 2, 0.03),
    makeDarkMetal(0x2b3033, 0.42)
  );
  sideLatch.position.set(BODY_W / 2 + 0.09, -0.72, 1.02);
  shell.add(sideLatch);

  const sidePower = new THREE.Mesh(
    new RoundedBoxGeometry(0.05, 0.35, 0.52, 2, 0.05),
    makeStandard(0x191d20, 0.55, 0.4)
  );
  sidePower.position.set(BODY_W / 2 + 0.088, 1.27, -0.83);
  shell.add(sidePower);

  const topPanelMat = makeStandard(0x1c2023, 0.45, 0.58);
  for (let i = 0; i < 7; i += 1) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.018, 0.055), topPanelMat);
    rib.position.set(-1.7, BODY_H / 2 + 0.008, -0.12 - i * 0.11);
    shell.add(rib);
  }

  const micMat = new THREE.MeshBasicMaterial({ color: 0x030505 });
  [
    [-2.95, 0.52],
    [-2.72, 0.78],
    [-2.42, 0.52],
  ].forEach(([x, z]) => {
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 14), micMat);
    mic.position.set(x, BODY_H / 2 + 0.008, z);
    shell.add(mic);
  });

  const badge = new THREE.Mesh(
    new RoundedBoxGeometry(2.02, 0.55, 0.075, 3, 0.12),
    makeStandard(0x101416, 0.62, 0.4)
  );
  badge.position.set(1.62, -1.68, FRONT_Z + 0.045);
  shell.add(badge);
  addDecal(
    shell,
    makeActionBadgeTexture(),
    1.82,
    0.46,
    [1.62, -1.68, FRONT_Z + 0.087],
    [0, 0, 0],
    0.96
  );

  addScrew(shell, -3.15, 1.86, FRONT_Z + 0.02, 'z', 0.055);
  addScrew(shell, 3.15, 1.86, FRONT_Z + 0.02, 'z', 0.055);
  addScrew(shell, -3.1, -1.94, FRONT_Z + 0.02, 'z', 0.045);
  addScrew(shell, 3.1, -1.94, FRONT_Z + 0.02, 'z', 0.045);

  const bottomGrille = addDecal(
    shell,
    makeVentTexture(),
    1.18,
    0.28,
    [0.0, -BODY_H / 2 - 0.012, 0.95],
    [Math.PI / 2, 0, 0],
    0.38
  );
  bottomGrille.material.blending = THREE.NormalBlending;

  const ghostOutlineMat = new THREE.LineBasicMaterial({
    color: 0x63ebff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(bodyGeometry, 24),
    ghostOutlineMat
  );
  shell.add(edges);

  const ghostMats = [];
  shell.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((material) => {
      if (!ghostMats.includes(material)) ghostMats.push(material);
    });
  });
  register('shell', shell, { ghostMats, ghostOutlineMat, isShell: true });

  // -------------------------------------------------------------------------
  // Lens
  // -------------------------------------------------------------------------
  const lens = new THREE.Group();
  lens.scale.setScalar(0.93);
  const lensDark = makeDarkMetal(0x171a1c, 0.3);
  const lensBlack = makeStandard(0x07090a, 0.5, 0.45);

  const collar = addCylinder(lens, 1.64, 0.18, lensBlack, [0, 0, -0.1], 72);
  collar.scale.set(1.03, 1.03, 1);

  const knurlMesh = new THREE.Mesh(
    makeKnurledGeometry(1.62, 0.5),
    makeDarkMetal(0x121517, 0.26)
  );
  knurlMesh.position.z = 0.17;
  lens.add(knurlMesh);

  const faceMat = new THREE.MeshStandardMaterial({
    map: makeLensFaceTexture(),
    color: 0xffffff,
    metalness: 0.5,
    roughness: 0.46,
    envMapIntensity: 0.9,
  });
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.62, 96), faceMat);
  face.position.z = 0.422;
  lens.add(face);

  const outerLip = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.035, 12, 128), lensDark);
  outerLip.position.z = 0.43;
  lens.add(outerLip);

  const goldRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.16, 0.014, 10, 128),
    new THREE.MeshStandardMaterial({
      color: 0xb59660,
      metalness: 0.92,
      roughness: 0.25,
      emissive: 0x2a1c08,
      emissiveIntensity: 0.2,
    })
  );
  goldRing.position.z = 0.433;
  lens.add(goldRing);

  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.96, 1.16, 0.27, 72, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x050708,
      metalness: 0.65,
      roughness: 0.3,
      side: THREE.DoubleSide,
    })
  );
  funnel.rotation.x = -Math.PI / 2;
  funnel.position.z = 0.31;
  lens.add(funnel);

  const innerGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x061114,
    metalness: 0.35,
    roughness: 0.035,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.2,
    transparent: true,
    opacity: 0.9,
  });
  const innerGlass = new THREE.Mesh(new THREE.CircleGeometry(0.97, 72), innerGlassMat);
  innerGlass.position.z = 0.435;
  lens.add(innerGlass);

  const lensInner = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 72),
    new THREE.MeshBasicMaterial({
      map: makeLensInnerTexture(),
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    })
  );
  lensInner.position.z = 0.44;
  lens.add(lensInner);

  const domeGeo = new THREE.SphereGeometry(1.03, 64, 32, 0, Math.PI * 2, 0, 1.35);
  domeGeo.rotateX(Math.PI / 2);
  const domeMat = new THREE.MeshPhysicalMaterial({
    color: 0x08171a,
    metalness: 0.25,
    roughness: 0.025,
    transmission: 0.35,
    thickness: 0.2,
    ior: 1.46,
    transparent: true,
    opacity: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.01,
    envMapIntensity: 2.5,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.scale.z = 0.13;
  dome.position.z = 0.422;
  lens.add(dome);

  const glint = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 32),
    new THREE.MeshBasicMaterial({
      color: 0xc9f7ff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  glint.position.set(-0.36, 0.28, 0.562);
  lens.add(glint);

  register('lens', lens);

  // -------------------------------------------------------------------------
  // CMOS sensor
  // -------------------------------------------------------------------------
  const sensor = new THREE.Group();
  const sensorBoard = new THREE.Mesh(
    roundedSlab(1.62, 1.33, 0.1, 0.06, 0.015),
    makeStandard(0x11221f, 0.15, 0.64)
  );
  sensor.add(sensorBoard);

  const sensorBracket = new THREE.Mesh(
    new RoundedBoxGeometry(1.86, 1.56, 0.09, 2, 0.045),
    makeDarkMetal(0x6e6048, 0.34)
  );
  sensorBracket.position.z = -0.07;
  sensor.add(sensorBracket);

  const sensorFrame = new THREE.Mesh(
    roundedSlab(1.24, 0.98, 0.09, 0.045, 0.01),
    makeDarkMetal(0x282a27, 0.42)
  );
  sensorFrame.position.z = 0.075;
  sensor.add(sensorFrame);

  const sensorDieMat = new THREE.MeshPhysicalMaterial({
    color: 0x254449,
    metalness: 0.78,
    roughness: 0.2,
    iridescence: 0.65,
    iridescenceIOR: 1.8,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: 0x07181b,
    emissiveIntensity: 0.45,
  });
  const sensorDie = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.63, 0.045), sensorDieMat);
  sensorDie.position.z = 0.135;
  sensor.add(sensorDie);

  const sensorGold = new THREE.Mesh(
    new THREE.TorusGeometry(0.49, 0.018, 8, 4),
    new THREE.MeshStandardMaterial({ color: 0xc2a25d, metalness: 0.9, roughness: 0.25 })
  );
  sensorGold.rotation.z = Math.PI / 4;
  sensorGold.scale.y = 0.78;
  sensorGold.position.z = 0.142;
  sensor.add(sensorGold);

  const flex = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.92, 0.025),
    new THREE.MeshStandardMaterial({ color: 0xb06f2f, roughness: 0.62, metalness: 0.15 })
  );
  flex.position.set(-0.36, -1.0, -0.02);
  flex.rotation.z = -0.15;
  sensor.add(flex);

  const sensorConnector = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.15, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x28201a, metalness: 0.3, roughness: 0.5 })
  );
  sensorConnector.position.set(-0.36, -1.38, -0.02);
  sensor.add(sensorConnector);

  register('sensor', sensor);

  // -------------------------------------------------------------------------
  // Mainboard
  // -------------------------------------------------------------------------
  const mainboard = new THREE.Group();
  const board = new THREE.Mesh(
    roundedSlab(4.7, 2.82, 0.1, 0.07, 0.015),
    new THREE.MeshStandardMaterial({
      color: 0x0c211b,
      metalness: 0.2,
      roughness: 0.62,
    })
  );
  mainboard.add(board);

  const pcbFace = new THREE.Mesh(
    new THREE.PlaneGeometry(4.55, 2.66),
    new THREE.MeshStandardMaterial({
      map: makePcbTexture(),
      metalness: 0.05,
      roughness: 0.74,
      envMapIntensity: 0.6,
    })
  );
  pcbFace.position.z = 0.056;
  mainboard.add(pcbFace);

  const shieldMat = makeStandard(0x8e989b, 0.85, 0.32);
  const shield = new THREE.Mesh(new RoundedBoxGeometry(1.46, 1.15, 0.13, 2, 0.025), shieldMat);
  shield.position.set(0.46, 0.35, 0.12);
  mainboard.add(shield);

  const shieldLabel = addDecal(
    mainboard,
    makeTextTexture('DJI  IMAGING', {
      width: 768,
      height: 160,
      color: 'rgba(32,40,42,.78)',
      font: '600 58px Bahnschrift, sans-serif',
      letterSpacing: 4,
    }),
    0.98,
    0.2,
    [0.46, 0.58, 0.187],
    [0, 0, 0],
    0.75
  );
  shieldLabel.renderOrder = 2;

  const memoryChips = [-1.47, -0.96, 1.43, 1.91];
  const chipMat = makeStandard(0x15191b, 0.25, 0.5);
  memoryChips.forEach((x, index) => {
    const chip = new THREE.Mesh(
      new RoundedBoxGeometry(0.38, 0.5, 0.075, 2, 0.018),
      chipMat
    );
    chip.position.set(x, -0.65 + (index % 2) * 0.08, 0.09);
    mainboard.add(chip);
  });

  const cpu = new THREE.Mesh(
    new RoundedBoxGeometry(0.67, 0.67, 0.09, 2, 0.018),
    makeStandard(0x202325, 0.4, 0.38)
  );
  cpu.position.set(-0.75, 0.45, 0.11);
  mainboard.add(cpu);

  const cpuCore = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.28, 0.012),
    new THREE.MeshStandardMaterial({
      color: 0x3e4b50,
      metalness: 0.85,
      roughness: 0.15,
      emissive: 0x1b2f33,
      emissiveIntensity: 0.45,
    })
  );
  cpuCore.position.set(-0.75, 0.45, 0.165);
  mainboard.add(cpuCore);

  const capMat = new THREE.MeshStandardMaterial({ color: 0x555d5e, metalness: 0.6, roughness: 0.38 });
  for (let i = 0; i < 7; i += 1) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.15, 12), capMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(-1.8 + i * 0.22, 1.0, 0.11);
    mainboard.add(cap);
  }

  const connectorMat = new THREE.MeshStandardMaterial({
    color: 0x181310,
    metalness: 0.15,
    roughness: 0.52,
  });
  const connector = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.2), connectorMat);
  connector.position.set(1.7, -0.95, 0.08);
  mainboard.add(connector);

  const pinMat = new THREE.MeshStandardMaterial({ color: 0xc6a25d, metalness: 0.9, roughness: 0.26 });
  for (let i = 0; i < 12; i += 1) {
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.03), pinMat);
    pin.position.set(1.35 + i * 0.065, -0.87, 0.2);
    mainboard.add(pin);
  }

  const led = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.035),
    new THREE.MeshBasicMaterial({ color: 0x5ae9ff })
  );
  led.position.set(2.0, 0.9, 0.09);
  mainboard.add(led);

  const cableMat = new THREE.MeshStandardMaterial({ color: 0xa66d2b, roughness: 0.64, metalness: 0.12 });
  [
    [-0.15, -1.55, 0.3],
    [0.25, -1.62, 0.22],
  ].forEach(([x, y, bend]) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, -1.3, 0.03),
      new THREE.Vector3(x + bend * 0.2, -1.55, 0.02),
      new THREE.Vector3(x + bend, y, -0.02),
    ]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.022, 6, false), cableMat);
    tube.scale.z = 0.45;
    mainboard.add(tube);
  });

  [
    [-2.16, -1.23],
    [2.16, 1.23],
    [2.16, -1.23],
  ].forEach(([x, y]) => addScrew(mainboard, x, y, 0.07, 'z', 0.05));

  register('mainboard', mainboard);

  // -------------------------------------------------------------------------
  // Thermal module
  // -------------------------------------------------------------------------
  const thermal = new THREE.Group();
  const graphite = new THREE.Mesh(
    roundedSlab(3.0, 2.25, 0.06, 0.08, 0.012),
    new THREE.MeshStandardMaterial({
      color: 0x1c1e20,
      metalness: 0.35,
      roughness: 0.5,
      roughnessMap: surfaceNoise,
    })
  );
  thermal.add(graphite);

  const heatPlate = new THREE.Mesh(
    new RoundedBoxGeometry(2.75, 1.88, 0.11, 3, 0.035),
    makeStandard(0x69747a, 0.8, 0.33)
  );
  heatPlate.position.z = -0.12;
  thermal.add(heatPlate);

  const finMat = makeStandard(0x8b969b, 0.9, 0.28);
  for (let i = 0; i < 15; i += 1) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.52, 0.48), finMat);
    fin.position.set(-1.2 + i * 0.17, 0.0, -0.4);
    thermal.add(fin);
  }

  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xb77742,
    metalness: 0.88,
    roughness: 0.25,
  });
  const pipeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.1, -0.66, 0.0),
    new THREE.Vector3(-0.4, -0.88, 0.04),
    new THREE.Vector3(0.5, -0.8, 0.04),
    new THREE.Vector3(1.12, -0.35, 0.0),
  ]);
  const heatPipe = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve, 40, 0.06, 10, false), copperMat);
  thermal.add(heatPipe);
  const heatPipe2 = heatPipe.clone();
  heatPipe2.position.y = 0.32;
  heatPipe2.rotation.z = 0.03;
  thermal.add(heatPipe2);

  const thermalPad = new THREE.Mesh(
    roundedSlab(1.1, 0.7, 0.03, 0.04, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x465f61, roughness: 0.78, metalness: 0.1 })
  );
  thermalPad.position.set(0.8, 0.44, 0.045);
  thermal.add(thermalPad);

  register('thermal', thermal);

  // -------------------------------------------------------------------------
  // Audio module
  // -------------------------------------------------------------------------
  const audio = new THREE.Group();
  const audioBase = new THREE.Mesh(
    new RoundedBoxGeometry(2.15, 0.5, 0.74, 3, 0.1),
    makeStandard(0x101416, 0.25, 0.56)
  );
  audio.add(audioBase);

  const audioGrille = addDecal(
    audio,
    makeVentTexture(),
    0.62,
    0.31,
    [0.55, 0.02, 0.374],
    [0, 0, 0],
    0.75
  );
  audioGrille.material.blending = THREE.NormalBlending;

  const micGold = new THREE.MeshStandardMaterial({
    color: 0xc5a05a,
    metalness: 0.85,
    roughness: 0.3,
  });
  [-0.7, -0.3, 0.1].forEach((x) => {
    addCylinder(audio, 0.055, 0.02, micGold, [x, 0.02, 0.38], 20, 'z');
    addCylinder(audio, 0.028, 0.026, micMat, [x, 0.02, 0.395], 16, 'z');
  });

  const audioFlex = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.68, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xa56a2e, roughness: 0.64, metalness: 0.12 })
  );
  audioFlex.position.set(-0.9, -0.4, 0.0);
  audio.add(audioFlex);

  register('audio', audio);

  // -------------------------------------------------------------------------
  // Front display
  // -------------------------------------------------------------------------
  const frontDisplay = new THREE.Group();
  const frontFrameMat = new THREE.MeshStandardMaterial({
    color: 0x090c0e,
    metalness: 0.32,
    roughness: 0.42,
    envMapIntensity: 1.1,
  });
  const frontFrame = new THREE.Mesh(
    new RoundedBoxGeometry(2.92, 2.92, 0.14, 4, 0.19),
    frontFrameMat
  );
  frontDisplay.add(frontFrame);

  const frontScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.52, 2.52),
    new THREE.MeshBasicMaterial({
      map: makeFrontScreenTexture(),
      toneMapped: false,
    })
  );
  frontScreen.position.set(0, 0.14, 0.074);
  frontDisplay.add(frontScreen);

  const frontGlass = new THREE.Mesh(
    roundedSlab(2.68, 2.68, 0.018, 0.15, 0.006),
    createScreenGlassMaterial()
  );
  frontGlass.position.set(0, 0.14, 0.083);
  frontDisplay.add(frontGlass);

  addDecal(frontDisplay, makeDjiLogoTex(), 0.72, 0.36, [-0.92, -1.2, 0.085], [0, 0, 0], 0.85);
  const frontLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.045, 0.012),
    new THREE.MeshBasicMaterial({ color: 0x73ff99 })
  );
  frontLed.position.set(1.06, -1.2, 0.09);
  frontDisplay.add(frontLed);

  register('frontDisplay', frontDisplay);

  // -------------------------------------------------------------------------
  // Rear display
  // -------------------------------------------------------------------------
  const rearDisplay = new THREE.Group();
  const rearFrame = new THREE.Mesh(
    new RoundedBoxGeometry(2.7, 3.66, 0.16, 4, 0.22),
    makeStandard(0x0a0d0f, 0.3, 0.42)
  );
  rearDisplay.add(rearFrame);

  const rearScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.08, 3.42),
    new THREE.MeshBasicMaterial({
      map: makeRearScreenTexture(),
      toneMapped: false,
    })
  );
  rearScreen.position.set(0, 0.02, 0.086);
  rearDisplay.add(rearScreen);

  const rearGlass = new THREE.Mesh(
    roundedSlab(2.38, 3.44, 0.018, 0.2, 0.006),
    createScreenGlassMaterial()
  );
  rearGlass.position.set(0, 0.02, 0.094);
  rearDisplay.add(rearGlass);

  register('rearDisplay', rearDisplay);

  // -------------------------------------------------------------------------
  // Top controls
  // -------------------------------------------------------------------------
  const controls = new THREE.Group();
  const recordButton = new THREE.Group();
  const recordBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.41, 0.16, 48),
    makeDarkMetal(0x22282b, 0.34)
  );
  recordBase.position.y = 0.06;
  recordButton.add(recordBase);

  const redRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.315, 0.027, 12, 64),
    new THREE.MeshStandardMaterial({
      color: 0xb63832,
      metalness: 0.55,
      roughness: 0.3,
      emissive: 0x5e0e09,
      emissiveIntensity: 0.6,
    })
  );
  redRing.rotation.x = -Math.PI / 2;
  redRing.position.y = 0.148;
  recordButton.add(redRing);

  const recordCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.3, 0.06, 48),
    makeStandard(0x14181b, 0.45, 0.48)
  );
  recordCap.position.y = 0.17;
  recordButton.add(recordCap);

  const recordDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.105, 32),
    new THREE.MeshBasicMaterial({ color: 0xd84b42 })
  );
  recordDot.rotation.x = -Math.PI / 2;
  recordDot.position.y = 0.202;
  recordButton.add(recordDot);
  recordButton.position.set(1.58, 0.0, 0.16);
  controls.add(recordButton);

  const quickButton = new THREE.Mesh(
    new RoundedBoxGeometry(0.64, 0.11, 0.32, 3, 0.05),
    makeDarkMetal(0x262c2f, 0.42)
  );
  quickButton.position.set(-2.15, 0.05, 0.1);
  controls.add(quickButton);

  const quickIcon = addDecal(
    controls,
    makeTextTexture('QS', {
      width: 256,
      height: 256,
      color: 'rgba(210,220,225,.7)',
      font: '600 112px Bahnschrift, sans-serif',
    }),
    0.25,
    0.25,
    [-2.15, 0.111, 0.1],
    [-Math.PI / 2, 0, 0],
    0.8
  );
  quickIcon.renderOrder = 3;

  register('controls', controls);

  // -------------------------------------------------------------------------
  // Battery
  // -------------------------------------------------------------------------
  const battery = new THREE.Group();
  const batteryShellMat = new THREE.MeshStandardMaterial({
    color: 0x232b2f,
    metalness: 0.55,
    roughness: 0.46,
    roughnessMap: surfaceNoise,
  });
  const batteryShell = new THREE.Mesh(
    new RoundedBoxGeometry(2.82, 2.98, 1.18, 4, 0.13),
    batteryShellMat
  );
  battery.add(batteryShell);

  addDecal(
    battery,
    makeBatteryLabelTexture(),
    2.56,
    2.05,
    [0, 0.16, 0.595],
    [0, 0, 0],
    1
  );

  const batteryTopBand = new THREE.Mesh(
    new RoundedBoxGeometry(2.58, 0.18, 1.1, 3, 0.04),
    makeStandard(0x414d53, 0.7, 0.35)
  );
  batteryTopBand.position.set(0, 1.46, 0);
  battery.add(batteryTopBand);

  const contactMat = new THREE.MeshStandardMaterial({
    color: 0xd1b26c,
    metalness: 0.95,
    roughness: 0.2,
  });
  [-0.62, 0.0, 0.62].forEach((x) => {
    const contact = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.06, 0.16, 2, 0.02), contactMat);
    contact.position.set(x, 1.56, 0.38);
    battery.add(contact);
  });

  const batteryRail = new THREE.Mesh(
    new RoundedBoxGeometry(0.12, 2.72, 0.18, 2, 0.035),
    makeDarkMetal(0x111517, 0.35)
  );
  batteryRail.position.set(-1.46, 0, 0.1);
  battery.add(batteryRail);

  const pullTab = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.08, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x080a0b, roughness: 0.8 })
  );
  pullTab.position.set(0.65, 1.54, 0.0);
  battery.add(pullTab);

  register('battery', battery);

  // -------------------------------------------------------------------------
  // IO cover
  // -------------------------------------------------------------------------
  const ioCover = new THREE.Group();
  const ioPlateMat = makeStandard(0x1a2023, 0.42, 0.52);
  const ioPlate = new THREE.Mesh(
    roundedSlab(2.64, 3.42, 0.12, 0.2, 0.03),
    ioPlateMat
  );
  ioPlate.position.z = 0.04;
  ioCover.add(ioPlate);

  const ioRidge = new THREE.Mesh(
    new RoundedBoxGeometry(2.34, 0.18, 0.08, 2, 0.035),
    makeDarkMetal(0x2b3235, 0.4)
  );
  ioRidge.position.set(0, -1.25, 0.08);
  ioCover.add(ioRidge);

  const ioLabel = addDecal(
    ioCover,
    makePortPanelTexture(),
    2.1,
    2.6,
    [0, 0.25, 0.105],
    [0, 0, 0],
    0.75
  );
  ioLabel.renderOrder = 2;

  const ioLatch = new THREE.Mesh(
    new RoundedBoxGeometry(0.6, 0.18, 0.12, 2, 0.04),
    makeDarkMetal(0x30383c, 0.35)
  );
  ioLatch.position.set(0.0, 1.46, 0.0);
  ioCover.add(ioLatch);

  register('ioCover', ioCover);

  // -------------------------------------------------------------------------
  // Magnetic mount
  // -------------------------------------------------------------------------
  const mount = new THREE.Group();
  const mountPlate = new THREE.Mesh(
    new RoundedBoxGeometry(3.15, 0.24, 2.28, 4, 0.08),
    makeDarkMetal(0x202529, 0.36)
  );
  mountPlate.position.y = 0.0;
  mount.add(mountPlate);

  const mountRails = new THREE.Group();
  [-0.6, 0.6].forEach((z) => {
    const rail = new THREE.Mesh(
      new RoundedBoxGeometry(2.45, 0.2, 0.31, 2, 0.055),
      new THREE.MeshStandardMaterial({
        color: 0x8d979c,
        metalness: 0.9,
        roughness: 0.26,
      })
    );
    rail.position.set(0, -0.2, z);
    mountRails.add(rail);
  });
  mount.add(mountRails);

  const magnetMat = new THREE.MeshStandardMaterial({
    color: 0x4b3b58,
    metalness: 0.85,
    roughness: 0.28,
  });
  [-1.14, 1.14].forEach((x) => {
    [-0.54, 0.54].forEach((z) => {
      const magnet = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 28), magnetMat);
      magnet.position.set(x, -0.3, z);
      mount.add(magnet);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.17, 0.018, 8, 28),
        makeDarkMetal(0x6e777b, 0.28)
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, -0.33, z);
      mount.add(ring);
    });
  });

  const threadBase = addCylinder(mount, 0.28, 0.06, makeDarkMetal(0x0c0f10, 0.4), [0, -0.33, 0], 32, 'y');
  const threadRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.025, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0x444d51, metalness: 0.9, roughness: 0.3 })
  );
  threadRing.rotation.x = Math.PI / 2;
  threadRing.position.set(0, -0.37, 0);
  mount.add(threadRing);

  const latch = new THREE.Mesh(
    new RoundedBoxGeometry(0.66, 0.18, 0.42, 2, 0.04),
    makeDarkMetal(0x2b3134, 0.4)
  );
  latch.position.set(-1.0, 0.02, 1.18);
  mount.add(latch);

  register('mount', mount);

  return { root, parts, dimensions: { width: BODY_W, height: BODY_H, depth: BODY_D } };
}
