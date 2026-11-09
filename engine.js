// engine.js v2 - Roblox-style (R6) 3D story renderer in three.js. Driven frame-by-frame by story3d.py.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let R, scene, cam, shot, actors = {}, npcs = [], cars = [], fx = null, SEED = 1, sun, PM;
const FONT = '"Inter Black","Inter","Arial Black","DejaVu Sans",sans-serif';
const D2R = Math.PI / 180, SRGB = THREE.SRGBColorSpace;
const rnd = (s) => { const x = Math.sin(s * 127.1 + SEED * 311.7) * 43758.5453; return x - Math.floor(x); };
const ease = (u) => u < 0 ? 0 : u > 1 ? 1 : u * u * u * (u * (u * 6 - 15) + 10); // smootherstep
const lerp = (a, b, u) => a + (b - a) * u;
function prng(seed) { let a = (seed * 2654435761) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hcode(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function shade(hex, f) { const c = new THREE.Color(hex); if (f > 0) c.lerp(new THREE.Color(1, 1, 1), f); else c.multiplyScalar(1 + f); return '#' + c.getHexString(); }

// ---------- materials & procedural textures ----------
let MATS = {};
const mat = (c, o = {}) => { const k = (c && c.isColor ? c.getHexString() : c) + JSON.stringify(o, (key, v) => v && v.isTexture ? v.uuid : v); return MATS[k] || (MATS[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0, ...o })); };
const CAN = {};
function canvas(key, w, h, draw) { if (!CAN[key]) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h, prng(hcode(key))); CAN[key] = c; } return CAN[key]; }
let TEXS = {};
function tex(key, w, h, draw, rx = 1, ry = 1) {
  const k = key + '|' + rx + '|' + ry; if (TEXS[k]) return TEXS[k];
  const t = new THREE.CanvasTexture(canvas(key, w, h, draw)); t.colorSpace = SRGB; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return (TEXS[k] = t);
}
const tmat = (key, w, h, draw, rx, ry, o = {}) => mat('#ffffff', { map: tex(key, w, h, draw, rx, ry), ...o });
function speckle(g, w, h, r, base, n, amt, size = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const f = (r() - 0.5) * amt; g.fillStyle = f > 0 ? `rgba(255,255,255,${f})` : `rgba(0,0,0,${-f})`; g.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r())); }
}
const P = { // painters: (g, w, h, r)
  grass: (g, w, h, r) => { speckle(g, w, h, r, '#5d9e45', 2600, 0.22, 3); g.lineWidth = 1.4; for (let i = 0; i < 900; i++) { const x = r() * w, y = r() * h; g.strokeStyle = r() > 0.5 ? 'rgba(140,200,90,.45)' : 'rgba(40,90,30,.4)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 6); g.stroke(); } },
  dirt: (g, w, h, r) => speckle(g, w, h, r, '#8a6f52', 3000, 0.25, 3),
  asphalt: (g, w, h, r) => { speckle(g, w, h, r, '#44474d', 5000, 0.28, 2); g.strokeStyle = 'rgba(20,20,22,.35)'; g.lineWidth = 1.5; for (let i = 0; i < 3; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); } },
  slab: (g, w, h, r) => { speckle(g, w, h, r, '#cfcac0', 3000, 0.18, 2); g.strokeStyle = 'rgba(60,55,50,.55)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3); g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.strokeRect(4, 4, w - 8, h - 8); },
  curb: (g, w, h, r) => speckle(g, w, h, r, '#b4afa6', 1500, 0.18, 2),
  cobble: (g, w, h, r) => { g.fillStyle = '#5f5a52'; g.fillRect(0, 0, w, h); const n = 8; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const cx = (x + 0.5 + (y % 2) * 0.5) * w / n + (r() - 0.5) * 6, cy = (y + 0.5) * h / n + (r() - 0.5) * 6, l = 150 + r() * 50; g.fillStyle = `rgb(${l},${l - 8},${l - 22})`; g.beginPath(); g.ellipse(cx % w, cy, w / n * 0.44, h / n * 0.4, r(), 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(cx % w - 2, cy - 3, w / n * 0.25, h / n * 0.18, 0, 0, 7); g.fill(); } },
  wood: (g, w, h, r) => { const n = 6; for (let i = 0; i < n; i++) { const l = 0.85 + r() * 0.3; g.fillStyle = shade('#9a6a42', (l - 1)); g.fillRect(0, i * h / n, w, h / n); g.strokeStyle = 'rgba(60,35,20,.25)'; g.lineWidth = 1; for (let k = 0; k < 5; k++) { g.beginPath(); const y = i * h / n + r() * h / n; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 6, w * 0.6, y + (r() - 0.5) * 6, w, y); g.stroke(); } g.fillStyle = 'rgba(40,22,10,.6)'; g.fillRect(0, i * h / n, w, 2); g.fillRect(((i * 37) % 7) / 7 * w, i * h / n, 2, h / n); } },
  wallpaper: (g, w, h, r) => { speckle(g, w, h, r, '#e8dcc4', 800, 0.06, 2); g.fillStyle = 'rgba(160,120,80,.12)'; for (let y = 0; y < h; y += 32) for (let x = (y / 32 % 2) * 16; x < w; x += 32) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } },
};
function siding(color) { return (g, w, h, r) => { const n = 8; for (let i = 0; i < n; i++) { g.fillStyle = shade(color, (r() - 0.5) * 0.06); g.fillRect(0, i * h / n, w, h / n); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, (i + 1) * h / n - 3, w, 3); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, i * h / n, w, 2); } }; }
function brick(color) { return (g, w, h, r) => { g.fillStyle = '#c9c2b5'; g.fillRect(0, 0, w, h); const rows = 8, cols = 4; for (let y = 0; y < rows; y++) for (let x = -1; x < cols; x++) { const ox = (y % 2) * w / cols / 2; g.fillStyle = shade(color, (r() - 0.5) * 0.25); g.fillRect(x * w / cols + ox + 2, y * h / rows + 2, w / cols - 4, h / rows - 4); } }; }
function roof(color) { return (g, w, h, r) => { const rows = 6; for (let y = 0; y < rows; y++) for (let x = -1; x < 6; x++) { g.fillStyle = shade(color, (r() - 0.5) * 0.18); const ox = (y % 2) * w / 12; g.fillRect(x * w / 6 + ox + 1, y * h / rows, w / 6 - 2, h / rows - 2); } g.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 1; y < rows; y++) g.fillRect(0, y * h / rows - 3, w, 3); }; }
function windowPaint(lit, curtain) { return (g, w, h, r) => { const gr = g.createLinearGradient(0, 0, w, h); if (lit) { gr.addColorStop(0, '#ffe7a8'); gr.addColorStop(1, '#f2b45c'); } else { gr.addColorStop(0, '#cfe6f7'); gr.addColorStop(0.5, '#7fa9cc'); gr.addColorStop(1, '#3d5f80'); } g.fillStyle = gr; g.fillRect(0, 0, w, h); if (!lit) { g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(w * 0.15, 0); g.lineTo(w * 0.35, 0); g.lineTo(w * 0.05, h); g.lineTo(0, h); g.fill(); } if (curtain) { g.fillStyle = curtain; g.fillRect(0, 0, w * 0.16, h); g.fillRect(w * 0.84, 0, w * 0.16, h); } g.fillStyle = '#f5f2ea'; g.fillRect(0, 0, w, 7); g.fillRect(0, h - 7, w, 7); g.fillRect(0, 0, 7, h); g.fillRect(w - 7, 0, 7, h); g.fillRect(w / 2 - 3, 0, 6, h); g.fillRect(0, h / 2 - 3, w, 6); }; }
function doorPaint(color) { return (g, w, h) => { g.fillStyle = color; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 4; [[0.15, 0.08, 0.7, 0.36], [0.15, 0.52, 0.7, 0.4]].forEach(([x, y, a, b]) => g.strokeRect(x * w, y * h, a * w, b * h)); g.fillStyle = '#d8b44a'; g.beginPath(); g.arc(w * 0.8, h * 0.52, 5, 0, 7); g.fill(); }; }
function facade(color, seed) { return (g, w, h, r) => { brick(color)(g, w, h, r); const cols = 4, rows = 6; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const lit = r() > 0.6; const px = x * w / cols + w / cols * 0.2, py = y * h / rows + h / rows * 0.18, pw = w / cols * 0.6, ph = h / rows * 0.6; g.fillStyle = '#e9e4da'; g.fillRect(px - 4, py - 4, pw + 8, ph + 8); const gr = g.createLinearGradient(px, py, px + pw, py + ph); gr.addColorStop(0, lit ? '#ffe2a0' : '#bcd5ea'); gr.addColorStop(1, lit ? '#e8a64e' : '#36577a'); g.fillStyle = gr; g.fillRect(px, py, pw, ph); g.fillStyle = '#e9e4da'; g.fillRect(px + pw / 2 - 2, py, 4, ph); } }; }
function textPanel(text, bg, fg, w = 512, h = 128) { return (g, W, H) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); fitText(g, text, W, H * 0.8, fg); }; }
function fitText(g, text, w, h, color, weight = 900) {
  const lines = String(text).split('\n'); let s = h / lines.length * 0.8;
  g.font = `${weight} ${s}px ${FONT}`; const widest = Math.max(...lines.map(l => g.measureText(l).width));
  if (widest > w * 0.9) { s *= w * 0.9 / widest; g.font = `${weight} ${s}px ${FONT}`; }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * s * 1.1 + (H0(g) - h) / 2));
}
const H0 = (g) => g.canvas.height;
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = SRGB; t.anisotropy = 4; return t; }

// ---------- geometry helpers ----------
function box(w, h, d, m, r = 0.04, seg = 2) {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const mm = new THREE.Mesh(geo, m && (m.isMaterial || Array.isArray(m)) ? m : mat(m)); mm.castShadow = mm.receiveShadow = true; return mm;
}
function plane(w, d, m, x, y, z) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; scene.add(p); return p; }
function at(o, x, y, z, ry = 0) { o.position.set(x, y, z); o.rotation.y = ry; return o; }

// ---------- clothing painters ----------
function fabric(g, w, h, r, base, n = 1600) {
  speckle(g, w, h, r, base, n, 0.08, 2);
  for (let i = 0; i < 5; i++) { const x = r() * w, gw = 10 + r() * 26; const gr = g.createLinearGradient(x - gw, 0, x + gw, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, `rgba(0,0,0,${0.05 + r() * 0.08})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - gw, h * r() * 0.3, gw * 2, h); }
  const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(255,255,255,.06)'); v.addColorStop(1, 'rgba(0,0,0,.12)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
}
function denim(g, w, h, r, base) {
  fabric(g, w, h, r, base, 2600); g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; for (let i = -h; i < w; i += 4) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.ellipse(w * 0.5, h * 0.45, w * 0.25, h * 0.2, 0, 0, 7); g.fill();
}
function torsoFace(def, face) { // face: front/back/side/top/bottom
  const st = def.shirt_style || (def.hoodie ? 'hoodie' : 'tee'), c = def.shirt || '#3b82f6', c2 = def.shirt2 || shade(c, -0.25);
  return (g, w, h, r) => {
    if (face === 'top') { fabric(g, w, h, r, c); if (st !== 'hoodie' && st !== 'suit') { g.fillStyle = def.skin || '#f1c79f'; g.beginPath(); g.ellipse(w / 2, h * 0.62, w * 0.2, h * 0.28, 0, 0, 7); g.fill(); } return; }
    if (face === 'bottom') { g.fillStyle = def.pants || '#283548'; g.fillRect(0, 0, w, h); return; }
    if (st === 'stripes') { fabric(g, w, h, r, c); g.fillStyle = c2; for (let y = 0; y < h; y += 36) g.fillRect(0, y, w, 16); }
    else if (st === 'suit' || st === 'jacket') fabric(g, w, h, r, c2 === c ? shade(c, -0.2) : (st === 'suit' ? c : c));
    else fabric(g, w, h, r, c);
    const ps = def.pants_style || 'jeans';
    const belt = ps !== 'sweats' && ps !== 'skirt' && st !== 'dress';
    if (face === 'front') {
      if (st === 'tee' || st === 'jersey' || st === 'stripes' || st === 'graphic') { g.strokeStyle = shade(c, -0.3); g.lineWidth = 9; g.beginPath(); g.arc(w / 2, -8, w * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
      if (st === 'hoodie') { g.fillStyle = shade(c, -0.12); rrect(g, w * 0.2, h * 0.58, w * 0.6, h * 0.26, 18); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.stroke(); g.strokeStyle = def.string || '#f2f2f2'; g.lineWidth = 6; [0.42, 0.58].forEach(x => { g.beginPath(); g.moveTo(w * x, h * 0.05); g.lineTo(w * x, h * 0.36); g.stroke(); g.fillStyle = g.strokeStyle; g.fillRect(w * x - 5, h * 0.36, 10, 12); }); g.strokeStyle = shade(c, -0.3); g.lineWidth = 12; g.beginPath(); g.arc(w / 2, -20, w * 0.26, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); }
      if (st === 'button' || st === 'polo') { g.fillStyle = shade(c, 0.25); g.beginPath(); g.moveTo(w * 0.3, 0); g.lineTo(w * 0.5, h * 0.16); g.lineTo(w * 0.42, 0); g.fill(); g.beginPath(); g.moveTo(w * 0.7, 0); g.lineTo(w * 0.5, h * 0.16); g.lineTo(w * 0.58, 0); g.fill(); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(w / 2 - 2, h * 0.14, 4, h); g.fillStyle = shade(c, 0.4); for (let y = 0.22; y < 0.85; y += 0.14) { g.beginPath(); g.arc(w / 2 + 8, h * y, 4, 0, 7); g.fill(); } }
      if (st === 'jacket' || st === 'suit') { const inner = def.inner || (st === 'suit' ? '#f4f4f4' : '#e8e8e8'); g.fillStyle = inner; g.beginPath(); g.moveTo(w * 0.34, 0); g.lineTo(w * 0.66, 0); g.lineTo(w * 0.56, h * 0.62); g.lineTo(w * 0.44, h * 0.62); g.fill(); g.fillStyle = shade(c, -0.15); g.beginPath(); g.moveTo(w * 0.3, 0); g.lineTo(w * 0.44, h * 0.62); g.lineTo(w * 0.36, h * 0.3); g.fill(); g.beginPath(); g.moveTo(w * 0.7, 0); g.lineTo(w * 0.56, h * 0.62); g.lineTo(w * 0.64, h * 0.3); g.fill(); if (st === 'suit') { g.fillStyle = def.tie || '#b3262e'; g.beginPath(); g.moveTo(w * 0.47, h * 0.06); g.lineTo(w * 0.53, h * 0.06); g.lineTo(w * 0.55, h * 0.5); g.lineTo(w * 0.5, h * 0.58); g.lineTo(w * 0.45, h * 0.5); g.fill(); } else { g.fillStyle = '#cfcfcf'; g.fillRect(w * 0.5 - 2, h * 0.62, 4, h); } }
      if (st === 'jersey') { g.fillStyle = def.number_color || '#ffffff'; g.font = `900 ${h * 0.42}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(def.number ?? 8), w / 2, h * 0.58); g.font = `900 ${h * 0.12}px ${FONT}`; g.fillText('★ ★', w / 2, h * 0.25); }
      if (def.shirt_text) { g.fillStyle = def.shirt_text_color || '#ffffff'; g.font = `900 ${h * 0.2}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(def.shirt_text, w / 2, h * 0.45, w * 0.8); }
    }
    if (face === 'back') { if (st === 'hoodie') { g.fillStyle = shade(c, -0.1); rrect(g, w * 0.18, -20, w * 0.64, h * 0.34, 40); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.stroke(); } if (st === 'jersey') { g.fillStyle = def.number_color || '#ffffff'; g.font = `900 ${h * 0.5}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(def.number ?? 8), w / 2, h * 0.5); } }
    if (face === 'side' && st === 'jersey') { g.fillStyle = def.number_color || '#ffffff'; g.fillRect(w * 0.35, 0, w * 0.1, h); g.fillRect(w * 0.55, 0, w * 0.1, h); }
    if (belt) { g.fillStyle = def.belt || '#2b2420'; g.fillRect(0, h * 0.9, w, h * 0.1); if (face === 'front') { g.fillStyle = '#c8a64a'; g.fillRect(w * 0.44, h * 0.905, w * 0.12, h * 0.085); } }
  };
}
function armFace(def, face) {
  const st = def.shirt_style || (def.hoodie ? 'hoodie' : 'tee'), c = def.shirt || '#3b82f6', skin = def.skin || '#f1c79f';
  const sleeve = def.sleeves === false ? 0 : ({ tee: 0.42, jersey: 0.42, stripes: 0.42, graphic: 0.42, polo: 0.38, tank: 0 }[st] ?? 1.0);
  return (g, w, h, r) => {
    if (face === 'bottom') { g.fillStyle = skin; g.fillRect(0, 0, w, h); return; }
    if (face === 'top') { fabric(g, w, h, r, sleeve > 0 ? c : skin); return; }
    fabric(g, w, h, r, skin, 600); g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(0, h * 0.92, w, h * 0.08);
    if (sleeve > 0) {
      const sh = h * sleeve, base = st === 'suit' || st === 'jacket' ? (def.shirt2 && st === 'jacket' ? c : c) : c;
      g.save(); g.beginPath(); g.rect(0, 0, w, sh); g.clip(); fabric(g, w, h, r, base); if (st === 'stripes') { g.fillStyle = def.shirt2 || shade(c, -0.25); for (let y = 0; y < sh; y += 36) g.fillRect(0, y, w, 16); } g.restore();
      g.fillStyle = shade(base, -0.22); g.fillRect(0, sh - 10, w, 10);
      if (st === 'jersey') { g.fillStyle = def.number_color || '#fff'; g.fillRect(0, sh - 30, w, 6); g.fillRect(0, sh - 20, w, 6); }
      if (st === 'suit' || st === 'button') { g.fillStyle = '#f4f4f4'; if (sleeve >= 1) g.fillRect(0, sh - 18, w, 8); }
    }
  };
}
function legFace(def, face, side) {
  const ps = def.pants_style || 'jeans', c = def.pants || (ps === 'jeans' ? '#3f5f8f' : '#283548'), skin = def.skin || '#f1c79f', shoe = def.shoes || '#f2f2f2';
  return (g, w, h, r) => {
    if (face === 'top') { g.fillStyle = c; g.fillRect(0, 0, w, h); return; }
    if (face === 'bottom') { g.fillStyle = def.sole || '#e8e8e8'; g.fillRect(0, 0, w, h); return; }
    if (ps === 'jeans') denim(g, w, h, r, c); else fabric(g, w, h, r, c);
    if (ps === 'shorts') { fabric(g, w, h, r, skin, 500); g.save(); g.beginPath(); g.rect(0, 0, w, h * 0.45); g.clip(); ps === 'shorts' && fabric(g, w, h, r, c); g.restore(); g.fillStyle = shade(c, -0.2); g.fillRect(0, h * 0.43, w, 8); }
    if (ps === 'skirt') { fabric(g, w, h, r, skin, 500); g.save(); g.beginPath(); g.rect(0, 0, w, h * 0.5); g.clip(); fabric(g, w, h, r, c); g.restore(); }
    if (ps === 'sweats' && face === 'side') { g.fillStyle = def.stripe || '#ffffff'; g.fillRect(w * 0.4, 0, w * 0.2, h * 0.86); }
    if (ps === 'jeans') { g.strokeStyle = 'rgba(230,180,80,.5)'; g.lineWidth = 2; g.setLineDash([5, 4]); if (face === 'side') { g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); } if (face === 'front') { g.beginPath(); g.moveTo(side > 0 ? 0 : w, h * 0.04); g.quadraticCurveTo(w * 0.5, h * 0.06, side > 0 ? w * 0.15 : w * 0.85, h * 0.2); g.stroke(); } g.setLineDash([]); g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, h * 0.8, w, h * 0.04); }
    if (ps === 'pants' && face === 'front') { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(w / 2 - 1, 0, 2, h); }
    // shoes
    const sh = h * (def.boots ? 0.26 : 0.14); g.fillStyle = shoe; g.fillRect(0, h - sh, w, sh); g.fillStyle = def.sole || '#ffffff'; g.fillRect(0, h - h * 0.035, w, h * 0.035);
    if (!def.boots && face === 'front') { g.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 3; i++) g.fillRect(w * 0.32, h - sh + 6 + i * 7, w * 0.36, 2); }
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, h - sh, w, 3);
  };
}
function boxMats(key, painter, faces, sz = 256) { // order: +x,-x,+y,-y,+z,-z
  return faces.map((f, i) => mat('#ffffff', { map: tex(key + '|' + f + i, sz, sz, painter(f, i)), roughness: 0.85 }));
}

