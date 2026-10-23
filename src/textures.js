import * as THREE from 'three';

let maxAnisotropy = 8;
export function setTextureAnisotropy(value) {
  maxAnisotropy = value;
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function finish(canvas, { srgb = true, wrap = false } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (wrap) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPill(ctx, x, y, w, h, radius, fill, stroke, lineWidth = 2) {
  roundRect(ctx, x, y, w, h, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawBattery(ctx, x, y, w, h, color = 'rgba(255,255,255,.92)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  roundRect(ctx, x, y, w, h, 4);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(x + w, y + h * 0.3, 5, h * 0.4);
  ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
}

function drawWifi(ctx, x, y, scale = 1, color = 'rgba(255,255,255,.95)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * scale;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(x, y, (12 + i * 10) * scale, Math.PI * 1.22, Math.PI * 1.78);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 3.2 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawFocusBrackets(ctx, cx, cy, size, color, lw = 2) {
  const arm = size * 0.28;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(cx - size, cy - size + arm);
  ctx.lineTo(cx - size, cy - size);
  ctx.lineTo(cx - size + arm, cy - size);
  ctx.moveTo(cx + size - arm, cy - size);
  ctx.lineTo(cx + size, cy - size);
  ctx.lineTo(cx + size, cy - size + arm);
  ctx.moveTo(cx + size, cy + size - arm);
  ctx.lineTo(cx + size, cy + size);
  ctx.lineTo(cx + size - arm, cy + size);
  ctx.moveTo(cx - size + arm, cy + size);
  ctx.lineTo(cx - size, cy + size);
  ctx.lineTo(cx - size, cy + size - arm);
  ctx.stroke();
}

function addGrain(ctx, width, height, count, alpha, random) {
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const shade = random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha * random()})`;
    ctx.fillRect(random() * width, random() * height, 1 + random() * 2, 1 + random() * 2);
  }
  ctx.restore();
}

export function makeSurfaceNoise(size = 512) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(1147);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  addGrain(ctx, size, size, 26000, 0.24, random);
  for (let i = 0; i < 900; i += 1) {
    ctx.strokeStyle = `rgba(${random() > 0.5 ? 255 : 0},${random() > 0.5 ? 255 : 0},${
      random() > 0.5 ? 255 : 0
    },${random() * 0.07})`;
    ctx.lineWidth = 0.5 + random() * 1.5;
    const x = random() * size;
    const y = random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 18, y + (random() - 0.5) * 18);
    ctx.stroke();
  }
  const texture = finish(canvas, { srgb: false, wrap: true });
  texture.repeat.set(7, 5);
  return texture;
}

export function makeFrontScreenTexture() {
  const size = 1024;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(98);

  const sky = ctx.createLinearGradient(0, 0, 0, size);
  sky.addColorStop(0, '#07131f');
  sky.addColorStop(0.32, '#173c55');
  sky.addColorStop(0.56, '#d47a58');
  sky.addColorStop(0.67, '#efbd86');
  sky.addColorStop(0.68, '#284b55');
  sky.addColorStop(1, '#061015');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size, size);

  const sun = ctx.createRadialGradient(650, 545, 5, 650, 545, 210);
  sun.addColorStop(0, 'rgba(255,247,217,.95)');
  sun.addColorStop(0.18, 'rgba(255,208,155,.8)');
  sun.addColorStop(0.55, 'rgba(255,150,105,.22)');
  sun.addColorStop(1, 'rgba(255,150,105,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#1a2f38';
  ctx.beginPath();
  ctx.moveTo(0, 630);
  ctx.lineTo(110, 560);
  ctx.lineTo(220, 606);
  ctx.lineTo(360, 500);
  ctx.lineTo(500, 604);
  ctx.lineTo(620, 540);
  ctx.lineTo(760, 635);
  ctx.lineTo(900, 567);
  ctx.lineTo(1024, 620);
  ctx.lineTo(1024, 710);
  ctx.lineTo(0, 710);
  ctx.closePath();
  ctx.globalAlpha = 0.72;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#0d2029';
  ctx.beginPath();
  ctx.moveTo(0, 668);
  ctx.lineTo(160, 610);
  ctx.lineTo(290, 662);
  ctx.lineTo(450, 592);
  ctx.lineTo(590, 664);
  ctx.lineTo(740, 608);
  ctx.lineTo(920, 665);
  ctx.lineTo(1024, 630);
  ctx.lineTo(1024, 780);
  ctx.lineTo(0, 780);
  ctx.closePath();
  ctx.fill();

  const water = ctx.createLinearGradient(0, 700, 0, size);
  water.addColorStop(0, 'rgba(225,166,118,.38)');
  water.addColorStop(0.35, 'rgba(31,83,96,.5)');
  water.addColorStop(1, 'rgba(4,18,25,.92)');
  ctx.fillStyle = water;
  ctx.fillRect(0, 690, size, size - 690);

  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = '#ffd8a8';
  ctx.lineWidth = 2;
  for (let i = 0; i < 45; i += 1) {
    const y = 720 + random() * 260;
    const segment = 20 + random() * 150;
    const x = 640 + (random() - 0.5) * (55 + (y - 700) * 1.4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + segment, y);
    ctx.stroke();
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(0,0,0,.34)';
  ctx.fillRect(0, 0, size, 92);
  ctx.fillRect(0, size - 112, size, 112);

  ctx.font = '600 30px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.94)';
  ctx.fillText('4K 120', 42, 58);
  ctx.font = '400 22px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.62)';
  ctx.fillText('D-LOG M', 42, 88);

  drawWifi(ctx, 910, 52, 0.8);
  drawBattery(ctx, 940, 40, 38, 20);
  ctx.font = '500 20px Bahnschrift, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.fillText('01:28', 842, 60);

  ctx.fillStyle = 'rgba(0,0,0,.46)';
  drawPill(ctx, 42, size - 84, 178, 42, 21, 'rgba(0,0,0,.46)');
  ctx.fillStyle = '#ff5d52';
  ctx.beginPath();
  ctx.arc(68, size - 63, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '600 22px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('REC   00:12:48', 84, size - 55);

  drawPill(ctx, size - 196, size - 86, 154, 44, 22, 'rgba(0,0,0,.5)');
  ctx.font = '600 19px Bahnschrift, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('FOV  155°', size - 172, size - 57);

  drawFocusBrackets(ctx, 610, 440, 190, 'rgba(255,255,255,.48)', 2);

  const glint = ctx.createLinearGradient(0, 0, size, size);
  glint.addColorStop(0, 'rgba(255,255,255,.11)');
  glint.addColorStop(0.35, 'rgba(255,255,255,0)');
  glint.addColorStop(0.7, 'rgba(255,255,255,.035)');
  glint.addColorStop(1, 'rgba(255,255,255,.08)');
  ctx.fillStyle = glint;
  ctx.fillRect(0, 0, size, size);

  return finish(canvas);
}

export function makeRearScreenTexture() {
  const w = 720;
  const h = 1200;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(404);

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#050b12');
  bg.addColorStop(0.4, '#123344');
  bg.addColorStop(0.69, '#2e7777');
  bg.addColorStop(0.7, '#07171d');
  bg.addColorStop(1, '#020a0e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(510, 430, 10, 510, 430, 330);
  glow.addColorStop(0, 'rgba(193,255,236,.78)');
  glow.addColorStop(0.2, 'rgba(125,228,214,.32)');
  glow.addColorStop(1, 'rgba(125,228,214,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#123037';
  ctx.beginPath();
  ctx.moveTo(0, 760);
  ctx.lineTo(110, 640);
  ctx.lineTo(220, 700);
  ctx.lineTo(360, 565);
  ctx.lineTo(505, 720);
  ctx.lineTo(610, 655);
  ctx.lineTo(720, 735);
  ctx.lineTo(720, 880);
  ctx.lineTo(0, 880);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#071a20';
  ctx.beginPath();
  ctx.moveTo(0, 825);
  ctx.lineTo(150, 735);
  ctx.lineTo(275, 800);
  ctx.lineTo(440, 700);
  ctx.lineTo(580, 815);
  ctx.lineTo(720, 746);
  ctx.lineTo(720, 1000);
  ctx.lineTo(0, 1000);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(192,255,238,.12)';
  for (let i = 0; i < 60; i += 1) {
    const y = 800 + random() * 200;
    ctx.fillRect(random() * w, y, 20 + random() * 80, 1.5);
  }

  const vignette = ctx.createRadialGradient(w / 2, h * 0.45, 100, w / 2, h * 0.45, h * 0.7);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,.72)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  const topGrad = ctx.createLinearGradient(0, 0, 0, 150);
  topGrad.addColorStop(0, 'rgba(0,0,0,.62)');
  topGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, w, 170);

  const bottomGrad = ctx.createLinearGradient(0, h - 260, 0, h);
  bottomGrad.addColorStop(0, 'rgba(0,0,0,0)');
  bottomGrad.addColorStop(1, 'rgba(0,0,0,.85)');
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, h - 280, w, 280);

  ctx.font = '700 28px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.94)';
  ctx.fillText('4K / 60', 42, 62);
  ctx.font = '500 20px Bahnschrift, sans-serif';
  ctx.fillStyle = '#ff6c5f';
  ctx.beginPath();
  ctx.arc(343, 53, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fillText('REC 00:07:21', 360, 61);
  drawWifi(ctx, 610, 55, 0.72);
  drawBattery(ctx, 648, 42, 34, 18);

  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(85, 600);
  ctx.lineTo(635, 600);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,180,90,.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(350, 588);
  ctx.lineTo(370, 600);
  ctx.lineTo(350, 612);
  ctx.stroke();

  drawFocusBrackets(ctx, 360, 450, 135, 'rgba(255,255,255,.35)', 2);

  const shutterY = h - 120;
  ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(360, shutterY, 59, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(360, shutterY, 45, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '600 22px Bahnschrift, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.68)';
  ctx.fillText('VIDEO', 318, shutterY + 106);
  ctx.fillText('1.0x', 66, shutterY + 12);
  ctx.font = '500 18px Bahnschrift, sans-serif';
  ctx.fillText('D-LOG M  ·  10-BIT', 470, shutterY + 12);

  ctx.fillStyle = 'rgba(255,255,255,.84)';
  ctx.font = 'italic 900 36px Arial, sans-serif';
  ctx.fillText('dji', 36, h - 42);

  const glint = ctx.createLinearGradient(0, 0, w, h);
  glint.addColorStop(0, 'rgba(255,255,255,.08)');
  glint.addColorStop(0.3, 'rgba(255,255,255,0)');
  glint.addColorStop(1, 'rgba(255,255,255,.045)');
  ctx.fillStyle = glint;
  ctx.fillRect(0, 0, w, h);

  return finish(canvas);
}

function drawArcText(ctx, text, cx, cy, radius, startAngle, endAngle, fontSize, color, weight = 500) {
  const chars = [...text];
  const step = (endAngle - startAngle) / Math.max(chars.length - 1, 1);
  ctx.save();
  ctx.font = `${weight} ${fontSize}px Bahnschrift, "Segoe UI", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  chars.forEach((char, i) => {
    const angle = startAngle + step * i;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

export function makeLensFaceTexture() {
  const size = 1024;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const c = size / 2;

  const bg = ctx.createRadialGradient(c, c, 100, c, c, c);
  bg.addColorStop(0, '#08090a');
  bg.addColorStop(0.6, '#101214');
  bg.addColorStop(0.88, '#1b1e20');
  bg.addColorStop(1, '#050606');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#2c3033';
  ctx.lineWidth = 2;
  for (let r = 348; r <= 500; r += 11) {
    ctx.globalAlpha = r % 22 === 0 ? 0.3 : 0.13;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(197,161,97,.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(c, c, 362, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.1)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(c, c, 374, 0, Math.PI * 2);
  ctx.stroke();

  drawArcText(ctx, 'FOV 155°', c, c, 428, -Math.PI * 0.79, -Math.PI * 0.47, 30, 'rgba(228,231,232,.82)', 500);

  ctx.save();
  ctx.translate(c + 402, c + 8);
  ctx.rotate(Math.PI / 2);
  ctx.font = '500 30px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(228,231,232,.8)';
  ctx.textAlign = 'center';
  ctx.fillText('F2.8', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(c - 250, c + 335);
  ctx.rotate(-Math.PI * 0.11);
  ctx.font = '500 28px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(228,231,232,.66)';
  ctx.fillText('1/1.3"', 0, 0);
  ctx.restore();

  ctx.font = 'italic 800 40px Arial, sans-serif';
  ctx.fillStyle = 'rgba(216,221,224,.55)';
  ctx.fillText('dji', c + 250, c + 392);

  const barrel = ctx.createRadialGradient(c - 55, c - 70, 15, c, c, 290);
  barrel.addColorStop(0, '#333a3e');
  barrel.addColorStop(0.4, '#0b0d0f');
  barrel.addColorStop(0.82, '#020303');
  barrel.addColorStop(1, '#191b1d');
  ctx.beginPath();
  ctx.arc(c, c, 334, 0, Math.PI * 2);
  ctx.fillStyle = barrel;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(c, c, 294, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(199,161,96,.8)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(c, c, 278, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const interior = ctx.createRadialGradient(c - 50, c - 55, 5, c, c, 258);
  interior.addColorStop(0, 'rgba(27,53,55,.9)');
  interior.addColorStop(0.32, 'rgba(6,17,20,.96)');
  interior.addColorStop(0.7, 'rgba(1,4,6,1)');
  interior.addColorStop(1, 'rgba(20,25,27,1)');
  ctx.beginPath();
  ctx.arc(c, c, 254, 0, Math.PI * 2);
  ctx.fillStyle = interior;
  ctx.fill();

  return finish(canvas);
}

export function makePcbTexture() {
  const w = 1024;
  const h = 680;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const random = mulberry32(8821);

  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, '#09271f');
  base.addColorStop(0.5, '#0b1f1c');
  base.addColorStop(1, '#071714');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(197,151,77,.34)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 150; i += 1) {
    let x = Math.floor(random() * 20) * (w / 20);
    let y = Math.floor(random() * 14) * (h / 14);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segments = 2 + Math.floor(random() * 5);
    for (let s = 0; s < segments; s += 1) {
      if (random() > 0.5) {
        x += (random() - 0.25) * 150;
      } else {
        y += (random() - 0.25) * 100;
      }
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(215,180,104,.34)';
  for (let i = 0; i < 260; i += 1) {
    ctx.beginPath();
    ctx.arc(random() * w, random() * h, 1.4 + random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(228,218,182,.22)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 50; i += 1) {
    const x = random() * w;
    const y = random() * h;
    const len = 16 + random() * 40;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(232,224,197,.5)';
  ctx.font = '500 17px "Cascadia Mono", Consolas, monospace';
  ctx.fillText('DJI  A4-MB  REV.B', 56, 62);
  ctx.fillText('IMAGE CORE / 4K120', 56, 88);
  ctx.font = '400 13px "Cascadia Mono", Consolas, monospace';
  ctx.fillText('P/N: 04-IMX-01  ·  MADE FOR OSMO ACTION 4', 56, 112);

  ctx.strokeStyle = 'rgba(231,220,186,.18)';
  ctx.lineWidth = 5;
  ctx.strokeRect(26, 26, w - 52, h - 52);

  ctx.fillStyle = 'rgba(255,255,255,.34)';
  ctx.font = '500 12px "Cascadia Mono", monospace';
  const codes = ['U12', 'J4', 'LDO3', 'TP12', 'C802', 'R61', 'J8', 'U7'];
  for (let i = 0; i < 16; i += 1) {
    ctx.fillText(codes[i % codes.length], 80 + random() * (w - 160), 160 + random() * (h - 240));
  }

  addGrain(ctx, w, h, 4000, 0.08, random);
  return finish(canvas);
}

export function makeBatteryLabelTexture() {
  const w = 1024;
  const h = 820;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, '#1c262b');
  base.addColorStop(0.48, '#11191d');
  base.addColorStop(1, '#253139');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(124,223,255,.1)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(520, 0);
  ctx.lineTo(220, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(176,219,233,.18)';
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, w - 56, h - 56);
  ctx.strokeStyle = 'rgba(176,219,233,.09)';
  ctx.lineWidth = 1;
  ctx.strokeRect(44, 44, w - 88, h - 88);

  ctx.font = 'italic 900 58px Arial, sans-serif';
  ctx.fillStyle = 'rgba(235,245,248,.9)';
  ctx.fillText('dji', 78, 132);

  ctx.font = '500 26px Bahnschrift, sans-serif';
  ctx.fillStyle = 'rgba(207,229,235,.64)';
  ctx.fillText('OSMO ACTION', 214, 103);
  ctx.font = '600 31px Bahnschrift, sans-serif';
  ctx.fillStyle = 'rgba(235,245,248,.9)';
  ctx.fillText('EXTREME BATTERY', 214, 141);

  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(78, 186, w - 156, 2);

  ctx.font = '300 102px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillStyle = '#e9f8fc';
  ctx.fillText('1770', 72, 318);
  ctx.font = '500 35px Bahnschrift, sans-serif';
  ctx.fillStyle = 'rgba(180,232,244,.84)';
  ctx.fillText('mAh', 450, 316);

  ctx.font = '500 40px Bahnschrift, sans-serif';
  ctx.fillStyle = '#9ce6f8';
  ctx.fillText('6.8 Wh', 74, 388);
  ctx.font = '400 25px Bahnschrift, sans-serif';
  ctx.fillStyle = 'rgba(196,228,236,.54)';
  ctx.fillText('Li-ion  ·  3.85 V  ·  -20°C TO 45°C', 74, 430);

  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.fillRect(74, 472, 560, 186);

  ctx.font = '400 23px Bahnschrift, sans-serif';
  ctx.fillStyle = 'rgba(220,241,247,.64)';
  const lines = [
    'DO NOT DISASSEMBLE, CRUSH OR HEAT.',
    'USE ONLY WITH DJI APPROVED CHARGER.',
    'KEEP AWAY FROM FLAMMABLE MATERIALS.',
  ];
  lines.forEach((line, index) => {
    ctx.fillText(line, 96, 520 + index * 38);
  });

  ctx.save();
  ctx.translate(w - 175, 280);
  for (let i = 0; i < 30; i += 1) {
    const bw = i % 3 === 0 ? 7 : i % 5 === 0 ? 3 : 5;
    ctx.fillStyle = 'rgba(217,241,248,.66)';
    ctx.fillRect(i * 4, 0, bw, 180 - ((i * 17) % 60));
  }
  ctx.restore();

  ctx.font = '500 18px "Cascadia Mono", Consolas, monospace';
  ctx.fillStyle = 'rgba(195,225,234,.4)';
  ctx.fillText('A4-BAT-1770  /  SN 24A4-0917', 74, h - 62);
  ctx.fillText('CE   UKCA   Li-ion 20', w - 380, h - 62);

  addGrain(ctx, w, h, 2500, 0.06, mulberry32(213));
  return finish(canvas);
}

export function makeActionBadgeTexture() {
  const w = 1024;
  const h = 260;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, w, h);

  ctx.textBaseline = 'middle';
  ctx.font = '500 106px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(226,232,235,.95)';
  const letters = [...'ACTION'];
  let x = 96;
  letters.forEach((letter) => {
    ctx.fillText(letter, x, 133);
    x += 128;
  });

  ctx.fillStyle = 'rgba(210,220,226,.9)';
  ctx.beginPath();
  ctx.arc(874, 132, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d94a45';
  ctx.font = '600 142px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillText('4', 916, 128);

  return finish(canvas);
}

export function makeDjiLogoTex() {
  const w = 512;
  const h = 256;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(230,237,240,.72)';
  ctx.font = 'italic 900 150px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('dji', 118, 138);
  return finish(canvas);
}

export function makeTextTexture(text, {
  width = 1024,
  height = 256,
  color = 'rgba(255,255,255,.9)',
  font = '500 84px Bahnschrift, sans-serif',
  letterSpacing = 0,
  align = 'center',
} = {}) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacing}px`;
  ctx.fillText(text, width / 2, height / 2 + 4);
  return finish(canvas);
}

export function makeVentTexture() {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,.72)';
  for (let y = 0; y < 12; y += 1) {
    for (let x = 0; x < 12; x += 1) {
      ctx.beginPath();
      ctx.arc(42 + x * 39, 42 + y * 39, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(canvas);
}

export function makeGlowTexture() {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(150,243,255,.95)');
  gradient.addColorStop(0.14, 'rgba(100,230,255,.55)');
  gradient.addColorStop(0.4, 'rgba(56,180,230,.16)');
  gradient.addColorStop(0.7, 'rgba(30,100,150,.03)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return finish(canvas);
}

export function makeReticleTexture() {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(c, c, 100, c, c, 250);
  glow.addColorStop(0, 'rgba(0,0,0,0)');
  glow.addColorStop(0.65, 'rgba(80,221,255,.05)');
  glow.addColorStop(1, 'rgba(80,221,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(118,234,255,.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 12]);
  ctx.beginPath();
  ctx.arc(c, c, 214, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(118,234,255,.45)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI * 0.5 + Math.PI * 0.25;
    ctx.beginPath();
    ctx.arc(c, c, 231, angle - 0.18, angle + 0.18);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(118,234,255,.85)';
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI * 0.5;
    ctx.save();
    ctx.translate(c + Math.cos(angle) * 214, c + Math.sin(angle) * 214);
    ctx.rotate(angle);
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }

  return finish(canvas);
}

export function makeShadowTexture() {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,.68)');
  grad.addColorStop(0.35, 'rgba(0,0,0,.32)');
  grad.addColorStop(0.7, 'rgba(0,0,0,.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return finish(canvas);
}

export function makeLensInnerTexture() {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const c = size / 2;

  const base = ctx.createRadialGradient(c - 35, c - 42, 8, c, c, c);
  base.addColorStop(0, '#2a444a');
  base.addColorStop(0.18, '#0b1d22');
  base.addColorStop(0.52, '#030b0f');
  base.addColorStop(0.84, '#010203');
  base.addColorStop(1, '#111719');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const teal = ctx.createRadialGradient(c + 76, c - 52, 4, c + 76, c - 52, 180);
  teal.addColorStop(0, 'rgba(86,229,213,.35)');
  teal.addColorStop(0.35, 'rgba(44,155,161,.15)');
  teal.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = teal;
  ctx.fillRect(0, 0, size, size);

  const violet = ctx.createRadialGradient(c - 118, c + 84, 7, c - 118, c + 84, 155);
  violet.addColorStop(0, 'rgba(122,94,216,.26)');
  violet.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = violet;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(176,229,233,.1)';
  for (let r = 86; r < 240; r += 23) {
    ctx.lineWidth = r % 46 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const aperture = ctx.createRadialGradient(c, c, 2, c, c, 75);
  aperture.addColorStop(0, 'rgba(1,2,3,.98)');
  aperture.addColorStop(0.7, 'rgba(2,5,7,.88)');
  aperture.addColorStop(1, 'rgba(9,17,20,0)');
  ctx.fillStyle = aperture;
  ctx.beginPath();
  ctx.arc(c, c, 78, 0, Math.PI * 2);
  ctx.fill();

  const glint = ctx.createRadialGradient(c - 116, c - 116, 0, c - 116, c - 116, 62);
  glint.addColorStop(0, 'rgba(235,255,255,.75)');
  glint.addColorStop(0.22, 'rgba(174,242,245,.24)');
  glint.addColorStop(1, 'rgba(174,242,245,0)');
  ctx.fillStyle = glint;
  ctx.fillRect(0, 0, size, size);

  const echo = ctx.createRadialGradient(c + 120, c + 60, 0, c + 120, c + 60, 28);
  echo.addColorStop(0, 'rgba(255,255,255,.22)');
  echo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = echo;
  ctx.fillRect(0, 0, size, size);

  return finish(canvas);
}