// ---------- faces ----------
const FW = 384, FH = 192;
function drawFace(g, def, expr, mouth, blink) {
  g.clearRect(0, 0, FW, FH);
  const ink = '#1d1d22', ex = [150, 234], ey = 84, eyes = def.eyes || 'classic';
  const brow = { neutral: [0, 0], happy: [0, -4], grin: [0, -6], sad: [14, -6], cry: [18, -8], worried: [14, -4], angry: [-16, 8], determined: [-10, 5], shock: [0, -12], smug: [-4, 4] }[expr] || [0, 0];
  if (def.blush) { g.fillStyle = 'rgba(255,120,130,.35)'; [112, 272].forEach(x => { g.beginPath(); g.ellipse(x, 120, 20, 10, 0, 0, 7); g.fill(); }); }
  g.fillStyle = def.brow_color || ink;
  ex.forEach((x, i) => { const s = i === 0 ? 1 : -1; g.save(); g.translate(x, ey - 36 + brow[1]); g.rotate(-s * brow[0] * D2R); rrect(g, -18, -3.5, 36, 7, 3.5); g.fill(); g.restore(); });
  ex.forEach((x) => {
    if (blink === 2 || blink === true) { g.fillStyle = ink; rrect(g, x - 14, ey - 2, 28, 5, 2.5); g.fill(); return; }
    if (blink === 1) { g.fillStyle = ink; g.beginPath(); g.ellipse(x, ey + 3, eyes === 'round' ? 20 : 10, eyes === 'round' ? 9 : 7, 0, 0, Math.PI); g.fill(); g.fillRect(x - (eyes === 'round' ? 20 : 10), ey + 1, (eyes === 'round' ? 40 : 20), 3); return; }
    const big = expr === 'shock' ? 1.25 : 1;
    if (eyes === 'round') { g.fillStyle = '#fbfbfb'; g.beginPath(); g.ellipse(x, ey, 22 * big, 22 * big, 0, 0, 7); g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke(); g.fillStyle = ink; g.beginPath(); g.arc(x + 2, ey + 2, (expr === 'shock' ? 7 : 11), 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 6, ey - 3, 3.5, 0, 7); g.fill(); }
    else if (eyes === 'dot') { g.fillStyle = ink; g.beginPath(); g.arc(x, ey, 8 * big, 0, 7); g.fill(); }
    else { g.fillStyle = ink; g.beginPath(); g.ellipse(x, ey, 10 * big, 16 * big, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + 3, ey - 6, 3.5, 5, 0, 0, 7); g.fill(); }
  });
  if (def.glasses) { g.strokeStyle = def.glasses === true ? '#222' : def.glasses; g.lineWidth = 5; ex.forEach(x => { g.beginPath(); g.arc(x, ey, 27, 0, 7); g.stroke(); }); g.beginPath(); g.moveTo(ex[0] + 27, ey); g.lineTo(ex[1] - 27, ey); g.stroke(); }
  if ((expr === 'sad' || expr === 'cry') && !blink) { g.fillStyle = 'rgba(110,180,255,.9)'; ex.forEach(x => { rrect(g, x - 5, ey + 16, 10, expr === 'cry' ? 80 : 20, 5); g.fill(); }); }
  const my = 138, mx = 192; g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 6; g.lineCap = 'round';
  if (mouth > 0) { const h = mouth === 1 ? 12 : 22; rrect(g, mx - 18, my - h / 2, 36, h, 7); g.fill(); if (mouth === 2) { g.fillStyle = '#c4505c'; rrect(g, mx - 10, my + 1, 20, 6, 3); g.fill(); } }
  else if (expr === 'grin') { g.beginPath(); g.moveTo(mx - 30, my - 10); g.quadraticCurveTo(mx, my + 30, mx + 30, my - 10); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.fillRect(mx - 22, my - 8, 44, 7); }
  else if (expr === 'happy' || expr === 'smug') { g.beginPath(); g.arc(mx + (expr === 'smug' ? 8 : 0), my - 18, 22, 0.22 * Math.PI, 0.78 * Math.PI); g.stroke(); }
  else if (expr === 'sad' || expr === 'worried') { g.beginPath(); g.arc(mx, my + 18, 18, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke(); }
  else if (expr === 'cry') { rrect(g, mx - 20, my - 8, 40, 22, 10); g.fill(); }
  else if (expr === 'shock') { g.beginPath(); g.ellipse(mx, my, 10, 14, 0, 0, 7); g.fill(); }
  else if (expr === 'angry' || expr === 'determined') { g.fillRect(mx - 18, my - 2, 36, 5); }
  else { g.beginPath(); g.arc(mx, my - 26, 26, 0.35 * Math.PI, 0.65 * Math.PI); g.stroke(); }
  if (def.face_text) { g.fillStyle = def.face_text_color || ink; g.font = `900 30px ${FONT}`; g.textAlign = 'center'; g.fillText(def.face_text, 300, 130); }
}

// ---------- characters (R6: torso 2x2x1, limbs 1x2x1, round head) ----------
const S = 0.6; // metres per stud
let HEADGEO;
function headGeo() {
  if (HEADGEO) return HEADGEO;
  const r = 0.37, h = 0.74, c = 0.15, pts = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI / 2; pts.push(new THREE.Vector2(r - c + Math.cos(a) * c, c + Math.sin(a) * c)); }
  for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; pts.push(new THREE.Vector2(r - c + Math.cos(a) * c, h - c + Math.sin(a) * c)); }
  pts.push(new THREE.Vector2(0, h)); return (HEADGEO = new THREE.LatheGeometry(pts, 40));
}
let CAPGEO;
function capGeo() { // hair shell that hugs the round-cylinder head (offset outward), upper part only
  if (CAPGEO) return CAPGEO;
  const r = 0.37 + 0.035, h = 0.74 + 0.035, c = 0.17, pts = [];
  pts.push(new THREE.Vector2(r, 0.30));
  for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI / 2; pts.push(new THREE.Vector2(r - c + Math.cos(a) * c, h - c + Math.sin(a) * c)); }
  pts.push(new THREE.Vector2(0, h));
  const g = new THREE.LatheGeometry(pts, 48), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), f = Math.max(0, z / Math.hypot(x, z || 1e-6)); const ymin = 0.30 + 0.29 * Math.pow(f, 1.6); if (y < ymin) pos.setY(i, ymin); }
  g.computeVertexNormals(); g.translate(0, -0.37, 0); return (CAPGEO = g);
}
function ellipsoid(rx, ry, rz, m) { const s = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), m); s.scale.set(rx, ry, rz); s.castShadow = true; return s; }
function hair(def) {
  const g = new THREE.Group(), st = def.hair || 'short'; if (st === 'none' || st === 'bald') return g;
  const c = def.hair_color || '#3a2618';
  const hm = mat('#ffffff', { map: tex('hair' + c, 128, 128, (q, w, h, r) => { speckle(q, w, h, r, c, 400, 0.12, 2); q.lineWidth = 2; for (let i = 0; i < 70; i++) { const x = r() * w; q.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.18)'; q.beginPath(); q.moveTo(x, 0); q.quadraticCurveTo(x + (r() - 0.5) * 20, h / 2, x + (r() - 0.5) * 10, h); q.stroke(); } }), roughness: 0.5 });
  const R0 = 0.395, cy = 0.37;
  if (st === 'cap' || st === 'beanie' || st === 'tophat') {
    const cc = def.hat_color || def.cap_color || '#c0392b', cm = mat(cc, { roughness: 0.8 });
    if (st === 'tophat') { const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 32), cm); brim.position.y = 0.7; const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.55, 32), cm); top.position.y = 0.98; [brim, top].forEach(m => { m.castShadow = true; g.add(m); }); const fringe = new THREE.Mesh(capGeo(), hm); fringe.position.y = cy - 0.05; g.add(fringe); return g; }
    const dome = new THREE.Mesh(capGeo(), cm); dome.position.y = cy; dome.scale.setScalar(st === 'beanie' ? 1.06 : 1.03); dome.castShadow = true; g.add(dome);
    if (st === 'cap') { const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.035, 24, 1, false, -Math.PI / 2, Math.PI), cm); brim.position.set(0, cy + 0.27, 0.27); brim.rotation.x = 0.1; brim.castShadow = true; g.add(brim); }
    else { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.12, 28), mat(shade(cc, -0.15))); band.position.y = cy + 0.1; g.add(band); }
    return g;
  }
  const cap = new THREE.Mesh(capGeo(), hm); cap.position.y = cy; cap.castShadow = true; g.add(cap);
  const backH = { long: 0.0, bob: 0.0, ponytail: 0.25, bun: 0.25, curly: 0.25, afro: 0.25 }[st] ?? 0.2;
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.405, 0.405, 0.42 - backH * 0.4, 32, 1, true, Math.PI * 0.55, Math.PI * 0.9), hm); back.material.side = THREE.DoubleSide; back.position.y = cy - 0.02 + backH * 0.2; back.castShadow = true; g.add(back);
  const r = prng(hcode(JSON.stringify(def)));
  const clump = (n, rx, ry, rz, yb, spread, tilt) => { for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, rad = spread * (0.5 + r() * 0.5); const e = ellipsoid(rx * (0.8 + r() * 0.4), ry * (0.8 + r() * 0.4), rz * (0.8 + r() * 0.4), hm); e.position.set(Math.sin(a) * rad, yb + r() * 0.05, Math.cos(a) * rad - 0.04); e.rotation.set((r() - 0.5) * tilt - 0.3, a, (r() - 0.5) * tilt); g.add(e); } };
  if (st === 'short') clump(6, 0.16, 0.08, 0.2, cy + 0.33, 0.14, 0.6);
  if (st === 'messy' || st === 'fluffy') { clump(14, 0.17, 0.09, 0.24, cy + 0.3, 0.22, 1.2); for (let i = -2; i <= 2; i++) { const e = ellipsoid(0.09, 0.05, 0.16, hm); e.position.set(i * 0.12, cy + 0.26 - Math.abs(i) * 0.02, 0.33); e.rotation.x = 0.9; g.add(e); } }
  if (st === 'spiky') for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2, k = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), hm); k.position.set(Math.sin(a) * 0.2, cy + 0.36, Math.cos(a) * 0.2 - 0.05); k.rotation.set(Math.cos(a) * 0.7 - 0.2, 0, -Math.sin(a) * 0.7); k.castShadow = true; g.add(k); }
  if (st === 'curly' || st === 'afro') { const big = st === 'afro'; for (let i = 0; i < (big ? 26 : 16); i++) { const a = r() * Math.PI * 2, b = r() * (big ? 1.4 : 1.1); const s = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.14 : 0.1, 10, 8), hm); s.position.set(Math.sin(a) * Math.sin(b) * (big ? 0.46 : 0.36), cy + Math.cos(b) * (big ? 0.42 : 0.33) + 0.05, Math.cos(a) * Math.sin(b) * (big ? 0.46 : 0.36) - 0.05); s.castShadow = true; g.add(s); } }
  if (st === 'long' || st === 'bob') { const len = st === 'long' ? 0.85 : 0.42; const back = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.43, len, 28, 1, true, Math.PI * 0.62, Math.PI * 0.76), hm); back.material.side = THREE.DoubleSide; back.position.y = cy + 0.1 - len / 2; back.castShadow = true; g.add(back); for (let i = -2; i <= 2; i++) { const e = ellipsoid(0.1, 0.05, 0.15, hm); e.position.set(i * 0.12, cy + 0.27, 0.32); e.rotation.x = 1.0; g.add(e); } }
  if (st === 'ponytail') { const tie = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), hm); tie.position.set(0, cy + 0.15, -0.42); g.add(tie); const tail = ellipsoid(0.1, 0.3, 0.1, hm); tail.position.set(0, cy - 0.15, -0.48); tail.rotation.x = 0.2; g.add(tail); }
  if (st === 'bun') { const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), hm); b.position.set(0, cy + 0.42, -0.12); b.castShadow = true; g.add(b); }
  return g;
}
function makeActor(id, def, isNpc = false) {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const hips = new THREE.Group(); hips.position.y = 2 * S; root.add(hips);
  const key = 'c' + hcode(JSON.stringify(def)), sz = isNpc ? 128 : 256;
  const tm = boxMats(key + 't', (f) => torsoFace(def, f === 0 || f === 1 ? 'side' : f === 2 ? 'top' : f === 3 ? 'bottom' : f === 4 ? 'front' : 'back'), [0, 1, 2, 3, 4, 5], sz);
  const torso = box(2 * S, 2 * S, 1 * S, tm, 0.03, 2); torso.position.y = S; hips.add(torso);
  const head = new THREE.Group(); head.position.y = 2 * S; hips.add(head);
  const skin = mat(def.skin || '#f1c79f', { roughness: 0.6 });
  const skull = new THREE.Mesh(headGeo(), skin); skull.castShadow = skull.receiveShadow = true; head.add(skull);
  const faceC = document.createElement('canvas'); faceC.width = FW; faceC.height = FH;
  const faceT = new THREE.CanvasTexture(faceC); faceT.colorSpace = SRGB; faceT.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.3745, 0.3745, 0.5, 28, 1, true, -75 * D2R, 150 * D2R), new THREE.MeshStandardMaterial({ map: faceT, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  face.position.y = 0.37; head.add(face); head.add(hair(def));
  const limb = (x, y, px, mats) => { const g = new THREE.Group(); g.position.set(x, y, 0); const m = box(S, 2 * S, S, mats, 0.03, 2); m.position.y = px; g.add(m); hips.add(g); return g; };
  const am = boxMats(key + 'a', (f) => armFace(def, f === 2 ? 'top' : f === 3 ? 'bottom' : 'side'), [0, 1, 2, 3, 4, 5], sz / 2);
  const armL = limb(1.5 * S, 1.5 * S, -0.5 * S, am), armR = limb(-1.5 * S, 1.5 * S, -0.5 * S, am);
  const lmL = boxMats(key + 'lL', (f) => legFace(def, f === 2 ? 'top' : f === 3 ? 'bottom' : f === 4 ? 'front' : f === 5 ? 'back' : 'side', 1), [0, 1, 2, 3, 4, 5], sz / 2);
  const lmR = boxMats(key + 'lR', (f) => legFace(def, f === 2 ? 'top' : f === 3 ? 'bottom' : f === 4 ? 'front' : f === 5 ? 'back' : 'side', -1), [0, 1, 2, 3, 4, 5], sz / 2);
  const legL = limb(0.5 * S, 0, -S, lmL), legR = limb(-0.5 * S, 0, -S, lmR);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.2), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.55 })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.renderOrder = 1; root.add(blob);
  root.scale.setScalar(def.scale || 1); scene.add(root);
  return { id, def, root, hips, head, armL, armR, legL, legR, faceC, faceT, faceKey: '', tag: null, tagKey: '', blob };
}
let _blob; function blobTex() { return _blob || (_blob = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 31); r.addColorStop(0, 'rgba(0,0,0,.65)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); })); }
function tagSprite(text, color) {
  const t = canvasTex(512, 160, (g, w, h) => { g.fillStyle = 'rgba(16,24,30,.9)'; rrect(g, 8, 8, w - 16, h - 16, 34); g.fill(); g.strokeStyle = color || '#3ef0a8'; g.lineWidth = 8; rrect(g, 8, 8, w - 16, h - 16, 34); g.stroke(); fitText(g, text, w, h * 0.92, color || '#3ef0a8'); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t })); s.scale.set(1.3, 0.4, 1); return s;
}

// ---------- NPCs ----------
const SKINS = ['#f3d2b3', '#e9b98f', '#d79e72', '#b97a4f', '#8d5a3b', '#5e3b26', '#f1c79f'];
const HAIRC = ['#1b1410', '#3a2618', '#6b4426', '#a8743c', '#d9b26a', '#8c2f1c', '#2b2b2b', '#e8e2d0'];
const CLOTH = ['#d94b3d', '#2f6fb3', '#2e8b57', '#f2c230', '#7d4fb3', '#f08a24', '#1f2937', '#e5e7eb', '#0f766e', '#be185d', '#9a3412', '#334155'];
function randomDef(r) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  return { skin: pick(SKINS), hair: pick(['short', 'messy', 'long', 'ponytail', 'curly', 'spiky', 'bun', 'cap', 'bob', 'short', 'messy']), hair_color: pick(HAIRC), hat_color: pick(CLOTH),
    shirt_style: pick(['tee', 'tee', 'hoodie', 'button', 'jacket', 'stripes', 'polo', 'jersey']), shirt: pick(CLOTH), shirt2: pick(CLOTH), number: Math.floor(r() * 99),
    pants_style: pick(['jeans', 'jeans', 'pants', 'sweats', 'shorts']), pants: pick(['#3f5f8f', '#2a3550', '#1f2937', '#6b5b45', '#4b5563', '#3f5f8f']), shoes: pick(['#f2f2f2', '#1f1f1f', '#8b5a2b', '#dc2626']),
    eyes: r() > 0.75 ? 'round' : 'classic', scale: r() > 0.85 ? 0.82 : 1 };
}
const NPCPOOL = (() => { const r = prng(4242); return Array.from({ length: 28 }, () => randomDef(r)); })(); // fixed extras: textures painted once, reused across shots
function spawnNpcs(s, setName) {
  const n = s.crowd !== undefined ? s.crowd : ({ street: 12, school: 14, city: 18, park: 10, plaza: 40, square: 40 }[setName] || 0); if (!n) return;
  const r = prng(SEED * 977 + 13), avoid = (s.cast || []).map(c => pathPts(c)[0]);
  const free = (x, z) => avoid.every(p => Math.hypot(p.x - x, p.z - z) > 3.2);
  for (let i = 0; i < n; i++) {
    const def = NPCPOOL[(Math.floor(r() * 997) + i * 7) % NPCPOOL.length]; let spec;
    for (let tries = 0; tries < 12; tries++) {
      const kind = r();
      if (s.gather) { // audience packed around a focal point, facing it: [x, z, minR, maxR, dirDeg, arcDeg]
        const [gx, gz, r0 = 5, r1 = 24, dd = 0, arc = 150] = s.gather, a2 = (dd + (r() - 0.5) * arc) * D2R, d = Math.sqrt(lerp(r0 * r0, r1 * r1, r())), x = gx + Math.sin(a2) * d, z = gz + Math.cos(a2) * d;
        spec = { pos: [x, z], face: Math.atan2(gx - x, gz - z) / D2R + (r() - 0.5) * 30, cheer: r() < (s.cheer !== undefined ? s.cheer : 0.3) };
        if (Math.hypot(x, z + 12) < 6.5 || npcs.some(o => o.spec.pos && Math.hypot(o.spec.pos[0] - x, o.spec.pos[1] - z) < 1.5)) continue;
      }
      else if (setName === 'plaza' || setName === 'square') { const x = (r() - 0.5) * 70, z = (r() - 0.5) * 70, a2 = r() * Math.PI * 2, v = 0.8 + r() * 0.6; spec = kind < 0.55 ? { walk: [x, z, Math.sin(a2) * v, Math.cos(a2) * v] } : { pos: [x, z], face: r() * 360 }; if (Math.hypot(x, z + 12) < 6) continue; }
      else if (setName === 'city') { const sd = r() > 0.5 ? 1 : -1, x = sd * (6.4 + r() * 2), z = (avoid[0] ? avoid[0].z : 0) + (r() - 0.5) * (i < n * 0.6 ? 26 : 80), dir = r() > 0.5 ? 1 : -1; spec = kind < 0.75 ? { walk: [x, z, 0, dir * (1.1 + r() * 0.5)] } : { pos: [x, z], face: r() * 360 }; }
      else if (setName === 'park') { const x = (avoid[0] ? avoid[0].x : 0) + (r() - 0.5) * (i < n * 0.6 ? 24 : 70), z = (r() - 0.5) * 2.4 - 1, dir = r() > 0.5 ? 1 : -1; spec = kind < 0.7 ? { walk: [x, z, dir * (1 + r() * 0.5), 0] } : { pos: [(r() - 0.5) * 30, -6 - r() * 10], face: r() * 360 }; }
      else { const cx = avoid[0] ? avoid[0].x : 0, near = i < n * 0.6, x = cx + (r() - 0.5) * (near ? 22 : 90), dir = r() > 0.5 ? 1 : -1, z = -6.0 + (r() - 0.5) * 1.8; spec = kind < 0.6 ? { walk: [x - dir * 2, z, dir * (0.9 + r() * 0.5), 0] } : { pos: [x, kind < 0.8 ? z : -9.6 - r() * 2.2], face: (r() - 0.5) * 140 }; }
      const p = spec.walk || spec.pos; if (free(p[0], p[1]) && (!spec.walk || Math.abs(p[0] - (avoid[0] ? avoid[0].x : 0)) > 4)) break;
    }
    const a = makeActor('npc' + i, def, true); npcs.push({ a, spec, ph: r() * 10 });
  }
}
function stepNpcs(t) {
  for (const n of npcs) {
    const a = n.a, s = n.spec; let x, z, face, moving = false;
    if (s.walk) { const [x0, z0, vx, vz] = s.walk; x = x0 + vx * t; z = z0 + vz * t; face = Math.atan2(vx, vz); moving = true; }
    else { [x, z] = s.pos; face = (s.face || 0) * D2R; }
    a.root.position.set(x, 0, z); a.root.rotation.set(0, face, 0);
    const tt = t + n.ph, spd = s.walk ? Math.hypot(s.walk[2], s.walk[3]) : 0, ph = spd * tt * 5.6, sw = moving ? Math.sin(ph) * 0.5 : 0, sw2 = moving ? Math.sin(ph - 0.25) * 0.5 : 0;
    a.legL.rotation.set(sw, 0, 0); a.legR.rotation.set(-sw, 0, 0); a.armL.rotation.set(-sw2 * 0.8, 0, 0.05); a.armR.rotation.set(sw2 * 0.8, 0, -0.05);
    a.hips.rotation.set(0, moving ? Math.sin(ph) * 0.05 : 0, 0); a.hips.position.y = 2 * S + (moving ? Math.abs(Math.cos(ph)) * 0.045 : Math.sin(tt * 1.6) * 0.008);
    if (s.cheer) { const b = 0.5 + 0.5 * Math.sin(tt * 4.6); a.armL.rotation.set(0, 0, 2.35 + 0.2 * b); a.armR.rotation.set(0, 0, -2.35 - 0.2 * b); a.hips.position.y += b * 0.16; a.head.rotation.x = -0.1; }
    else if (!moving) { a.head.rotation.y = Math.sin(tt * 0.4) * 0.25; a.armR.rotation.x = -0.25 * (0.5 + 0.5 * Math.sin(tt * 0.9)); }
    const key = 'neutral0' + ((tt % 3.7) > 3.55);
    if (a.faceKey !== key) { drawFace(a.faceC.getContext('2d'), a.def, (n.ph > 5 ? 'happy' : 'neutral'), 0, (tt % 3.7) > 3.55); a.faceT.needsUpdate = true; a.faceKey = key; }
  }
  for (const c of cars) { const x = c.x0 + c.v * t; c.o.position.x = ((x + 150) % 300 + 300) % 300 - 150; if (c.axis === 'z') { c.o.position.x = c.lane; c.o.position.z = ((c.x0 + c.v * t + 150) % 300 + 300) % 300 - 150; } }
}

// ---------- props ----------
let SET_SIDING;
function house(i, flip) {
  const g = new THREE.Group(), r = prng(i * 31 + 7);
  const W = 8 + r() * 2.5, two = r() > 0.45, Hh = two ? 6.2 : 3.6, Dp = 7;
  const cols = ['#e9e2d3', '#c8d6e5', '#f2d0a4', '#d6e4c3', '#e8c4c4', '#bfc9d9', '#f5f0e1', '#d9c2a3'];
  const col = cols[Math.floor(r() * cols.length)], useBrick = r() > 0.7;
  const wallM = useBrick ? tmat('brick' + col, 256, 256, brick(shade('#b5523b', (r() - 0.5) * 0.2)), W / 3, Hh / 2.4) : tmat('siding' + col, 256, 256, siding(col), W / 3, Hh / 2.4);
  const body = box(W, Hh, Dp, wallM, 0.02, 1); body.position.y = Hh / 2; g.add(body);
  const roofC = ['#5b4033', '#7a3b2e', '#3c4a5c', '#4a4a4a', '#6b2f2a'][Math.floor(r() * 5)], rm = tmat('roof' + roofC, 256, 256, roof(roofC), W / 2, 2);
  [-1, 1].forEach(s => { const rr = box(W + 1, 0.22, Dp * 0.62, rm, 0.02, 1); rr.position.set(0, Hh + 1.15, s * Dp * 0.24); rr.rotation.x = s * 0.62; g.add(rr); });
  const gableShape = new THREE.Shape([new THREE.Vector2(-Dp / 2, 0), new THREE.Vector2(Dp / 2, 0), new THREE.Vector2(0, 2.3)]);
  [-1, 1].forEach(s => { const gb = new THREE.Mesh(new THREE.ShapeGeometry(gableShape), wallM); gb.rotation.y = s * Math.PI / 2; gb.position.set(s * W / 2, Hh, 0); g.add(gb); });
  const curtain = ['#e8d9b0', '#c9e1d6', '#f2c4c4', null][Math.floor(r() * 4)];
  const winM = tmat('win' + curtain, 128, 128, windowPaint(false, curtain), 1, 1, { roughness: 0.25 });
  const floors = two ? [1.7, 4.6] : [1.8];
  floors.forEach((fy, fi) => [-W / 3.3, W / 3.3, ...(fi && W > 9 ? [0] : [])].forEach(wx => { if (!fi && Math.abs(wx) < 0.1) return; const w = box(1.4, 1.4, 0.08, winM, 0); w.position.set(wx, fy, Dp / 2 + 0.03); g.add(w); const sill = box(1.6, 0.1, 0.25, '#f5f2ea', 0.01); sill.position.set(wx, fy - 0.75, Dp / 2 + 0.1); g.add(sill); }));
  const dcol = ['#8b2f2f', '#2f4f8b', '#5a3a22', '#2e6b4f', '#1f2937'][Math.floor(r() * 5)];
  const door = box(1.2, 2.2, 0.1, tmat('door' + dcol, 128, 256, doorPaint(dcol), 1, 1), 0); door.position.set(0, 1.1, Dp / 2 + 0.04); g.add(door);
  const step = box(2, 0.2, 1, tmat('slab', 128, 128, P.slab, 1, 0.5), 0.02, 1); step.position.set(0, 0.1, Dp / 2 + 0.5); g.add(step);
  if (r() > 0.5) { const porch = box(W * 0.5, 0.15, 1.6, '#f5f2ea', 0.02); porch.position.set(0, 3.0, Dp / 2 + 0.8); g.add(porch); [-1, 1].forEach(s => { const p = box(0.15, 3, 0.15, '#f5f2ea', 0.01); p.position.set(s * W * 0.22, 1.5, Dp / 2 + 1.5); g.add(p); }); }
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + r() * 0.3, 1), mat(['#3f7f3a', '#4b8f45', '#356e33'][k % 3], { flatShading: true })); b.position.set(-W / 2 + 1 + k * (W - 2) / 2 + (r() - 0.5), 0.45, Dp / 2 + 0.7); b.castShadow = true; g.add(b); }
  g.userData.W = W; return g;
}
function tree(kind, i, sc = 1) {
  const g = new THREE.Group(), r = prng(i * 17 + 3); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.6, 8), mat('#6b4a2f')); tr.position.y = 1.3; tr.castShadow = true; g.add(tr);
  const lc = ['#2f7d36', '#3c8f43', '#2a6e31', '#4f9a45'][Math.floor(r() * 4)];
  if (kind === 'pine') for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.9 - k * 0.38, 1.9, 8), mat(shade('#2e6b3a', (r() - 0.5) * 0.1), { flatShading: true })); c.position.y = 2.6 + k * 1.05; c.castShadow = true; g.add(c); }
  else for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 + r() * 0.5, 1), mat(shade(lc, (r() - 0.5) * 0.12), { flatShading: true })); b.position.set((r() - 0.5) * 1.4, 3.3 + r() * 1.3, (r() - 0.5) * 1.4); b.castShadow = true; g.add(b); }
  g.scale.setScalar(sc * (0.85 + r() * 0.35)); return g;
}
function lamp() { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 5, 8), mat('#2f3338', { roughness: 0.4, metalness: 0.5 })); p.position.y = 2.5; p.castShadow = true; g.add(p); const arm = box(1.1, 0.1, 0.1, '#2f3338', 0.02); arm.position.set(0.5, 4.95, 0); g.add(arm); const bulb = box(0.5, 0.16, 0.36, mat('#fff3c4', { emissive: '#ffdf8a', emissiveIntensity: 1.2 }), 0.04); bulb.position.set(1.0, 4.86, 0); g.add(bulb); return g; }
function hydrant() { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10), mat('#c9302c', { roughness: 0.5 })); b.position.y = 0.35; const t = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, 7, 0, 1.6), b.material); t.position.y = 0.7; [b, t].forEach(m => { m.castShadow = true; g.add(m); }); return g; }
function mailbox() { const g = new THREE.Group(); const p = box(0.1, 1.1, 0.1, '#5a4632', 0.01); p.position.y = 0.55; const bx = box(0.3, 0.3, 0.55, '#2f3a4a', 0.12); bx.position.y = 1.2; g.add(p, bx); return g; }
function bin() { const b = box(0.6, 0.95, 0.6, ['#2e6b4f', '#37474f', '#1e40af'][Math.floor(Math.random() * 0) || 0], 0.06); b.position.y = 0.48; const g = new THREE.Group(); g.add(b); return g; }
function fence(len) { const g = new THREE.Group(), m = mat('#f5f2ea'); for (let x = -len / 2; x <= len / 2; x += 0.5) { const p = box(0.12, 1.0, 0.06, m, 0.01); p.position.set(x, 0.5, 0); g.add(p); } [0.3, 0.75].forEach(y => { const r = box(len, 0.08, 0.05, m, 0.01); r.position.set(0, y, -0.05); g.add(r); }); return g; }
function car(color, i = 0) {
  const g = new THREE.Group(), cm = mat(color || '#d9483b', { roughness: 0.3, metalness: 0.3 }), gm = mat('#1e2a36', { roughness: 0.1, metalness: 0.6 });
  const b = box(4.4, 0.9, 2.0, cm, 0.3, 3); b.position.y = 0.85; const top = box(2.5, 0.85, 1.8, cm, 0.3, 3); top.position.set(-0.2, 1.65, 0); const gl = box(2.3, 0.62, 1.84, gm, 0.22, 3); gl.position.set(-0.2, 1.68, 0);
  g.add(b, top, gl); [[1.4, 1], [-1.4, 1], [1.4, -1], [-1.4, -1]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16), mat('#1b1b1b')); w.rotation.x = Math.PI / 2; w.position.set(x, 0.42, z * 0.98); w.castShadow = true; g.add(w); });
  [1, -1].forEach(z => { const l = box(0.06, 0.18, 0.4, mat('#fff8d0', { emissive: '#fff2b0', emissiveIntensity: 0.6 }), 0.02); l.position.set(2.2, 0.95, z * 0.65); g.add(l); const t = box(0.06, 0.18, 0.4, mat('#b91c1c', { emissive: '#7f1d1d' }), 0.02); t.position.set(-2.2, 0.95, z * 0.65); g.add(t); });
  g.traverse(m => { if (m.isMesh) m.castShadow = true; }); return g;
}
function bench() { const g = new THREE.Group(), wm = tmat('wood', 256, 256, P.wood, 1, 0.4); const s = box(3, 0.12, 0.9, wm, 0.02); s.position.y = 0.92; const b = box(3, 0.7, 0.1, wm, 0.02); b.position.set(0, 1.4, -0.42); g.add(s, b); [-1.3, 1.3].forEach(x => { const l = box(0.1, 0.9, 0.8, '#2b2b2b', 0.02); l.position.set(x, 0.45, 0); g.add(l); }); return g; }
function signProp(p) {
  const g = new THREE.Group(); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), mat('#9aa0a6', { metalness: 0.5, roughness: 0.4 })); post.position.y = 1.6; post.castShadow = true; g.add(post);
  const [w, h] = p.size || [3.2, 2.1];
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [mat('#ddd'), mat('#ddd'), mat('#ddd'), mat('#ddd'), new THREE.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(768, Math.round(768 * h / w), (g2, cw, ch) => { g2.fillStyle = p.bg || '#f4efe6'; g2.fillRect(0, 0, cw, ch); g2.strokeStyle = p.border || '#e5391f'; g2.lineWidth = 24; g2.strokeRect(18, 18, cw - 36, ch - 36); fitText(g2, p.text || 'SIGN', cw * 0.92, ch * 0.8, p.color || '#e5391f'); }) }), mat('#bbb')]);
  board.castShadow = true; board.position.y = 3.0 + h / 2 - 0.4; g.add(board); return g;
}
function makeProp(p) {
  const t = p.type; let o;
  if (t === 'sign') o = signProp(p); else if (t === 'bench') o = bench(); else if (t === 'car') o = car(p.color);
  else if (t === 'tree') o = tree(p.kind || 'round', p.seed || 3, p.scale || 1); else if (t === 'lamp') o = lamp();
  else if (t === 'house') o = house(p.seed || 1); else if (t === 'hydrant') o = hydrant(); else if (t === 'mailbox') o = mailbox(); else if (t === 'fence') o = fence(p.length || 4);
  else if (t === 'bed') { o = new THREE.Group(); const f = box(2.4, 0.6, 4.2, tmat('wood', 256, 256, P.wood, 1, 1), 0.04); f.position.y = 0.3; const m = box(2.2, 0.35, 4, '#f3f3f3', 0.1); m.position.y = 0.75; const bl = box(2.26, 0.2, 2.6, p.color || '#5b7fd6', 0.08); bl.position.set(0, 0.95, 0.7); const pl = box(1.4, 0.25, 0.7, '#ffffff', 0.12); pl.position.set(0, 1.0, -1.5); o.add(f, m, bl, pl); }
  else if (t === 'table' || t === 'desk') { o = new THREE.Group(); const wm = tmat('wood', 256, 256, P.wood, 1, 1); const top = box(p.size ? p.size[0] : 2.4, 0.12, p.size ? p.size[1] : 1.2, wm, 0.02); top.position.y = 1.5; o.add(top); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const l = box(0.1, 1.5, 0.1, wm, 0.01); l.position.set(a * ((p.size ? p.size[0] : 2.4) / 2 - 0.15), 0.75, b * ((p.size ? p.size[1] : 1.2) / 2 - 0.15)); o.add(l); }); }
  else if (t === 'box') { const [w, h, d] = p.size || [1, 1, 1]; o = new THREE.Group(); const b = box(w, h, d, p.color || '#c08a4a', 0.04); b.position.y = h / 2; o.add(b); }
  else if (t === 'cake') { o = new THREE.Group(); const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.5, 32), mat(p.color || '#f4c2d7', { roughness: 0.6 })); c1.position.y = 1.8; const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.08, 32), mat('#ffffff')); c2.position.y = 2.06; o.add(c1, c2); for (let i = 0; i < (p.candles || 5); i++) { const a = i / (p.candles || 5) * 6.283, cd = box(0.06, 0.3, 0.06, ['#7dd3fc', '#fde047', '#86efac', '#f9a8d4'][i % 4], 0.01); cd.position.set(Math.cos(a) * 0.5, 2.25, Math.sin(a) * 0.5); o.add(cd); } }
  else if (t === 'panel') { const [w, h] = p.size || [4, 1.4]; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(1024, Math.round(1024 * h / w), (g, cw, ch) => { g.fillStyle = p.bg || 'rgba(20,24,40,.9)'; rrect(g, 6, 6, cw - 12, ch - 12, 40); g.fill(); g.strokeStyle = p.border || '#3ef0a8'; g.lineWidth = 10; rrect(g, 6, 6, cw - 12, ch - 12, 40); g.stroke(); fitText(g, p.text || '', cw * 0.9, ch * 0.75, p.color || '#ffffff'); }) })); s.scale.set(w, h, 1); s.position.y = p.y || 4; o = new THREE.Group(); o.add(s); }
  else return null;
  const [x, z] = p.pos || [0, 0]; o.position.x += x; o.position.z += z; o.rotation.y = (p.face || 0) * D2R; if (p.y && t !== 'panel') o.position.y = p.y;
  o.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } }); scene.add(o); return o;
}

// ---------- sets ----------
const solids = [];
function solid(o) { scene.add(o); o.updateMatrixWorld(true); solids.push(new THREE.Box3().setFromObject(o).expandByScalar(0.3)); return o; }
const _ray = new THREE.Ray(), _hit = new THREE.Vector3();
function unblock(look) {
  const d = cam.position.distanceTo(look); let best = d;
  _ray.origin.copy(look); _ray.direction.subVectors(cam.position, look).normalize();
  for (const b of solids) { if (b.containsPoint(look)) continue; if (_ray.intersectBox(b, _hit)) { const h = _hit.distanceTo(look); if (h < best) best = h; } }
  if (best < d) cam.position.copy(look).addScaledVector(_ray.direction, Math.max(best - 0.6, 1.2));
}
const lamps = [], CENTER = new THREE.Vector3();
function ground(painter = P.grass, key = 'grass', rep = 4) { const g = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), tmat(key, 512, 512, painter, 3000 / rep / 2, 3000 / rep / 2, { roughness: 0.95 })); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g); }
function horizon(r0 = 140) { // distant tree line + hills so the world never ends
  const r = prng(99); const tm = mat('#2f6b3a', { flatShading: true }), pm = mat('#2a5e35', { flatShading: true });
  for (let i = 0; i < 160; i++) { const a = i / 160 * Math.PI * 2 + r() * 0.03, rad = r0 + r() * 70; const s = 6 + r() * 6; const c = new THREE.Mesh(r() > 0.5 ? new THREE.ConeGeometry(s * 0.45, s * 1.6, 7) : new THREE.IcosahedronGeometry(s * 0.6, 0), r() > 0.5 ? tm : pm); c.position.set(Math.cos(a) * rad, s * 0.6, Math.sin(a) * rad); scene.add(c); }
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, h = new THREE.Mesh(new THREE.SphereGeometry(80 + r() * 60, 16, 8), mat('#4d7a52')); h.scale.y = 0.25 + r() * 0.2; h.position.set(Math.cos(a) * 420, -5, Math.sin(a) * 420); scene.add(h); }
}
function streetSet(name, text) {
  ground(); const asph = tmat('asphalt', 512, 512, P.asphalt, 60, 1.5, { roughness: 0.9 }), slab = tmat('slab', 128, 128, P.slab, 200, 1.5), curb = tmat('curb', 128, 128, P.curb, 200, 1);
  plane(400, 9, asph, 0, 0.01, 0);
  for (let x = -200; x < 200; x += 6) plane(2.8, 0.22, mat('#f2c94c', { roughness: 0.6 }), x, 0.025, 0);
  [-4.25, 4.25].forEach(z => plane(400, 0.16, mat('#f1f1f1', { roughness: 0.6 }), 0, 0.025, z));
  [-1, 1].forEach(s => { const c = box(400, 0.18, 0.3, curb, 0.03, 1); c.position.set(0, 0.09, s * 4.65); c.castShadow = false; scene.add(c); const sw = box(400, 0.18, 3, slab, 0, 1); sw.position.set(0, 0.09, s * 6.3); sw.castShadow = false; scene.add(sw); });
  for (let k = -1; k <= 1; k += 2) for (let i = 0; i < 7; i++) plane(0.5, 3.4, mat('#f3f3f3', { roughness: 0.6 }), k * 24 + (i - 3) * 0.9, 0.026, 0); // crosswalks
  const lot = 13, R = prng(SEED * 3 + 1);
  for (let k = -15; k <= 15; k++) {
    if (name === 'school' && Math.abs(k) <= 1) continue;
    const x = k * lot;
    const hf = house(k + 40); solid(at(hf, x + (R() - 0.5), 0, -16.5)); const hn = house(k + 140); solid(at(hn, x + 6 + (R() - 0.5), 0, 21, Math.PI));
    const dw = box(3, 0.04, 8, tmat('slab', 128, 128, P.slab, 1.5, 4), 0, 1); dw.position.set(x + hf.userData.W / 2 - 1.2, 0.02, -9.8); dw.castShadow = false; scene.add(dw);
    const path = box(1.4, 0.04, 4.8, tmat('slab', 128, 128, P.slab, 0.7, 2.4), 0, 1); path.position.set(x, 0.02, -10.2); path.castShadow = false; scene.add(path);
    if (R() > 0.4) { const f1 = fence(4.5); f1.position.set(x - 3.6, 0, -8.3); scene.add(f1); }
    const mb = mailbox(); mb.position.set(x + 1.2, 0.18, -7.6); scene.add(mb);
    solid(at(tree(R() > 0.6 ? 'pine' : 'round', k + 3), x + 6.5, 0, -11)); if (R() > 0.3) solid(at(tree('round', k + 9), x + 2, 0, 16.8));
    if (k % 2 === 0) { const l = lamp(); l.position.set(x + 3, 0.18, -5.2); l.rotation.y = Math.PI / 2; scene.add(l); lamps.push(l); } // far side only: near-side poles block the camera
    if (k % 3 === 0) { const h = hydrant(); h.position.set(x + 4.5, 0.18, -5.3); scene.add(h); }
  }
  if (name === 'school') {
    const bm = tmat('facadeschool', 512, 512, facade('#b5523b', 7), 6, 2); const b = box(34, 10, 12, bm, 0.02, 1); b.position.set(0, 5, -22); solid(b);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.8), new THREE.MeshStandardMaterial({ map: canvasTex(1600, 180, textPanel(text || 'SCHOOL', '#f7f3ea', '#1e3a6e')) })); s.position.set(0, 8.6, -15.94); scene.add(s);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 9, 8), mat('#c0c0c0', { metalness: 0.6 })); pole.position.set(10, 4.5, -11); scene.add(pole);
    plane(36, 7, tmat('slab', 128, 128, P.slab, 18, 3.5), 0, 0.02, -12.5);
  }
  for (const zr of [-62, 66]) { // back streets (only matter in aerial / reveal shots)
    plane(400, 9, asph, 0, 0.01, zr); for (let x = -200; x < 200; x += 6) plane(2.8, 0.22, mat('#f2c94c', { roughness: 0.6 }), x, 0.025, zr);
    [-1, 1].forEach(sd => { const sw = box(400, 0.18, 3, slab, 0, 1); sw.position.set(0, 0.09, zr + sd * 6.3); sw.castShadow = false; scene.add(sw); });
    for (let k = -12; k <= 12; k++) { if (Math.abs(k * 13 % 84) < 8) continue; const a1 = house(k + 300 + zr); at(a1, k * 13, 0, zr - 16.5); scene.add(a1); const a2 = house(k + 500 + zr); at(a2, k * 13 + 6, 0, zr + 16.5, Math.PI); scene.add(a2); if (k % 2) { const tr = tree(R() > 0.5 ? 'pine' : 'round', k + zr); tr.position.set(k * 13 + 6.5, 0, zr - 11); scene.add(tr); } }
  }
  for (const xc of [-84, 84]) plane(9, 150, asph, xc, 0.012, 2); // cross streets

  const cx = (shot.cast || []).map(c => pathPts(c)[0].x);
  for (let x = -60; x < 60; x += 9 + R() * 6) { if (cx.some(v => Math.abs(v - x) < 6)) continue; if (R() > 0.55) continue; const c = car(CLOTH[Math.floor(R() * CLOTH.length)]); c.position.set(x, 0, -3.25); scene.add(c); }
  const nt = shot.traffic !== undefined ? shot.traffic : 2; for (let i = 0; i < nt; i++) { const c = car(CLOTH[Math.floor(R() * CLOTH.length)]); c.rotation.y = Math.PI; scene.add(c); cars.push({ o: c, x0: (R() - 0.5) * 200, v: -(8 + R() * 4) }); c.position.z = -2.1; }
  horizon();
}
function citySet(text) {
  ground(); const asph = tmat('asphalt', 512, 512, P.asphalt, 1.5, 60), slab = tmat('slab', 128, 128, P.slab, 1.8, 200);
  plane(10, 400, asph, 0, 0.01, 0);
  for (let z = -200; z < 200; z += 6) plane(0.22, 2.8, mat('#f3f3f3'), 0, 0.025, z);
  [-1, 1].forEach(s => { const sw = box(3.6, 0.18, 400, slab, 0, 1); sw.position.set(s * 6.9, 0.09, 0); sw.castShadow = false; scene.add(sw); const c = box(0.3, 0.18, 400, tmat('curb', 128, 128, P.curb, 1, 200), 0.03, 1); c.position.set(s * 5.1, 0.09, 0); scene.add(c); });
  const R = prng(SEED * 5 + 2), shops = ['CAFE', 'PIZZA', 'BOOKS', 'TOYS', 'GYM', 'BANK', 'MARKET', 'SALON', 'DINER', 'GAMES'];
  const bc = ['#a9714f', '#8c5a44', '#c2a27e', '#7d6a5c', '#b88a6a', '#96816b', '#c9b79c', '#6f7d8c'];
  for (let k = -16; k <= 16; k++) [-1, 1].forEach(sd => {
    const h = 12 + R() * 26, w = 10.5, x = sd * (8.7 + w / 2), z = k * 11, col = bc[Math.floor(R() * bc.length)];
    const fm = tmat('facade' + col, 512, 512, facade(col), 2.6, h / 8);
    const b = box(w, h, 10.6, fm, 0.02, 1); b.position.set(x, h / 2, z); solid(b);
    const shop = shops[Math.floor(R() * shops.length)], ac = CLOTH[Math.floor(R() * CLOTH.length)];
    const aw = box(0.9, 0.12, 8, mat(ac, { roughness: 0.8 }), 0.02); aw.position.set(x - sd * (w / 2 + 0.45), 3.4, z); aw.rotation.z = sd * 0.25; scene.add(aw);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshStandardMaterial({ map: canvasTex(768, 140, textPanel(shop, '#1f2937', '#fff7cc')) })); sg.position.set(x - sd * (w / 2 + 0.02), 4.3, z); sg.rotation.y = -sd * Math.PI / 2; scene.add(sg);
    const gl = box(0.06, 2.4, 7, mat('#9cc3dd', { roughness: 0.1, metalness: 0.3 }), 0); gl.position.set(x - sd * (w / 2 + 0.02), 1.5, z); scene.add(gl);
    if (k % 2 === 0) { const l = lamp(); l.position.set(sd * 5.6, 0.18, z + 5); l.rotation.y = sd > 0 ? Math.PI : 0; scene.add(l); lamps.push(l); const t = tree('round', k * 7 + sd); t.scale.multiplyScalar(0.7); t.position.set(sd * 6.2, 0.18, z - 3); scene.add(t); }
  });
  const nt = shot.traffic !== undefined ? shot.traffic : 4; for (let i = 0; i < nt; i++) { const c = car(CLOTH[Math.floor(R() * CLOTH.length)]); const dir = i % 2 ? 1 : -1; c.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(c); cars.push({ o: c, axis: 'z', lane: dir * -2.2, x0: (R() - 0.5) * 200, v: dir * (8 + R() * 4) }); }
  horizon(240);
}
function parkSet() {
  ground(); const cob = tmat('cobble', 256, 256, P.cobble, 100, 1.2);
  plane(400, 4, cob, 0, 0.02, -1); const R = prng(SEED * 7 + 3);
  for (let i = 0; i < 70; i++) { const x = (R() - 0.5) * 140, z = (R() > 0.5 ? 1 : -1) * (5 + R() * 40); solid(at(tree(R() > 0.7 ? 'pine' : 'round', i, 1.1), x, 0, z)); }
  for (let x = -40; x <= 40; x += 10) { const b = bench(); b.position.set(x + 3, 0, -4); scene.add(b); const l = lamp(); l.position.set(x - 2, 0, 1.6); l.rotation.y = -Math.PI / 2; scene.add(l); lamps.push(l); }
  for (let i = 0; i < 18; i++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), mat(['#f472b6', '#facc15', '#f87171', '#a78bfa', '#ffffff'][i % 5], { flatShading: true })); f.position.set((R() - 0.5) * 50, 0.25, 2.6 + R() * 1.5); scene.add(f); }
  const fn = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.8, 32), tmat('curb', 128, 128, P.curb, 6, 1)); fn.position.set(0, 0.4, -14); scene.add(fn);
  const wtr = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.1, 32), mat('#4aa3df', { roughness: 0.1, metalness: 0.2 })); wtr.position.set(0, 0.75, -14); scene.add(wtr);
  horizon();
}
function plazaSet(text) {
  ground(); const cob = tmat('cobble', 256, 256, P.cobble, 40, 40);
  plane(90, 90, cob, 0, 0.015, 0); const R = prng(SEED * 11 + 5);
  const fn = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.8, 1.0, 40), tmat('curb', 128, 128, P.curb, 8, 1)); fn.position.set(0, 0.5, -12); scene.add(fn); solids.push(new THREE.Box3().setFromObject(fn));
  const wtr = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 0.1, 40), mat('#4aa3df', { roughness: 0.08, metalness: 0.2 })); wtr.position.set(0, 0.95, -12); scene.add(wtr);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.2, 16), tmat('curb', 128, 128, P.curb, 2, 2)); col.position.set(0, 2.1, -12); scene.add(col);
  const shops = ['CAFE', 'BAKERY', 'BOOKS', 'TOYS', 'MARKET', 'BANK', 'DINER', 'FLOWERS', 'ARCADE', 'PIZZA'], bc = ['#a9714f', '#c2a27e', '#b88a6a', '#96816b', '#c9b79c', '#8c5a44'];
  for (let side = 0; side < 3; side++) for (let i = -3; i <= 3; i++) {
    const h = 9 + R() * 12, w = 12, colr = bc[Math.floor(R() * bc.length)], fm = tmat('facade' + colr, 512, 512, facade(colr), 3, h / 8);
    const b = box(w, h, 10, fm, 0.02, 1); const ang = [0, Math.PI / 2, -Math.PI / 2][side], d = 50;
    const px = side === 0 ? i * 12.6 : side === 1 ? -d : d, pz = side === 0 ? -d : i * 12.6;
    b.position.set(px, h / 2, pz); b.rotation.y = ang; solid(b);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2), new THREE.MeshStandardMaterial({ map: canvasTex(768, 140, textPanel(shops[Math.floor(R() * shops.length)], '#1f2937', '#fff7cc')) }));
    const n = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)); sg.position.set(px + n.x * 5.05, 4.2, pz + n.z * 5.05); sg.rotation.y = ang; scene.add(sg);
    const aw = box(8, 0.12, 1.4, mat(CLOTH[Math.floor(R() * CLOTH.length)], { roughness: 0.8 }), 0.02); aw.position.set(px + n.x * 5.6, 3.3, pz + n.z * 5.6); aw.rotation.y = ang; aw.rotation.x = 0.2 * (side === 0 ? 1 : 0); scene.add(aw);
  }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, l = lamp(); l.position.set(Math.cos(a) * 26, 0, Math.sin(a) * 26 - 4); l.rotation.y = -a; scene.add(l); lamps.push(l); if (i % 2) { const t = tree('round', i + 70, 0.85); t.position.set(Math.cos(a + 0.25) * 30, 0, Math.sin(a + 0.25) * 30 - 4); scene.add(t); } else { const b = bench(); b.position.set(Math.cos(a + 0.2) * 22, 0, Math.sin(a + 0.2) * 22 - 4); b.rotation.y = -a - Math.PI / 2; scene.add(b); } }
  horizon(160);
}
function spaceSet(text) {
  const P2 = new THREE.Mesh(new THREE.SphereGeometry(120, 64, 48), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas('planet', 1024, 512, (g, w, h, r) => { const N = 64, grid = new Float32Array(N * N).map(() => r()); const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, q = (t) => t * t * (3 - 2 * t); const A = grid[((yi & 63) * N + (xi & 63))], B = grid[((yi & 63) * N + ((xi + 1) & 63))], C = grid[(((yi + 1) & 63) * N + (xi & 63))], D = grid[(((yi + 1) & 63) * N + ((xi + 1) & 63))]; return lerp(lerp(A, B, q(xf)), lerp(C, D, q(xf)), q(yf)); }; const img = g.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = vn(x / 64, y / 64) * 0.55 + vn(x / 24, y / 24) * 0.3 + vn(x / 9, y / 9) * 0.15, cl = vn(x / 40 + 9, y / 30 + 3), lat = Math.abs(y / h - 0.5) * 2; let c = n > 0.55 ? (lat > 0.85 ? [235, 240, 245] : n > 0.66 ? [120, 140, 90] : [70, 130, 70]) : [25, 70 + n * 60, 150 + n * 60]; if (cl > 0.6) c = c.map(v => lerp(v, 245, Math.min((cl - 0.6) * 3, 0.9))); const o = (y * w + x) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255; } g.putImageData(img, 0, 0); })), roughness: 0.9 }));
  P2.material.map.colorSpace = SRGB; P2.position.set(-60, -150, -260); P2.rotation.z = 0.3; scene.add(P2);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: '#7fb8ff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(330, 330, 1); glow.position.copy(P2.position); scene.add(glow);
  const ringTex = canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#c9d1db'; g.fillRect(0, 0, w, h); g.fillStyle = '#9aa5b3'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h); for (let y = 16; y < h; y += 22) for (let x = 4; x < w; x += 9) { g.fillStyle = rnd(x * 3 + y * 7) > 0.35 ? '#fff2c2' : '#3b4656'; g.fillRect(x, y, 5, 8); } });
  ringTex.wrapS = THREE.RepeatWrapping; ringTex.repeat.set(12, 1);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(70, 7, 24, 160), new THREE.MeshStandardMaterial({ map: ringTex, emissiveMap: ringTex, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.3 }));
  ring.rotation.x = Math.PI / 2.4; ring.position.set(20, 10, -120); scene.add(ring);
  [[0, 1, 0], [1, 0, 0]].forEach(ax => { const sp = box(140, 2.5, 2.5, mat('#aab4c0', { metalness: 0.4, roughness: 0.4 }), 0.3); sp.position.copy(ring.position); sp.rotation.copy(ring.rotation); sp.rotateOnAxis(new THREE.Vector3(...ax), Math.PI / 2); scene.add(sp); });
  const hub = new THREE.Mesh(new THREE.SphereGeometry(12, 32, 16), mat('#d7dde5', { metalness: 0.3, roughness: 0.4 })); hub.position.copy(ring.position); scene.add(hub);
  // observation deck: round platform, railing, edge lights, underside, mast
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.8, 64), [tmat('slabrim', 128, 32, P.slab, 8, 1), tmat('slab', 128, 128, P.slab, 6, 6), mat('#8b95a3')]); deck.position.y = -0.4; deck.receiveShadow = true; deck.castShadow = true; scene.add(deck);
  const under = new THREE.Mesh(new THREE.ConeGeometry(10, 7, 64, 1, true), mat('#9aa4b2', { metalness: 0.4, roughness: 0.45, side: THREE.DoubleSide })); under.rotation.x = Math.PI; under.position.y = -4.3; scene.add(under);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(10.02, 0.09, 8, 128), mat('#9fe3ff', { emissive: '#6fd2ff', emissiveIntensity: 3 })); edge.rotation.x = Math.PI / 2; edge.position.y = -0.05; scene.add(edge);
  const rm = mat('#c8d0da', { metalness: 0.5, roughness: 0.35 }), rail = new THREE.Mesh(new THREE.TorusGeometry(9.6, 0.07, 8, 128), rm); rail.rotation.x = Math.PI / 2; rail.position.y = 1.15; scene.add(rail);
  const rail2 = rail.clone(); rail2.position.y = 0.6; scene.add(rail2);
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, po = box(0.09, 1.15, 0.09, rm, 0.01); po.position.set(Math.cos(a) * 9.6, 0.58, Math.sin(a) * 9.6); scene.add(po); }
  const mast = box(0.35, 9, 0.35, rm, 0.05); mast.position.set(-7, 4.5, -5); scene.add(mast);
  const bea = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), mat('#ff5a5a', { emissive: '#ff3030', emissiveIntensity: 4 })); bea.position.set(-7, 9.1, -5); bea.userData.keep = true; scene.add(bea);
  [[5, -6], [6.5, -4.6]].forEach(([x, z], i) => { const cr = box(1.2, 1.2, 1.2, mat(i ? '#5b6b80' : '#d9a441', { roughness: 0.7 }), 0.06); cr.position.set(x, 0.6, z); cr.rotation.y = i * 0.5; scene.add(cr); });
}
function roomSet(text, classroom) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), tmat('wood', 256, 256, P.wood, 10, 10, { roughness: 0.6 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const wm = tmat('wallpaper' + (text || ''), 256, 256, text && text.startsWith('#') ? ((g, w, h, r) => speckle(g, w, h, r, text, 600, 0.05, 2)) : P.wallpaper, 6, 3);
  const W = classroom ? 20 : 16, D = classroom ? 18 : 14;
  const back = box(W, 9, 0.3, wm, 0, 1); back.position.set(0, 4.5, -6); scene.add(back);
  [-1, 1].forEach(s => { const sw = box(0.3, 9, D, wm, 0, 1); sw.position.set(s * W / 2, 4.5, -6 + D / 2); scene.add(sw); const bb = box(0.32, 0.4, D, '#f5f2ea', 0, 1); bb.position.set(s * (W / 2 - 0.05), 0.2, -6 + D / 2); scene.add(bb); });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat('#f4efe6')); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 9, -6 + D / 2); scene.add(ceil);
  const winM = new THREE.MeshBasicMaterial({ map: SKY.tex, color: '#ffffff' });
  [-W / 4, W / 4].forEach(x => { const w = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3), winM); w.position.set(x, 4.8, -5.84); scene.add(w); const fr = windowFrame(3.6, 3.2); fr.position.set(x, 4.8, -5.8); scene.add(fr); });
  if (classroom) {
    const board = box(8, 3, 0.1, '#23422f', 0.02); board.position.set(0, 4.6, -5.8); board.position.x = 0; scene.add(board);
    const rows = [[-5, 0], [0, 0], [5, 0], [-5, 4], [0, 4], [5, 4]]; rows.forEach(([x, z]) => { const d = makeProp({ type: 'desk', pos: [x, z], size: [2.2, 1.2] }); });
  } else { makeProp({ type: 'bed', pos: [-4.5, -3.5] }); makeProp({ type: 'desk', pos: [4, -4.6], size: [2.6, 1.1] }); const rug = plane(5, 3.6, mat('#c0504d', { roughness: 1 }), 0, 0.02, 0); }
}
function windowFrame(w, h) { const g = new THREE.Group(), m = mat('#f5f2ea'); [[0, h / 2, w, 0.15], [0, -h / 2, w, 0.15], [-w / 2, 0, 0.15, h], [w / 2, 0, 0.15, h], [0, 0, 0.1, h], [0, 0, w, 0.1]].forEach(([x, y, a, b]) => { const p = box(a, b, 0.12, m, 0.01); p.position.set(x, y, 0); g.add(p); }); return g; }
function stageSet(text) {
  plane(300, 300, mat('#14121f', { roughness: 0.5 }), 0, 0, 0);
  const pf = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.6, 48), mat('#2b2840', { roughness: 0.3, metalness: 0.4 })); pf.position.y = 0.3; pf.receiveShadow = true; scene.add(pf);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.1, 0.08, 8, 64), mat('#ffd75e', { emissive: '#ffcc33', emissiveIntensity: 3 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.62; scene.add(ring);
  const wall = box(60, 22, 1, '#1d1a30', 0); wall.position.set(0, 11, -18); scene.add(wall);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.2), new THREE.MeshBasicMaterial({ map: canvasTex(1600, 320, (g, w, h) => { g.shadowColor = '#ffd75e'; g.shadowBlur = 30; fitText(g, text || 'MAIN STAGE', w, h, '#fff1b8'); }), transparent: true })); sign.position.set(0, 12, -17.4); scene.add(sign);
  for (let i = 0; i < 5; i++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 26, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fff4cc', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); cone.position.set((i - 2) * 7, 13, -8); cone.rotation.z = (i - 2) * 0.18; scene.add(cone); }
}
function studioSet() {
  plane(300, 300, mat('#141a3a'), 0, 0, 0); const grid = new THREE.GridHelper(200, 100, 0x3a4aa0, 0x26306a); grid.position.y = 0.02; scene.add(grid);
  for (let i = 0; i < 70; i++) { const c = new THREE.Color().setHSL(rnd(i) * 0.25 + 0.55, 0.7, 0.6); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: c, transparent: true, opacity: 0.35 + rnd(i + 4) * 0.4, depthWrite: false })); const sz = 0.6 + rnd(i + 5) * 1.6; s.scale.set(sz, sz, 1); s.position.set((rnd(i + 6) - 0.5) * 60, 2 + rnd(i + 7) * 22, -20 - rnd(i + 8) * 25); scene.add(s); }
}
function buildSet(name, text) {
  lamps.length = 0; solids.length = 0;
  if (name === 'street' || name === 'school') streetSet(name, text); else if (name === 'city') citySet(text); else if (name === 'park') parkSet(); else if (name === 'plaza') plazaSet(text);
  else if (name === 'room' || name === 'classroom') roomSet(text, name === 'classroom'); else if (name === 'square' || name === 'townsquare') plazaSet(text); else if (name === 'space') spaceSet(text); else if (name === 'stage') stageSet(text); else studioSet();
}
let _dot; function dotTex() { return _dot || (_dot = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.6, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); })); }

// ---------- sky (painted equirect, cached per time of day) + lighting ----------
const PRESETS = {
  day: { zen: [0.20, 0.45, 0.85], hor: [0.78, 0.86, 0.95], sun: [0.55, 0.62, 0.32], sunC: '#fff2dc', sunI: 2.6, hemi: 0.6, env: 1.0, cloud: [1, 1, 1], cov: 0.48, fog: [70, 420], mtn: [0.55, 0.62, 0.72] },
  sunset: { zen: [0.22, 0.25, 0.55], hor: [1.0, 0.66, 0.42], sun: [-0.75, 0.16, 0.3], sunC: '#ffb27a', sunI: 2.4, hemi: 0.45, env: 0.9, cloud: [1.0, 0.75, 0.62], cov: 0.5, fog: [60, 380], mtn: [0.5, 0.42, 0.5] },
  night: { zen: [0.02, 0.03, 0.09], hor: [0.12, 0.17, 0.32], sun: [-0.4, 0.7, 0.4], sunC: '#9fb4ff', sunI: 1.1, hemi: 0.5, env: 0.65, cloud: [0.25, 0.3, 0.42], cov: 0.4, fog: [40, 300], mtn: [0.08, 0.1, 0.18], stars: true },
  space: { zen: [0.0, 0.0, 0.02], hor: [0.02, 0.02, 0.06], sun: [0.8, 0.35, 0.45], sunC: '#fff6e8', sunI: 3.2, hemi: 0.25, env: 0.3, cloud: [0, 0, 0], cov: 2, fog: [5000, 9000], mtn: [0, 0, 0], stars: true, space: true },
  overcast: { zen: [0.55, 0.6, 0.66], hor: [0.78, 0.8, 0.82], sun: [0.4, 0.8, 0.3], sunC: '#eef2f6', sunI: 1.2, hemi: 0.8, env: 1.0, cloud: [0.85, 0.87, 0.9], cov: 0.8, fog: [50, 300], mtn: [0.6, 0.63, 0.67] },
};
const SKYCACHE = {}; let SKY = {};
function paintSky(p) {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const r = prng(7), N = 128, grid = new Float32Array(N * N).map(() => r());
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, s = (t) => t * t * (3 - 2 * t); const a = grid[((yi & 127) * N + (xi & 127))], b = grid[((yi & 127) * N + ((xi + 1) & 127))], cc = grid[(((yi + 1) & 127) * N + (xi & 127))], dd = grid[(((yi + 1) & 127) * N + ((xi + 1) & 127))]; return lerp(lerp(a, b, s(xf)), lerp(cc, dd, s(xf)), s(yf)); };
  const fbm = (x, y) => vn(x, y) * 0.5 + vn(x * 2.1, y * 2.1) * 0.25 + vn(x * 4.3, y * 4.3) * 0.125 + vn(x * 8.7, y * 8.7) * 0.0625;
  const sd = new THREE.Vector3(...p.sun).normalize();
  for (let y = 0; y < H; y++) {
    const el = (0.5 - y / H) * Math.PI;
    for (let x = 0; x < W; x++) {
      const ph = (x / W - 0.5) * Math.PI * 2, dx = Math.cos(el) * Math.cos(ph), dy = Math.sin(el), dz = Math.cos(el) * Math.sin(ph);
      const t = Math.pow(Math.max(dy, 0), 0.45); let col = [0, 1, 2].map(i => lerp(p.hor[i], p.zen[i], t));
      const sdot = Math.max(0, dx * sd.x + dy * sd.y + dz * sd.z); const glow = Math.pow(sdot, 64) * 0.9 + Math.pow(sdot, 6) * 0.18;
      col = col.map((v, i) => v + glow * (i === 2 ? 0.7 : 1.0));
      if (dy > 0.005) { const k = 1 / (dy + 0.08), u = dx * k * 1.4, v = dz * k * 1.4; let n = fbm(u + 3.3, v + 7.1); const cov = smooth(p.cov, p.cov + 0.22, n) * smooth(0.0, 0.12, dy); if (cov > 0) { const sh = 0.78 + 0.32 * (fbm(u + 3.3 + sd.x * 0.15, v + 7.1 + sd.z * 0.15) < n ? 1 : 0.6) + glow * 0.4; col = col.map((cv, i) => lerp(cv, p.cloud[i] * sh, cov * 0.92)); } }
      if (p.stars && dy > 0.1 && grid[(x * 7 + y * 13) % (N * N)] > 0.996) col = [0.9, 0.9, 1];
      if (p.space) { const nb = fbm(x / W * 6 + 2, y / H * 5 + 1), nb2 = fbm(x / W * 9 + 7, y / H * 7); col = [0.01 + Math.pow(nb, 4) * 0.5, 0.005 + Math.pow(nb2, 5) * 0.25, 0.04 + Math.pow(nb, 3) * 0.6]; if (grid[(x * 7 + y * 13) % (N * N)] > 0.992) col = [1, 1, 1]; const o2 = (y * W + x) * 4; d[o2] = Math.min(255, col[0] * 255); d[o2 + 1] = Math.min(255, col[1] * 255); d[o2 + 2] = Math.min(255, col[2] * 255); d[o2 + 3] = 255; continue; }
      const mh = 0.035 + 0.05 * fbm(x / W * 12, 2.0) + 0.02 * fbm(x / W * 40, 5.0); if (dy < mh && dy > -0.02) { const hz = smooth(-0.02, mh, dy); col = col.map((cv, i) => lerp(lerp(p.mtn[i], p.hor[i], 0.35 + hz * 0.3), cv, 0)); }
      if (dy < 0) col = p.hor.map(v => v * 0.9);
      const o = (y * W + x) * 4; d[o] = Math.min(255, Math.pow(col[0], 1 / 1.0) * 255); d[o + 1] = Math.min(255, col[1] * 255); d[o + 2] = Math.min(255, col[2] * 255); d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0); return c;
}
function smooth(a, b, x) { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); }
function skyFor(time) {
  if (SKYCACHE[time]) return SKYCACHE[time];
  const p = PRESETS[time] || PRESETS.day, t = new THREE.CanvasTexture(paintSky(p)); t.colorSpace = SRGB; t.mapping = THREE.EquirectangularReflectionMapping;
  PM = PM || new THREE.PMREMGenerator(R); const env = PM.fromEquirectangular(t).texture;
  return (SKYCACHE[time] = { tex: t, env, p });
}
function lighting(time, setName) {
  const indoor = setName === 'room' || setName === 'classroom', dark = setName === 'studio' || setName === 'stage';
  SKY = skyFor(setName === 'space' ? 'space' : dark ? 'night' : time); const p = SKY.p;
  scene.background = dark ? new THREE.Color('#0b0f2a') : SKY.tex; scene.environment = SKY.env; scene.environmentIntensity = (dark ? 0.25 : indoor ? 0.55 : p.env) * 0.38;
  const hc = new THREE.Color().setRGB(...p.hor, SRGB); scene.fog = dark ? new THREE.Fog('#141a44', 40, 160) : new THREE.Fog(hc, p.fog[0], p.fog[1]);
  scene.add(new THREE.HemisphereLight(new THREE.Color().setRGB(...p.zen, SRGB).lerp(new THREE.Color('#fff1e0'), time === 'night' ? 0.25 : 0.72), '#8a7a62', p.hemi * (indoor ? 1.5 : time === 'night' ? 1.8 : 1.3)));
  const s = new THREE.DirectionalLight(p.sunC, indoor ? 1.6 : p.sunI); s.position.set(...new THREE.Vector3(...p.sun).normalize().multiplyScalar(40).toArray()); s.castShadow = true;
  s.shadow.mapSize.set(SHADOW, SHADOW); s.shadow.radius = 5; s.shadow.blurSamples = 12; s.shadow.bias = -0.0003; s.shadow.normalBias = 0.04; Object.assign(s.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 100 });
  scene.add(s); scene.add(s.target);
  if (indoor) { const pl = new THREE.PointLight('#ffe6c0', 30, 26, 1.5); pl.position.set(0, 8, -1); scene.add(pl); }
  if (setName === 'stage') [-6, 0, 6].forEach((x, i) => { const sp = new THREE.SpotLight(['#ffe9b0', '#b8c8ff', '#ffd0f0'][i], 300, 60, 0.35, 0.5, 1.5); sp.position.set(x, 24, 4); sp.target.position.set(x * 0.2, 0, 0); scene.add(sp); scene.add(sp.target); });
  if (time === 'night' && !indoor) { const fill = new THREE.DirectionalLight('#c9d6ff', 0.7); fill.position.set(-8, 6, 20); scene.add(fill); }
  if (time === 'night' && !indoor) lamps.sort((a, b) => a.position.distanceTo(CENTER) - b.position.distanceTo(CENTER)).slice(0, 3).forEach(l => { const pl = new THREE.PointLight('#ffcf7a', 30, 20, 1.6); pl.position.copy(l.position).add(new THREE.Vector3(0, 4.6, 0)); scene.add(pl); });
  return s;
}

// ---------- fx ----------
function makeFx(kind) {
  if (!kind) return null;
  if (kind === 'sparkles' || kind === 'glow') { const N = 220, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); const m = new THREE.Points(g, new THREE.PointsMaterial({ map: dotTex(), size: 0.4, color: '#ffd75e', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.frustumCulled = false; scene.add(m); return { kind, m, N }; }
  const N = kind === 'rain' ? 1100 : kind === 'snow' ? 600 : 300;
  const geo = kind === 'rain' ? new THREE.BoxGeometry(0.02, 0.45, 0.02) : kind === 'snow' ? new THREE.SphereGeometry(0.06, 6, 4) : new THREE.BoxGeometry(0.16, 0.24, 0.03);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: kind === 'rain' ? '#b8d0ff' : '#ffffff', transparent: kind === 'rain', opacity: 0.5 }), N);
  if (kind === 'confetti') { const c = new THREE.Color(); for (let i = 0; i < N; i++) m.setColorAt(i, c.setHSL(rnd(i * 3), 0.85, 0.55)); }
  m.frustumCulled = false; scene.add(m); return { kind, m, N, d: new THREE.Object3D() };
}
function stepFx(t, center) {
  if (!fx) return;
  if (fx.kind === 'sparkles' || fx.kind === 'glow') { const A = Object.values(actors)[0], c0 = A ? A.root.position : new THREE.Vector3(), pos = fx.m.geometry.attributes.position; for (let i = 0; i < fx.N; i++) { const ph = (rnd(i) + t * (0.25 + rnd(i + 1) * 0.3)) % 1, a = rnd(i + 2) * 6.283 + t * 0.8, r = 0.7 + rnd(i + 3) * 1.4 * (1 - ph * 0.5); pos.setXYZ(i, c0.x + Math.cos(a) * r, c0.y + ph * 4.2, c0.z + Math.sin(a) * r); } pos.needsUpdate = true; return; }
  const { kind, m, N, d } = fx, spd = kind === 'rain' ? 20 : kind === 'snow' ? 1.4 : 3, Hh = 14;
  for (let i = 0; i < N; i++) { const y = Hh - ((rnd(i + 1) * Hh + t * spd * (0.7 + rnd(i + 2) * 0.6)) % Hh); let x = center.x + (rnd(i + 3) - 0.5) * 30, z = center.z + (rnd(i + 4) - 0.5) * 30; const dx = x - center.x, dz = z - center.z, dd = Math.hypot(dx, dz); if (dd < 3.5) { x = center.x + dx / (dd + 1e-3) * 3.5; z = center.z + dz / (dd + 1e-3) * 3.5; } d.position.set(x, y, z); if (kind !== 'rain') d.rotation.set(t * 3 + i, t * 2 + i * 0.7, 0); d.updateMatrix(); m.setMatrixAt(i, d.matrix); }
  m.instanceMatrix.needsUpdate = true;
}

// ---------- animation ----------
function pathPts(spec) { return (spec.path || [spec.pos || [0, 0], ...(spec.to ? [spec.to] : [])]).map(p => p.length === 3 ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p[0], spec.y || 0, p[1])); }
function pathAt(a, spec, u) { if (!a._curve) { const pts = pathPts(spec); a._curve = pts.length > 1 ? new THREE.CatmullRomCurve3(pts) : { getPointAt: () => pts[0].clone() }; } return a._curve.getPointAt(Math.min(Math.max(u, 0), 1)); }
function moveU(spec, t, dur) { const m = spec.move || [0, 1], k = (t - m[0] * dur) / Math.max((m[1] - m[0]) * dur, 0.01); return (spec.to || spec.path) ? (spec.linear ? Math.min(Math.max(k, 0), 1) : ease(k)) : 0; }
function curveLen(a, spec) { pathAt(a, spec, 0); return a._curve.getLength ? a._curve.getLength() : 0; }
const wrapA = (x) => Math.atan2(Math.sin(x), Math.cos(x));
const sm = (a, b, x) => smooth(a, b, x);
function actorPose(a, spec, t, dur, amp) {
  const act = spec.act || 'idle', mv = spec.move || [0, 1], mv0 = mv[0] * dur, mv1 = mv[1] * dur, hasPath = !!(spec.to || spec.path);
  const u = moveU(spec, t, dur), L = hasPath ? curveLen(a, spec) : 0, h = 1 / 60;
  const speed = hasPath ? L * Math.abs(moveU(spec, t + h, dur) - moveU(spec, Math.max(t - h, 0), dur)) / (t + h - Math.max(t - h, 0)) : 0;
  const P0 = pathAt(a, spec, u), Pn = pathAt(a, spec, Math.min(u + 0.01, 1)), Pp = pathAt(a, spec, Math.max(u - 0.01, 0));
  let face = (spec.face || 0) * D2R;
  if (spec.look && actors[spec.look]) { const o = actors[spec.look].root.position; face = Math.atan2(o.x - P0.x, o.z - P0.z); const ch = (spec.cheat !== undefined ? spec.cheat : 30) * D2R, dl = wrapA(-face); face += Math.max(-ch, Math.min(ch, dl)); }
  const travel = Math.hypot(Pn.x - Pp.x, Pn.z - Pp.z) > 1e-4 ? Math.atan2(Pn.x - Pp.x, Pn.z - Pp.z) : face;
  const kMove = hasPath ? sm(0.05, 0.6, speed) : 0; face = face + wrapA(travel - face) * kMove; // turn smoothly into the walk and back out of it
  a.root.position.copy(P0); a.root.rotation.set(0, face, 0); a.blob.visible = P0.y < 0.5;
  const H = a, ph0 = a.id.length * 1.7; let y = 2 * S, bob = 0, lean = 0;
  // rest pose + breathing + weight shift (always on, very subtle)
  const br = Math.sin(t * 1.6 + ph0);
  H.armL.rotation.set(0.02 * br, 0, 0.05 + 0.015 * br); H.armR.rotation.set(-0.02 * br, 0, -0.05 - 0.015 * br);
  H.legL.rotation.set(0, 0, 0); H.legR.rotation.set(0, 0, 0); H.hips.rotation.set(0, 0, Math.sin(t * 0.55 + ph0) * 0.012);
  H.head.rotation.set(0.015 * br, spec.look ? 0 : Math.sin(t * 0.37 + ph0) * 0.12, 0); bob = br * 0.008;
  const w = ease(t / 0.35), osc = (f, k = 0) => Math.sin(t * f + k); // action blend-in weight, oscillator
  // locomotion: legs driven by distance travelled, amplitude by speed (no sliding, no snapping)
  const run = act === 'run', loco = act === 'walk' || run || kMove > 0;
  if ((act === 'walk' || run) && !hasPath) { const ph = t * (run ? 9 : 6.2), amp2 = (run ? 0.9 : 0.5) * w; walkPose(H, ph, amp2, run); bob += Math.abs(Math.cos(ph)) * (run ? 0.12 : 0.045) * w; lean = run ? 0.14 * w : 0.02; }
  else if (loco && act !== 'fly' && act !== 'float') { const ph = L * u * (run ? 3.6 : 5.6), k = sm(0.05, run ? 3.5 : 1.3, speed); walkPose(H, ph, (run ? 0.9 : 0.52) * k, run); bob += Math.abs(Math.cos(ph)) * (run ? 0.12 : 0.045) * k; lean = (run ? 0.14 : 0.03) * k; }
  if (act === 'fly' || act === 'float') {
    const fl = act === 'fly', dy = Pn.y - Pp.y, dh = Math.hypot(Pn.x - Pp.x, Pn.z - Pp.z), pitch = fl ? Math.min(Math.max(Math.PI / 2 - Math.atan2(dy, dh + 1e-5) * 0.8, 0.5), 1.4) : 0;
    a.root.rotation.x = pitch * ease(t / 0.5); bob = osc(2.2) * 0.08;
    H.armL.rotation.set(fl ? -2.95 * w : 0, 0, fl ? 0.18 : 0.9 + osc(1.4) * 0.08); H.armR.rotation.set(fl ? -2.95 * w : 0, 0, fl ? -0.18 : -0.9 - osc(1.4) * 0.08);
    H.legL.rotation.x = fl ? 0.12 + osc(3.1) * 0.05 : osc(1.5) * 0.1; H.legR.rotation.x = fl ? 0.04 - osc(3.1) * 0.05 : -osc(1.5) * 0.1; if (fl) H.head.rotation.x = -0.8 * w;
  }
  if (act === 'wave') { H.armR.rotation.z = lerp(-0.05, -2.6, w) + osc(5.2) * 0.28 * w; H.armR.rotation.x = -0.15 * w; H.head.rotation.z = 0.05 * w; }
  if (act === 'point') { H.armR.rotation.x = -1.5 * w; H.head.rotation.x -= 0.05 * w; }
  if (act === 'arms_up' || act === 'cheer') { const b = 0.5 + 0.5 * osc(5, -1.5); H.armL.rotation.z = lerp(0.05, 2.55 + 0.15 * b, w); H.armR.rotation.z = lerp(-0.05, -2.55 - 0.15 * b, w); bob += b * 0.22 * w; H.head.rotation.x -= 0.12 * w; }
  if (act === 'jump') { const c = (t * 0.9) % 1, hgt = Math.sin(Math.min(c / 0.7, 1) * Math.PI); bob += hgt * 0.9; H.legL.rotation.x = H.legR.rotation.x = -0.35 * hgt; H.armL.rotation.z = 0.05 + 0.9 * hgt; H.armR.rotation.z = -0.05 - 0.9 * hgt; }
  if (act === 'dance') { const b = osc(4.2); H.armL.rotation.z = 1.0 + b * 0.8 * w; H.armR.rotation.z = -1.0 + b * 0.8 * w; H.hips.rotation.y = osc(2.1) * 0.3 * w; bob += Math.abs(b) * 0.12 * w; H.head.rotation.z = osc(2.1) * 0.08; }
  if (act === 'cry') { H.head.rotation.x = 0.14 * w + osc(5) * 0.02; H.armL.rotation.set(-0.28 * w, 0, 0.08); H.armR.rotation.set(-0.28 * w, 0, -0.08); H.hips.rotation.z += osc(11) * 0.008; bob += Math.abs(osc(5)) * 0.015; }
  if (act === 'sob') { H.head.rotation.x = 0.32 * w; H.armL.rotation.set(-2.25 * w, 0, -0.42 * w); H.armR.rotation.set(-2.25 * w, 0, 0.42 * w); H.hips.rotation.z += osc(11) * 0.012; }
  if (act === 'think') { H.armR.rotation.set(-2.35 * w, 0, 0.5 * w); H.head.rotation.set(-0.08 * w, 0.18 * w, 0.1 * w); }
  if (act === 'talk') { H.armR.rotation.x = (-0.45 + osc(1.9) * 0.18 + osc(3.3, 1) * 0.06) * w; H.armL.rotation.x = (-0.15 + osc(1.4, 2) * 0.1) * w; H.hips.rotation.y = osc(0.9) * 0.05; }
  if (act === 'shrug') { const k = sm(0.2, 0.6, t) * (1 - sm(1.4, 1.9, t)); H.armL.rotation.z = 0.05 + k * 0.75; H.armR.rotation.z = -0.05 - k * 0.75; H.head.rotation.z = k * 0.1; bob += k * 0.04; }
  if (act === 'shock') { const k = ease(t / 0.22), rec = 1 - 0.25 * sm(0.4, 1.2, t); H.armL.rotation.z = 0.05 + k * 1.15 * rec; H.armR.rotation.z = -0.05 - k * 1.15 * rec; bob += Math.sin(Math.min(t / 0.35, 1) * Math.PI) * 0.25; H.head.rotation.x = -0.08 * k; }
  if (act === 'sit') { y = 1.25; H.legL.rotation.x = H.legR.rotation.x = -1.5; H.armL.rotation.x = H.armR.rotation.x = -0.35; }
  if (act === 'fall') { const k = ease(t / 0.55); a.root.rotation.x = -k * Math.PI / 2; H.armL.rotation.z = 0.05 + k * 2.3; H.armR.rotation.z = -0.05 - k * 2.3; }
  if (act === 'lie') a.root.rotation.x = -Math.PI / 2;
  if (act === 'bow') H.hips.rotation.x = 0.5 * Math.sin(Math.min(t / 1.2, 1) * Math.PI);
  H.hips.position.y = y + bob; H.hips.rotation.x += lean;
  if (spec.trail || act === 'fly') trail(a, spec, u, t, mv1 - mv0);
  if (amp > 0.02) { const k = Math.min(amp * 2.5, 1); H.head.rotation.x += (osc(4.1) * 0.025 + osc(2.3, 1) * 0.015) * k; H.head.rotation.y += osc(1.7, 2) * 0.04 * k; }
  const expr = spec.expr || (act === 'cry' || act === 'sob' ? 'cry' : act === 'shock' ? 'shock' : act === 'cheer' || act === 'dance' ? 'grin' : 'neutral');
  const mouth = amp > 0.16 ? 2 : amp > 0.06 ? 1 : 0, bt = (t + rnd(a.id.length) * 3) % 3.6;
  const blink = act === 'lie' ? 0 : bt > 3.5 ? 1 : bt > 3.42 ? 2 : bt > 3.36 ? 1 : 0; // half - closed - half
  const key = expr + mouth + blink; if (key !== a.faceKey) { drawFace(a.faceC.getContext('2d'), a.def, expr, mouth, blink); a.faceT.needsUpdate = true; a.faceKey = key; }
  let tg = spec.tag !== undefined ? spec.tag : a.def.tag;
  if (tg && typeof tg === 'object') { const v = Math.round(lerp(tg.from, tg.to, ease((t - (tg.at || 0) * dur) / Math.max((tg.dur || 1) * dur, 0.01)))); tg = v.toLocaleString('en-US'); }
  if (tg !== undefined && tg !== null && tg !== '') { const tk = String(tg) + (spec.tag_color || a.def.tag_color || ''); if (tk !== a.tagKey) { if (a.tag) { a.root.remove(a.tag); a.tag.material.map.dispose(); } a.tag = tagSprite(String(tg), spec.tag_color || a.def.tag_color); a.tag.position.y = 3.85; a.root.add(a.tag); a.tagKey = tk; } }
}
function walkPose(H, ph, amp, run) {
  const sw = Math.sin(ph) * amp, sw2 = Math.sin(ph - 0.25) * amp;
  H.legL.rotation.x = sw; H.legR.rotation.x = -sw;
  H.armL.rotation.x = -sw2 * 0.85; H.armR.rotation.x = sw2 * 0.85;
  H.hips.rotation.y += Math.sin(ph) * 0.05 * (amp / 0.5); H.head.rotation.y -= Math.sin(ph) * 0.03 * (amp / 0.5);
  if (run) { H.armL.rotation.x -= 0.2; H.armR.rotation.x -= 0.2; }
}
function trail(a, spec, u, t, mdur) {
  if (!a._trail) { const N = 60, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); a._trail = new THREE.Points(g, new THREE.PointsMaterial({ map: dotTex(), size: 0.35, color: spec.trail_color || '#ffd75e', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); a._trail.frustumCulled = false; scene.add(a._trail); }
  const pos = a._trail.geometry.attributes.position, N = pos.count;
  for (let i = 0; i < N; i++) { const lag = 0.015 + (i / N) * 0.3 * Math.min(1, 2.5 / Math.max(mdur, 0.1)), p = pathAt(a, spec, Math.max(u - lag, 0)); const j = (k) => (rnd(i * 7 + k) - 0.5) * (0.3 + i / N * 1.4); pos.setXYZ(i, p.x + j(1), p.y + 1.4 + j(2) + Math.sin(t * 5 + i) * 0.08, p.z + j(3)); }
  pos.needsUpdate = true;
}
function foreground(kind) {
  const g = new THREE.Group(), c = kind === 'leaves' ? '#2f7d36' : kind === 'fence' ? '#f5f2ea' : '#f4f1ea';
  if (kind === 'window') [[0, 1.05, 2.4, 0.16], [0, -1.05, 2.4, 0.16], [-1.15, 0, 0.16, 2.3], [1.15, 0, 0.16, 2.3]].forEach(([x, y, w, h]) => { const b = box(w, h, 0.1, c, 0.02); b.position.set(x, y, 0); g.add(b); });
  else if (kind === 'leaves') for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + rnd(i) * 0.2, 0), mat(c, { flatShading: true })); b.position.set((rnd(i + 1) - 0.5) * 2.4, -1.0 + rnd(i + 2) * 0.4, 0); g.add(b); }
  else if (kind === 'fence') for (let i = -3; i <= 3; i++) { const b = box(0.12, 2.6, 0.06, c, 0.01); b.position.set(i * 0.38, -0.2, 0); g.add(b); }
  g.traverse(m => { if (m.isMesh) { m.castShadow = false; m.userData.keep = true; } }); cam.add(g); g.position.set(0, 0, -1.6); return g;
}

// ---------- camera (calm, cinematic) ----------
const _v = new THREE.Vector3();
function anchor(a) { a.root.updateMatrixWorld(true); return a.root.localToWorld(_v.set(0, 2.0, 0)).clone().sub(new THREE.Vector3(0, 2.0 * (a.def.scale || 1), 0)); }
function camPose(c, t, dur) {
  const u = Math.min(t / dur, 1), e = ease(u * 0.85 + 0.075) * 1.0, mv = c.move || 'push'; let focus = null;
  if (c.path) {
    if (!c._curve) c._curve = new THREE.CatmullRomCurve3(c.path.map(p => new THREE.Vector3(...p)));
    const k = c.linear ? u : ease(u); cam.position.copy(c._curve.getPointAt(k));
    if (c.look) cam.lookAt(...c.look); else cam.lookAt(c._curve.getPointAt(Math.min(k + 0.04, 1)).add(new THREE.Vector3(0, -1.5, 0)));
  } else if (c.type === 'follow' || c.type === 'track') {
    const A = actors[[].concat(c.on)[0]]; const p = anchor(A), d = (c.dist || 8) * (c.zoom || 1), ang = (c.angle || 0) * D2R + (c.type === 'follow' ? A.root.rotation.y + Math.PI : 0), hh = c.height !== undefined ? c.height : 1.2;
    if (c.type === 'follow' || !c._anchor) c._anchor = new THREE.Vector3(p.x + Math.sin(ang) * d, p.y + 2.2 + hh, p.z + Math.cos(ang) * d);
    if (c.type === 'follow') { c._sm = c._sm ? c._sm.lerp(c._anchor, 0.12) : c._anchor.clone(); cam.position.copy(c._sm); } else cam.position.copy(c._anchor);
    const lp = new THREE.Vector3(p.x, p.y + 2.3, p.z); unblock(lp); cam.lookAt(lp); focus = lp;
  } else if (c.pos) {
    const p0 = new THREE.Vector3(...c.pos), p1 = new THREE.Vector3(...(c.to_pos || c.pos)), l0 = new THREE.Vector3(...(c.look || [0, 2, 0])), l1 = new THREE.Vector3(...(c.to_look || c.look || [0, 2, 0]));
    cam.position.lerpVectors(p0, p1, ease(u)); cam.lookAt(new THREE.Vector3().lerpVectors(l0, l1, ease(u)));
  } else {
    const ons = [].concat(c.on || Object.keys(actors)[0]).filter(id => actors[id]);
    const pts = ons.map(id => anchor(actors[id])), ctr = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / Math.max(pts.length, 1));
    const spread = pts.length > 1 ? Math.max(...pts.map(p => p.distanceTo(ctr))) : 0;
    const F = { xclose: [1.6, 2.82, 2.77], close: [2.8, 2.95, 2.72], medium: [5.4, 3.0, 2.35], full: [8.2, 2.7, 1.75], wide: [17, 5.5, 1.5], low: [4.6, 0.55, 2.7], high: [9, 11, 1.2], top: [0.01, 22, 0] }[c.type || 'medium'] || [5.4, 3.0, 2.35];
    const sc = ons.reduce((a, id) => a + (actors[id].def.scale || 1), 0) / Math.max(ons.length, 1);
    let dist = (F[0] * sc + spread * 1.8) * (c.zoom || 1);
    if (pts.length > 1 && c.type !== 'ots') { const hh = Math.atan(Math.tan((c.fov || 40) * D2R / 2) * cam.aspect); dist = Math.max(dist, (spread + 1.15) / Math.tan(hh) * (c.zoom || 1)); }
    if (mv === 'push') dist *= lerp(1.06, 0.95, e); if (mv === 'pull') dist *= lerp(0.95, 1.08, e);
    let rv = 0; if (mv === 'reveal' || mv === 'zoomout' || mv === 'descend') { const k = ease(Math.min(t / dur, 1)); rv = mv === 'descend' ? 1 - k : k; }
    let baseA = c.angle;
    if (baseA === undefined && ons.length === 1) { const sp = (shot.cast || []).find(k => k.id === ons[0]); if (sp && sp.look && actors[sp.look]) { const A = actors[ons[0]].root, B = actors[sp.look].root.position; const az = Math.atan2(B.x - A.position.x, B.z - A.position.z), dl = Math.atan2(Math.sin(az - A.rotation.y), Math.cos(az - A.rotation.y)); baseA = -Math.sign(dl || 1) * 38; } }
    let ang = (baseA || 0) * D2R + (ons.length === 1 && c.relative !== false ? actors[ons[0]].root.rotation.y : 0);
    if (mv === 'orbit' || mv === 'arc') ang += lerp(-0.16, 0.16, e) * (c.dir || 1);
    if (c.type === 'ots' && ons.length > 1) {
      const A = actors[ons[0]].root.position, B = actors[ons[1]].root.position, dir = new THREE.Vector3().subVectors(A, B).setY(0).normalize();
      cam.position.copy(A).addScaledVector(dir, 3.6 + (mv === 'push' ? lerp(0.25, -0.15, e) : 0)).add(new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(c.side || 1.5)).setY(3.15); cam.lookAt(B.x, 2.55, B.z); ctr.copy(B);
    } else {
      let lx = 0; if (mv === 'dolly' || mv === 'pan') lx = lerp(-1, 1, e) * (c.dir || 1) * (mv === 'dolly' ? 1.4 : 0.9);
      const side = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang));
      if (rv) { ang += rv * (c.spin !== undefined ? c.spin : 25) * D2R; dist = lerp(dist, c.reveal_dist || 60, rv * rv * (3 - 2 * rv)); }
      const camH = F[1] * sc + (c.height || 0) + (mv === 'rise' || mv === 'crane' ? lerp(-0.6, 1.4, e) : 0) + (rv ? lerp(0, c.reveal_height || 38, rv) : 0);
      cam.position.set(ctr.x + Math.sin(ang) * dist, ctr.y + camH, ctr.z + Math.cos(ang) * dist).addScaledVector(side, lx);
      cam.lookAt(ctr.x + (mv === 'pan' ? side.x * lx * 0.2 : 0), ctr.y + lerp(F[2] * sc + (c.look_y || 0), 0, rv), ctr.z + (mv === 'pan' ? side.z * lx * 0.2 : 0));
    }
    focus = ctr.clone().setY(ctr.y + 2.7 * sc); if (cam.position.y < 14) unblock(focus);
    if (c.type !== 'ots') cam.lookAt(ctr.x, ctr.y + lerp((c.type === 'low' ? 3.2 : F[2]) * sc + (c.look_y || 0), 0, rv), ctr.z);
    if (rv) cam.fov = c.fov || 40;
  }
  if (c.roll) cam.rotateZ(c.roll * D2R);
  if (c.shake) { const sk = c.shake * Math.max(0, 1 - t / 0.6); cam.position.x += Math.sin(t * 13.1) * sk; cam.position.y += Math.sin(t * 17.3) * sk; }
  if (c.handheld) { cam.position.x += Math.sin(t * 0.9) * 0.02 * c.handheld; cam.position.y += Math.sin(t * 1.3) * 0.015 * c.handheld; }
  let fov = c.fov || 40; if (c.punch) { const [atu, f] = c.punch; if (u >= atu) fov /= (f || 1.25); }
  if (c.zoom_to) fov = lerp(fov, fov / c.zoom_to, e);
  cam.fov = fov; cam.updateProjectionMatrix();
  return focus ? cam.position.distanceTo(focus) : (c.focus || 12);
}

// ---------- post (bloom, DOF, grade, vignette, grain) ----------
let rt, bloom, quad, POST = {}, SHADOW = 2048;
const GRADES = { film: [1.06, 1.08, [0.01, 0.012, 0.025], [1.04, 1.01, 0.95]], warm: [1.05, 1.1, [0.02, 0.01, 0.0], [1.08, 1.0, 0.9]], cool: [1.05, 0.98, [0.0, 0.01, 0.03], [0.95, 1.0, 1.06]], night: [1.1, 0.92, [0.0, 0.01, 0.035], [0.9, 0.97, 1.1]], dream: [0.96, 1.15, [0.04, 0.03, 0.05], [1.05, 1.0, 1.05]], none: [1, 1, [0, 0, 0], [1, 1, 1]] };
let HQ = false;
function makePost(w, h) {
  rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: HQ ? 4 : 0 }); rt.depthTexture = new THREE.DepthTexture(w, h); rt.depthTexture.type = THREE.UnsignedIntType;
  bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.5, 0.45, 0.92);
  quad = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: { tC: { value: rt.texture }, tD: { value: rt.depthTexture }, res: { value: new THREE.Vector2(w, h) }, near: { value: 0.1 }, far: { value: 1000 }, focus: { value: 10 }, ap: { value: 0 }, time: { value: 0 }, con: { value: 1 }, sat: { value: 1 }, lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) }, vig: { value: 0.3 }, grain: { value: 0.025 }, expo: { value: 1.0 }, flash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tC, tD; uniform vec2 res; uniform float near, far, focus, ap, time, con, sat, vig, grain, expo, flash; uniform vec3 lift, gain;
      float lin(float d){ float z=d*2.-1.; return 2.*near*far/(far+near-z*(far-near)); }
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec3 col = texture2D(tC,vUv).rgb;
        if (ap > 0.) { float z = lin(texture2D(tD,vUv).r); float coc = clamp(abs(z-focus)/z*ap*res.y, 0., 20.);
          if (coc > 0.8) { vec3 acc=col; float wsum=1.; for (int i=0;i<16;i++){ float fi=float(i)+.5; float r=sqrt(fi/16.)*coc; float a=fi*2.39996; vec2 o=vec2(cos(a),sin(a))*r/res; float zs=lin(texture2D(tD,vUv+o).r); float w = zs < z-0.5 ? clamp(abs(zs-focus)/zs*ap*res.y/coc,0.,1.) : 1.; acc += texture2D(tC,vUv+o).rgb*w; wsum+=w; } col = acc/wsum; } }
        col = aces(col*expo); col = pow(col, vec3(1./2.2));
        col = col*gain + lift*(1.-col); float l = dot(col,vec3(.299,.587,.114)); col = mix(vec3(l),col,sat); col = (col-.5)*con+.5;
        vec2 q=vUv-.5; col *= 1.-vig*smoothstep(.3,.9,length(q*vec2(1.,1.2)));
        col += (h(vUv*res+fract(time*7.31)*100.)-.5)*grain; col = mix(col, vec3(1.), flash);
        gl_FragColor = vec4(clamp(col,0.,1.),1.); }` }));
}
function renderPost(t, focusDist, s) {
  const p = Object.assign({ grade: 'film', bloom: 0.25, dof: 'auto', vignette: 0.3, grain: 0.025, exposure: 1.0 }, POST, s.post || {});
  const G = GRADES[p.grade] || GRADES.film, U = quad.material.uniforms;
  R.setRenderTarget(rt); R.render(scene, cam);
  if (p.bloom > 0) { bloom.strength = p.bloom; bloom.render(R, null, rt, 0, false); }
  R.setRenderTarget(null);
  const ctype = (s.cam || {}).type || 'medium', autoAp = { xclose: 0.010, close: 0.007, medium: 0.0035, low: 0.003, ots: 0.005, follow: 0.002, full: 0.002 }[ctype] || 0;
  U.focus.value = focusDist; U.ap.value = p.dof === 'auto' || p.dof === undefined ? autoAp : +p.dof; U.near.value = cam.near; U.far.value = cam.far; U.time.value = t;
  U.con.value = G[0]; U.sat.value = G[1]; U.lift.value.set(...G[2]); U.gain.value.set(...G[3]); U.vig.value = p.vignette; U.grain.value = p.grain; U.expo.value = p.exposure; U.flash.value = s.flash ? Math.max(0, 1 - t / 0.18) : 0;
  quad.render(R);
}

// ---------- api ----------
window.ENGINE = {
  init(w, h, opts = {}) {
    R = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true }); R.setPixelRatio(1); R.setSize(w, h);
    HQ = !!opts.hq; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFShadowMap; SHADOW = opts.shadow || (HQ ? 4096 : 2048); R.toneMapping = THREE.NoToneMapping; document.body.appendChild(R.domElement);
    POST = opts.post || {}; cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 1000); makePost(w, h); return true;
  },
  setup(s, chars, seed) {
    if (scene) { const ms = new Set(); scene.traverse(o => { if (o.geometry && o.geometry !== HEADGEO && o.geometry !== CAPGEO) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => ms.add(m)); }); ms.forEach(m => m.dispose()); Object.values(TEXS).forEach(t => t.dispose()); }
    scene = new THREE.Scene(); shot = s; SEED = seed || 1; actors = {}; npcs = []; cars = []; MATS = {}; TEXS = {};
    while (cam.children.length) cam.remove(cam.children[0]); scene.add(cam); if ((s.cam || {}).foreground) foreground(s.cam.foreground);
    if (s.cam) { delete s.cam._curve; delete s.cam._anchor; delete s.cam._sm; }
    const c0 = (s.cast || [])[0]; const cp = c0 ? pathPts(c0)[0] : new THREE.Vector3(); CENTER.copy(cp).setY(0);
    const setName = s.set || 'street'; buildSet(setName, s.set_text); sun = lighting(s.time || 'day', setName);
    (s.props || []).forEach(p => makeProp(p)); bake();
    (s.cast || []).forEach(c => { if (chars[c.id]) actors[c.id] = makeActor(c.id, chars[c.id]); });
    spawnNpcs(s, setName); fx = makeFx(s.fx); return Object.keys(actors).length;
  },
  frame(t, dur, amps) { this.draw(t, dur, amps); return R.domElement.toDataURL('image/jpeg', 0.9); },
  draw(t, dur, amps) {
    (shot.cast || []).forEach(c => { const a = actors[c.id]; if (a) a.root.position.copy(pathAt(a, c, moveU(c, t, dur))); });
    (shot.cast || []).forEach(c => actors[c.id] && actorPose(actors[c.id], c, t, dur, (amps || {})[c.id] || 0));
    if (!shot._occl) { shot._occl = 1; hideBlockers(dur); }
    stepNpcs(t);
    const fd = camPose(shot.cam || {}, t, dur);
    const ctr = Object.values(actors)[0] ? Object.values(actors)[0].root.position.clone().setY(0) : new THREE.Vector3();
    const sd = sun.userData.dir || (sun.userData.dir = sun.position.clone().normalize()); sun.target.position.copy(ctr); sun.position.copy(ctr).addScaledVector(sd, 45);
    stepFx(t, cam.position.clone().setY(0)); renderPost(t, fd, shot);
  },
};
// extras that would block the subject or pop into the lens at any point of the shot are hidden for the whole shot (no popping)
function hideBlockers(dur) {
  const c = shot.cam || {}, fwd = new THREE.Vector3(), hide = new Set();
  for (let i = 0; i <= 8; i++) {
    const ts = dur * i / 8;
    (shot.cast || []).forEach(k => { const a = actors[k.id]; if (a) a.root.position.copy(pathAt(a, k, moveU(k, ts, dur))); });
    stepNpcs(ts); const fd = camPose(c, ts, dur); cam.getWorldDirection(fwd); const cp = cam.position;
    npcs.forEach((n, j) => { const p = n.a.root.position, dx = p.x - cp.x, dy = p.y + 1.6 - cp.y, dz = p.z - cp.z, al = dx * fwd.x + dy * fwd.y + dz * fwd.z, pe = Math.sqrt(Math.max(dx * dx + dy * dy + dz * dz - al * al, 0));
      if (al > -0.5 && ((al < fd - 1.8 && pe < 1.25) || (al < 4.5 && pe < al * 0.75 + 0.9))) hide.add(j); });
  }
  c._sm = null; c._anchor = null; npcs.forEach((n, j) => { n.a.root.visible = !hide.has(j); });
}
function bake() {
  scene.updateMatrixWorld(true); const groups = new Map(), drop = [];
  scene.traverse(m => { if (m.isMesh && !m.isInstancedMesh && m.material && !Array.isArray(m.material) && !m.material.transparent && !m.userData.keep && m.parent && m.parent !== cam) { (groups.get(m.material) || groups.set(m.material, []).get(m.material)).push(m); drop.push(m); } });
  drop.forEach(m => m.parent.remove(m));
  groups.forEach((ms, mt) => {
    const geos = ms.map(m => { let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrixWorld); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); g.clearGroups(); return g; });
    for (let i = 0; i < geos.length; i += 3000) { const mg = mergeGeometries(geos.slice(i, i + 3000)); if (!mg) continue; const mm = new THREE.Mesh(mg, mt); mm.castShadow = ms.some(m => m.castShadow); mm.receiveShadow = true; scene.add(mm); }
    geos.forEach(g => g.dispose());
  });
}
window.ready = true;
