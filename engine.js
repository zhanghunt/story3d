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
// camera easing for moves that meet a cut: same S-curve, but still ~25% of cruise speed on the first/last frame,
// so a shot never freezes for a few frames before the cut (reads as a hitch at 60 fps)
const CUT_M = 0.12, CUT_E0 = ease(CUT_M), CUT_E1 = ease(1 - CUT_M);
const easeCut = (u) => (ease(CUT_M + (1 - 2 * CUT_M) * Math.min(Math.max(u, 0), 1)) - CUT_E0) / (CUT_E1 - CUT_E0);
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
function plane(w, d, m, x, y, z) { if (y > 0 && m.isMaterial) { m = m.clone(); m.polygonOffset = true; m.polygonOffsetFactor = -1 - Math.round(y * 60); m.polygonOffsetUnits = -2 - Math.round(y * 120); } const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; scene.add(p); return p; }
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
  const brow = { neutral: [0, 0], happy: [0, -4], grin: [0, -6], sad: [14, -6], cry: [18, -8], worried: [14, -4], angry: [-16, 8], determined: [-10, 5], shock: [0, -12], smug: [-4, 4], bored: [-3, 9] }[expr] || [0, 0];
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
    if (expr === 'bored') { const hw = eyes === 'round' ? 25 : 14, hh = eyes === 'round' ? 25 : 19; g.fillStyle = def.skin || '#f1c79f'; g.fillRect(x - hw, ey - hh, hw * 2, hh - 1); g.fillStyle = ink; rrect(g, x - hw + 1, ey - 3, hw * 2 - 2, 5, 2.5); g.fill(); } // heavy eyelids
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
  else if (expr === 'bored') { g.fillRect(mx - 13, my, 26, 5); }
  else { g.beginPath(); g.arc(mx, my - 26, 26, 0.35 * Math.PI, 0.65 * Math.PI); g.stroke(); }
  if (def.wrinkles) { // an aged face: forehead lines, crow's feet, smile lines
    g.strokeStyle = 'rgba(70,40,25,.55)'; g.lineWidth = 3.5; g.lineCap = 'round';
    [22, 34].forEach((y, i) => { g.beginPath(); g.moveTo(138 + i * 8, y); g.quadraticCurveTo(192, y - 6, 246 - i * 8, y); g.stroke(); });
    [[112, 1], [272, -1]].forEach(([x, d]) => { [-9, 0, 9].forEach(k => { g.beginPath(); g.moveTo(x + d * 6, ey + k * 0.6); g.lineTo(x - d * 10, ey + k * 1.6); g.stroke(); }); });
    [[-1, 1], [1, -1]].forEach(([sd]) => { g.beginPath(); g.moveTo(192 + sd * 34, 112); g.quadraticCurveTo(192 + sd * 44, 132, 192 + sd * 36, 152); g.stroke(); });
    ex.forEach(x => { g.beginPath(); g.arc(x, ey + 20, 16, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke(); });
  }
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
let MOSAIC = null;
function mosaicTex() { if (MOSAIC) return MOSAIC; MOSAIC = canvasTex(64, 64, (g, w, h) => { const r = prng(77); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const k = r(); g.fillStyle = k < 0.45 ? '#e8b48c' : k < 0.75 ? '#c98f68' : k < 0.9 ? '#f5d3b5' : '#8a5a3c'; g.fillRect(x * 8, y * 8, 8, 8); } }); MOSAIC.magFilter = THREE.NearestFilter; MOSAIC.minFilter = THREE.NearestFilter; return MOSAIC; }
function makeActor(id, def, isNpc = false) {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const hips = new THREE.Group(); hips.position.y = 2 * S; root.add(hips);
  const key = 'c' + hcode(JSON.stringify(def)), sz = isNpc ? 128 : 256;
  const tm = boxMats(key + 't', (f) => torsoFace(def, f === 0 || f === 1 ? 'side' : f === 2 ? 'top' : f === 3 ? 'bottom' : f === 4 ? 'front' : 'back'), [0, 1, 2, 3, 4, 5], sz);
  const chest = new THREE.Group(); hips.add(chest); // waist joint: torso, head and arms turn against the legs
  const torso = box(2 * S, 2 * S, 1 * S, tm, 0.03, 2); torso.position.y = S; chest.add(torso);
  const head = new THREE.Group(); head.position.y = 2 * S; chest.add(head);
  const skin = mat(def.skin || '#f1c79f', { roughness: 0.6 });
  const skull = new THREE.Mesh(headGeo(), skin); skull.castShadow = skull.receiveShadow = true; head.add(skull);
  const faceC = document.createElement('canvas'); faceC.width = FW; faceC.height = FH;
  const faceT = new THREE.CanvasTexture(faceC); faceT.colorSpace = SRGB; faceT.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.3745, 0.3745, 0.5, 28, 1, true, -75 * D2R, 150 * D2R), new THREE.MeshStandardMaterial({ map: faceT, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  face.position.y = 0.37; head.add(face); head.add(hair(def));
  const limb = (x, y, px, mats, par = hips) => { const g = new THREE.Group(); g.position.set(x, y, 0); const m = box(S, 2 * S, S, mats, 0.03, 2); m.position.y = px; g.add(m); par.add(g); return g; };
  const am = boxMats(key + 'a', (f) => armFace(def, f === 2 ? 'top' : f === 3 ? 'bottom' : 'side'), [0, 1, 2, 3, 4, 5], sz / 2);
  const armL = limb(1.5 * S, 1.5 * S, -0.5 * S, am, chest), armR = limb(-1.5 * S, 1.5 * S, -0.5 * S, am, chest);
  const lmL = boxMats(key + 'lL', (f) => legFace(def, f === 2 ? 'top' : f === 3 ? 'bottom' : f === 4 ? 'front' : f === 5 ? 'back' : 'side', 1), [0, 1, 2, 3, 4, 5], sz / 2);
  const lmR = boxMats(key + 'lR', (f) => legFace(def, f === 2 ? 'top' : f === 3 ? 'bottom' : f === 4 ? 'front' : f === 5 ? 'back' : 'side', -1), [0, 1, 2, 3, 4, 5], sz / 2);
  const legL = limb(0.5 * S, 0, -S, lmL), legR = limb(-0.5 * S, 0, -S, lmR);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.2), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.55 })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.renderOrder = 1; root.add(blob);
  root.scale.setScalar(def.scale || 1); scene.add(root);
  const skinM = mat(def.skin || '#f1c79f', { roughness: 0.6 }), fingers = [];
  // double-pinky hand: a curled fist (knuckle row + folded thumb) with one thin pinky sticking up from the inner edge,
  // so it reads as a pinky, not a thumb
  const knuckM = mat(new THREE.Color(def.skin || '#f1c79f').multiplyScalar(0.86).getStyle(), { roughness: 0.6 }), nailM = mat('#ffe6e0', { roughness: 0.35 });
  [[armL, -1], [armR, 1]].forEach(([arm, sx]) => {
    const h = new THREE.Group(); h.visible = false; arm.add(h); fingers.push(h);
    for (let i = 0; i < 3; i++) { const k = box(0.15, 0.15, 0.17, knuckM, 0.05); k.position.set(-sx * 0.04 - sx * i * 0.165 + sx * 0.1, -0.93, 0.14); h.add(k); } // curled fingers
    const th = box(0.34, 0.11, 0.12, knuckM, 0.04); th.position.set(-sx * 0.05, -0.86, 0.29); h.add(th); // thumb folded over the fist
    const pk = new THREE.Group(); pk.position.set(sx * 0.24, -0.86, 0.3); pk.rotation.y = sx * 0.3; h.add(pk);
    const f = box(0.075, 0.075, 0.4, skinM, 0.025); f.position.z = 0.2; pk.add(f);
    const nail = box(0.06, 0.03, 0.08, nailM, 0.01); nail.position.set(0, -0.04, 0.36); pk.add(nail);
  });
  const censor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), new THREE.MeshBasicMaterial({ map: mosaicTex(), toneMapped: false })); censor.position.set(0, -1.02, 0.12); censor.visible = false; armR.add(censor);
  return { id, def, root, hips, chest, head, armL, armR, legL, legR, faceC, faceT, faceKey: '', tag: null, tagKey: '', blob, fingers, censor };
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
  const n = s.crowd !== undefined ? s.crowd : ({ street: 12, school: 14, city: 18, park: 10, plaza: 70, square: 70, townsquare: 70 }[setName] || 0);
  const r = prng(SEED * 977 + 13), avoid = (s.cast || []).map(c => pathPts(c)[0]), blocked = (x, z) => NOGO.some(q => Math.hypot(q[0] - x, q[1] - z) < q[2]);
  VENDORS.forEach((v, i) => { const base = NPCPOOL[(v.i * 5 + 3) % NPCPOOL.length], def = { ...base, shirt_style: 'button', shirt: ['#f5f5f4', '#fde68a', '#bae6fd', '#fecaca'][v.i % 4], scale: 1 }; const a = makeActor('vendor' + i, def, true); npcs.push({ a, spec: { pos: v.pos, face: v.face, vendor: true }, ph: 5.6 + i * 0.83 }); });
  STREETWALK.forEach((w, i) => { const a = makeActor('sw' + i, NPCPOOL[(i * 11 + 2) % NPCPOOL.length], true); npcs.push({ a, spec: { walk: w }, ph: i * 1.37 }); });
  const free = (x, z) => avoid.every(p => Math.hypot(p.x - x, p.z - z) > 3.2);
  for (let i = 0; i < n; i++) {
    const def = NPCPOOL[(Math.floor(r() * 997) + i * 7) % NPCPOOL.length]; let spec;
    for (let tries = 0; tries < 12; tries++) {
      const kind = r();
      if (s.gather) { // audience packed around a focal point, facing it: [x, z, minR, maxR, dirDeg, arcDeg]
        const [gx, gz, r0 = 5, r1 = 24, dd = 0, arc = 150] = s.gather, a2 = (dd + (r() - 0.5) * arc) * D2R, d = Math.sqrt(lerp(r0 * r0, r1 * r1, r())), x = gx + Math.sin(a2) * d, z = gz + Math.cos(a2) * d;
        spec = { pos: [x, z], face: Math.atan2(gx - x, gz - z) / D2R + (r() - 0.5) * 30, cheer: r() < (s.cheer !== undefined ? s.cheer : 0.3) };
        if (Math.hypot(x, z + 12) < 6.5 || blocked(x, z) || npcs.some(o => o.spec.pos && Math.hypot(o.spec.pos[0] - x, o.spec.pos[1] - z) < 1.5)) continue;
      }
      else if (setName === 'plaza' || setName === 'square' || setName === 'townsquare') { const x = (r() - 0.5) * 70, z = (r() - 0.5) * 70, a2 = r() * Math.PI * 2, v = 0.8 + r() * 0.6; spec = kind < 0.55 ? { walk: [x, z, Math.sin(a2) * v, Math.cos(a2) * v] } : { pos: [x, z], face: r() * 360 }; if (blocked(x, z) || (spec.walk && (blocked(x + spec.walk[2] * 2.5, z + spec.walk[3] * 2.5) || blocked(x + spec.walk[2] * 5, z + spec.walk[3] * 5)))) continue; }
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
    const tt = t + n.ph, spd = s.walk ? Math.hypot(s.walk[2], s.walk[3]) : 0;
    const G = n.G || (n.G = (() => { a._gname = ['plain', 'plain', 'stride', 'glide', 'bouncy', 'shuffle', 'swagger', 'heavy', 'stride', 'glide'][Math.floor(n.ph * 7.3) % 10]; return gaitOf(a, null); })());
    const hr = n.hr || (n.hr = [(n.ph * 0.37) % 1, (n.ph * 0.73) % 1, (n.ph * 1.31) % 1, (n.ph * 2.17) % 1, (n.ph * 3.11) % 1]);
    a.legL.rotation.set(0, 0, 0); a.legR.rotation.set(0, 0, 0); a.armL.rotation.set(0, 0, 0.05); a.armR.rotation.set(0, 0, -0.05); a.hips.rotation.set(0, 0, 0); a.chest.rotation.set(0, 0, 0); a.head.rotation.set(0, 0, 0); a.hips.position.x = 0; a.legL.position.y = 0; a.legR.position.y = 0;
    if (moving) a.hips.position.y = 2 * S + gaitPose(a, spd * tt * 5.6 * G.cad / Math.pow(a.def.scale || 1, 0.6), 1, G, false);
    else { const ws = Math.tanh(2.4 * Math.sin((tt / (3.4 + hr[0] * 2.4) + hr[1]) * 6.2832)), br = Math.sin(tt * 1.6); a.hips.position.y = 2 * S + br * 0.008; a.hips.position.x = 0.045 * ws; a.hips.rotation.z = -0.03 * ws; a.chest.rotation.z = 0.04 * ws; a.chest.rotation.x = 0.012 * br; (ws > 0 ? a.legR : a.legL).rotation.z = (ws > 0 ? -0.05 : 0.05) * Math.abs(ws); }
    if (s.cheer && shot.crowd_act === 'pinky') { const k = Math.min(Math.max((t - (shot.crowd_at || 0) - ((n.a.root.id * 0.618) % 1) * 0.9) / 0.3, 0), 1); a.fingers.forEach(f => f.visible = k > 0.5); a.armL.rotation.set(-1.25 * k, 0, -0.78 * k); a.armR.rotation.set(-1.25 * k, 0, 0.78 * k); if (n.tg) n.tg.visible = k > 0.5; }
    else if (s.cheer) { const b = 0.5 + 0.5 * Math.sin(tt * 4.6); a.armL.rotation.set(0, 0, 2.35 + 0.2 * b); a.armR.rotation.set(0, 0, -2.35 - 0.2 * b); a.hips.position.y += b * 0.16; a.head.rotation.x = -0.1; }
    else if (!moving) { const gl = glance(tt, hr); a.head.rotation.y = gl[0] * 0.3; a.head.rotation.x = gl[1] * 0.06; a.chest.rotation.y = gl[0] * 0.08;
      if (hr[2] > 0.55) { const g = 0.5 + 0.5 * Math.sin(tt * 2.3 + hr[1] * 6), sel = Math.tanh(2.5 * Math.sin(tt * 1.7 + hr[0] * 6)), A = sel > 0 ? a.armR : a.armL; A.rotation.x = -(0.3 + 0.45 * g) * Math.abs(sel); A.rotation.z += (sel > 0 ? -1 : 1) * 0.15 * g; a.head.rotation.x += 0.04 * Math.sin(tt * 5.3); } // some are mid-conversation
      else a.armR.rotation.x = -0.2 * (0.5 + 0.5 * Math.sin(tt * 0.9)); }
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


// ---------- set dressing: flowers, grass tufts and litter on the ground; drifting clouds and flocks of birds in the sky ----------
function inst(geo, m, list, shadow) { // one draw call for many copies: [{p:[x,y,z], s, rx, ry, rz, c}]
  if (!list.length) return null; const im = new THREE.InstancedMesh(geo, m, list.length), d = new THREE.Object3D(), col = new THREE.Color();
  list.forEach((o, i) => { d.position.set(o.p[0], o.p[1], o.p[2]); d.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); const sc = o.s === undefined ? 1 : o.s; if (Array.isArray(sc)) d.scale.set(sc[0], sc[1], sc[2]); else d.scale.setScalar(sc); d.updateMatrix(); im.setMatrixAt(i, d.matrix); if (o.c) im.setColorAt(i, col.set(o.c)); });
  im.castShadow = !!shadow; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im;
}
const FLOWERC = ['#f472b6', '#facc15', '#f87171', '#a78bfa', '#ffffff', '#fb923c', '#60a5fa'], LEAFC = ['#c2702a', '#a8512a', '#d9a03a', '#8a5a2b', '#b8862e', '#7c8a3a'];
function dress(regions, seed = 1) { // regions: {x0, x1, z0, z1, y, kind: 'grass' | 'paved', dens}
  if (shot.dress === false) return; const r = prng(SEED * 53 + seed * 7), tu = [], stems = [], heads = [], leaves = [], paper = [], peb = [], cans = [];
  for (const g of regions) {
    const w = g.x1 - g.x0, d = g.z1 - g.z0, area = w * d, k = g.dens === undefined ? 1 : g.dens, y = g.y || 0, px = () => g.x0 + r() * w, pz = () => g.z0 + r() * d;
    if (g.kind === 'grass') {
      for (let i = 0, n = Math.min(1500, area * 0.85 * k); i < n; i++) tu.push({ p: [px(), y, pz()], s: [0.5 + r() * 0.6, 0.35 + r() * 0.6, 0.5 + r() * 0.6], ry: r() * 6.28, c: shade(r() > 0.5 ? '#66ab4c' : '#4f9440', (r() - 0.5) * 0.2) });
      for (let i = 0, n = Math.min(70, area * 0.028 * k); i < n; i++) { const cx = px(), cz = pz(), col = FLOWERC[Math.floor(r() * FLOWERC.length)]; for (let j = 0, m = 3 + Math.floor(r() * 6); j < m; j++) { const x = cx + (r() - 0.5) * 1.5, z = cz + (r() - 0.5) * 1.5, hh = 0.7 + r() * 0.7; if (x < g.x0 || x > g.x1 || z < g.z0 || z > g.z1) continue; stems.push({ p: [x, y, z], s: [1, hh, 1] }); heads.push({ p: [x, y + 0.3 * hh, z], s: 0.8 + r() * 0.6, ry: r() * 6.28, c: col }); } }
      for (let i = 0, n = area * 0.012 * k; i < n; i++) peb.push({ p: [px(), y + 0.02, pz()], s: [0.6 + r(), 0.4 + r() * 0.4, 0.6 + r()], ry: r() * 6.28 });
      for (let i = 0, n = area * 0.02 * k; i < n; i++) leaves.push({ p: [px(), y + 0.03, pz()], rx: -Math.PI / 2 + (r() - 0.5) * 0.5, rz: r() * 6.28, s: 0.7 + r() * 0.8, c: LEAFC[Math.floor(r() * LEAFC.length)] });
    } else {
      for (let i = 0, n = Math.min(260, area * 0.05 * k); i < n; i++) leaves.push({ p: [px(), y + 0.012 + r() * 0.01, pz()], rx: -Math.PI / 2 + (r() - 0.5) * 0.3, rz: r() * 6.28, s: 0.6 + r() * 0.8, c: LEAFC[Math.floor(r() * LEAFC.length)] });
      for (let i = 0, n = area * 0.006 * k; i < n; i++) paper.push({ p: [px(), y + 0.02, pz()], ry: r() * 6.28, rz: (r() - 0.5) * 0.5, s: [0.7 + r() * 0.8, 1, 0.7 + r() * 0.8], c: ['#f4f1e6', '#e8e2cf', '#f7d9a8', '#cfe3f2'][Math.floor(r() * 4)] });
      for (let i = 0, n = area * 0.004 * k; i < n; i++) peb.push({ p: [px(), y + 0.02, pz()], s: [0.5 + r() * 0.6, 0.4, 0.5 + r() * 0.6], ry: r() * 6.28 });
      for (let i = 0, n = area * 0.0012 * k; i < n; i++) cans.push({ p: [px(), y + 0.04, pz()], rz: Math.PI / 2, ry: r() * 6.28, c: ['#dc2626', '#2563eb', '#16a34a', '#d4d4d8'][Math.floor(r() * 4)] });
    }
  }
  const white = (o = {}) => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, ...o });
  const tg = new THREE.ConeGeometry(0.1, 0.34, 4); tg.translate(0, 0.17, 0); inst(tg, white({ flatShading: true }), tu);
  const sg = new THREE.CylinderGeometry(0.012, 0.016, 0.3, 4); sg.translate(0, 0.15, 0); inst(sg, white({ color: '#3f8a35' }), stems);
  inst(new THREE.IcosahedronGeometry(0.08, 0), white({ flatShading: true, roughness: 0.7 }), heads);
  inst(new THREE.PlaneGeometry(0.2, 0.13), white({ side: THREE.DoubleSide }), leaves);
  inst(new THREE.BoxGeometry(0.24, 0.012, 0.18), white(), paper); inst(new THREE.IcosahedronGeometry(0.07, 0), white({ color: '#9a958c', flatShading: true }), peb);
  inst(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), white({ metalness: 0.6, roughness: 0.35 }), cans, true);
}
let SKYFX = null;
function buildSky(time, setName) {
  SKYFX = null; if (['room', 'classroom', 'studio', 'stage', 'space'].includes(setName) || shot.sky === false) return;
  const r = prng(4711), p = SKY.p, night = time === 'night', puffs = [], fx = { clouds: null, birds: [], drops: null, pig: [] };
  for (let i = 0; i < 40; i++) { // cloud banks: a few flattened puffs each, all around and at several heights
    const ang = r() * 6.2832, rad = 100 + r() * 330, cx = Math.cos(ang) * rad, cz = Math.sin(ang) * rad, cy = 38 + r() * 60 + rad * 0.13, sc = 9 + r() * 15, n = 5 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) puffs.push({ p: [cx + (k - n / 2) * sc * 0.55 + (r() - 0.5) * sc * 0.4, cy + (r() - 0.25) * sc * 0.28, cz + (r() - 0.5) * sc * 0.8], s: [sc * (0.7 + r() * 0.5), sc * (0.36 + r() * 0.2), sc * (0.6 + r() * 0.4)], ry: r() * 6.28 });
  }
  const cc = new THREE.Color().setRGB(p.cloud[0], p.cloud[1], p.cloud[2], SRGB);
  const cm = new THREE.MeshStandardMaterial({ color: cc, roughness: 1, emissive: cc, emissiveIntensity: night ? 0.2 : 0.5, fog: false });
  const im = inst(new THREE.IcosahedronGeometry(1, 2), cm, puffs); if (im) { im.receiveShadow = false; const g = new THREE.Group(); scene.remove(im); g.add(im); scene.add(g); fx.clouds = g; }
  const nf = night ? 0 : (shot.birds !== undefined ? shot.birds : 6), bm = new THREE.MeshBasicMaterial({ color: night ? '#0c0e14' : '#23252d', side: THREE.DoubleSide });
  if (nf) {
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.2, 0, 0, 0.24, 0.85, 0, 0.0, 0.85, 0, 0.0, 0, 0, 0.24, 1.25, 0, 0.22]), 3)); wg.computeVertexNormals();
    for (let f = 0; f < nf; f++) { const a = (r() - 0.5) * 0.9 + (r() > 0.5 ? 0 : Math.PI), n = 5 + Math.floor(r() * 7);
      const F = { dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), c: new THREE.Vector3(CENTER.x + (r() - 0.5) * 70, 15 + r() * 30, CENTER.z - 18 - r() * 110), v: 7 + r() * 5, s0: r() * 260, hz: 2.2 + r() * 1.2, off: [] };
      for (let k = 0; k < n; k++) { const row = Math.ceil(k / 2), sd = k % 2 ? 1 : -1; F.off.push([sd * row * 1.15 + (r() - 0.5) * 0.5, (r() - 0.5) * 0.7, -row * 1.0 + (r() - 0.5) * 0.4, r() * 6.28]); }
      fx.birds.push(F); }
    const total = fx.birds.reduce((q, F) => q + F.off.length, 0), bg = new THREE.OctahedronGeometry(1, 0), z0 = Array.from({ length: total }, () => ({ p: [0, -50, 0] }));
    fx.body = inst(bg, bm, z0); fx.wl = inst(wg, bm, z0); fx.wr = inst(wg, bm, z0); [fx.body, fx.wl, fx.wr].forEach(m => { m.castShadow = false; m.receiveShadow = false; });
  }
  if (setName === 'plaza' || setName === 'square' || setName === 'townsquare' || setName === 'park') { // pigeons pecking about
    const rr = prng(SEED * 19 + 3), cz = setName === 'park' ? -6 : 0, list = []; for (let i = 0; i < 16; i++) { const cl = Math.floor(i / 4), bx = [-7, 8, -3, 12][cl] + (rr() - 0.5) * 3, bz = cz + [-4, -6, 11, 8][cl] + (rr() - 0.5) * 3; list.push({ x: bx, z: bz, ry: rr() * 6.28, ph: rr() * 6.28 }); }
    const ok = list.filter(o => (shot.cast || []).every(c => { const q = pathPts(c)[0]; return Math.hypot(q.x - o.x, q.z - o.z) > 2.2; }));
    const gm = new THREE.MeshStandardMaterial({ color: '#8d93a3', roughness: 0.8 }), hm = new THREE.MeshStandardMaterial({ color: '#5d6475', roughness: 0.7 });
    fx.pig = ok; fx.pb = inst(new THREE.IcosahedronGeometry(1, 1), gm, ok.map(o => ({ p: [o.x, 0.14, o.z], s: [0.1, 0.1, 0.17], ry: o.ry })), true); fx.ph = inst(new THREE.IcosahedronGeometry(1, 1), hm, ok.map(() => ({ p: [0, -9, 0] })));
  }
  if (FOUNT) { const dm = new THREE.MeshStandardMaterial({ color: '#d7f0ff', roughness: 0.1, emissive: '#9fd8ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }); fx.drops = inst(new THREE.IcosahedronGeometry(0.07, 0), dm, Array.from({ length: 90 }, () => ({ p: [0, -9, 0] }))); if (fx.drops) fx.drops.receiveShadow = false; }
  SKYFX = fx;
}
const _so = new THREE.Object3D();
function stepSky(t) {
  const fx = SKYFX; if (!fx) return; const T = TC + t; _so.rotation.order = 'YXZ';
  if (fx.clouds) fx.clouds.position.set(T * 1.1, 0, T * 0.25);
  if (fx.body) { let i = 0; for (const F of fx.birds) { const span = 260, along = ((F.s0 + T * F.v) % span) - span / 2, yaw = Math.atan2(F.dir.x, F.dir.z), rx = F.dir.z, rz = -F.dir.x;
    for (const o of F.off) { const gl = 0.5 + 0.5 * Math.sin(T * 0.45 + o[3]), flap = Math.sin(T * F.hz * 6.2832 + o[3]) * 0.75 * smooth(0.25, 0.5, gl) + 0.12;
      const x = F.c.x + F.dir.x * (along + o[2]) + rx * o[0], z = F.c.z + F.dir.z * (along + o[2]) + rz * o[0], y = F.c.y + o[1] + Math.sin(T * 1.1 + o[3]) * 0.35 - Math.sin(T * F.hz * 6.2832 + o[3]) * 0.06;
      _so.position.set(x, y, z); _so.rotation.set(0, yaw, 0); _so.scale.set(0.13, 0.1, 0.42); _so.updateMatrix(); fx.body.setMatrixAt(i, _so.matrix);
      _so.rotation.set(0, yaw, flap); _so.scale.set(1, 1, 1); _so.updateMatrix(); fx.wl.setMatrixAt(i, _so.matrix);
      _so.rotation.set(0, yaw, -flap); _so.scale.set(-1, 1, 1); _so.updateMatrix(); fx.wr.setMatrixAt(i, _so.matrix); i++; } }
    fx.body.instanceMatrix.needsUpdate = fx.wl.instanceMatrix.needsUpdate = fx.wr.instanceMatrix.needsUpdate = true; }
  if (fx.ph) { fx.pig.forEach((o, i) => { const pk = Math.pow(Math.max(0, Math.sin(T * 2.6 + o.ph)), 6), hop = Math.max(0, Math.sin(T * 0.7 + o.ph * 2)) > 0.97 ? 0.04 : 0; _so.rotation.set(0, o.ry, 0); _so.scale.setScalar(0.065); _so.position.set(o.x + Math.sin(o.ry) * (0.15 + 0.05 * pk), 0.27 - 0.16 * pk + hop, o.z + Math.cos(o.ry) * (0.15 + 0.05 * pk)); _so.updateMatrix(); fx.ph.setMatrixAt(i, _so.matrix); }); fx.ph.instanceMatrix.needsUpdate = true; }
  if (fx.drops && FOUNT) { const n = fx.drops.count; for (let i = 0; i < n; i++) { const ph = (T * 0.9 + i / n * 7.31) % 1, a = i * 2.39996, v = 1.6 + (i % 5) * 0.22, rr = v * ph * 1.9, y = FOUNT[1] + 3.2 * ph - 6.2 * ph * ph; _so.rotation.set(0, 0, 0); _so.scale.setScalar(0.8 + (i % 3) * 0.3); _so.position.set(FOUNT[0] + Math.cos(a) * rr, Math.max(y, 0.9), FOUNT[2] + Math.sin(a) * rr); _so.updateMatrix(); fx.drops.setMatrixAt(i, _so.matrix); } fx.drops.instanceMatrix.needsUpdate = true; }
}

// ---------- sets ----------
let FOUNT = null, NOGO = [], VENDORS = [];
const solids = [];
function solid(o) { scene.add(o); o.updateMatrixWorld(true); solids.push(new THREE.Box3().setFromObject(o).expandByScalar(0.3)); return o; }
const _ray = new THREE.Ray(), _hit = new THREE.Vector3();
let UB = null; // smoothed "pull the camera in front of a wall" amount, so occlusion fixes glide instead of teleporting
function unblock(look, t, off) {
  const d = cam.position.distanceTo(look); let best = d;
  _ray.origin.copy(look); _ray.direction.subVectors(cam.position, look).normalize();
  for (const b of solids) { if (b.containsPoint(look)) continue; if (_ray.intersectBox(b, _hit)) { const h = _hit.distanceTo(look); if (h < best) best = h; } }
  const want = best < d && !off ? Math.max(best - 0.6, 1.2) / d : 1; // fraction of the distance to keep
  if (t === undefined || !UB || t <= UB.t || t - UB.t > 0.1) UB = { t, q: want, r: want };
  else { // two cascaded smoothers (so speed changes are gradual too): pull in quickly, let go slowly
    const dt = t - UB.t, tau = want < UB.q ? 0.06 : 0.3; UB.q += (want - UB.q) * (1 - Math.exp(-dt / tau)); UB.r += (UB.q - UB.r) * (1 - Math.exp(-dt / tau)); UB.t = t; UB.r = Math.min(UB.r, 1); }
  if (UB.r < 0.999) cam.position.copy(look).addScaledVector(_ray.direction, d * UB.r);
}
const lamps = [], CENTER = new THREE.Vector3();
const clutter = []; // thin set dressing that may be hidden for a shot when it blocks the lens or the subject
const lampKeep = (l, kind = 'lamp') => { l.traverse(m => { if (m.isMesh) m.userData.keep = true; }); l.userData.kind = kind; clutter.push(l); return l; };
function ground(painter = P.grass, key = 'grass', rep = 4) { const gm = tmat(key, 512, 512, painter, 3000 / rep / 2, 3000 / rep / 2, { roughness: 0.95 }).clone(); gm.polygonOffset = true; gm.polygonOffsetFactor = 4; gm.polygonOffsetUnits = 8; const g = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), gm); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g); }
function horizon(r0 = 140, skip = null) { // distant tree line + hills so the world never ends
  const r = prng(99); const tm = mat('#2f6b3a', { flatShading: true }), pm = mat('#2a5e35', { flatShading: true });
  for (let i = 0; i < 160; i++) { const a = i / 160 * Math.PI * 2 + r() * 0.03, rad = r0 + r() * 70; const s = 6 + r() * 6; const c = new THREE.Mesh(r() > 0.5 ? new THREE.ConeGeometry(s * 0.45, s * 1.6, 7) : new THREE.IcosahedronGeometry(s * 0.6, 0), r() > 0.5 ? tm : pm); c.position.set(Math.cos(a) * rad, s * 0.6, Math.sin(a) * rad); if (skip && skip(c.position.x, c.position.z)) continue; scene.add(c); }
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
    if (k % 2 === 0) { const l = lamp(); l.position.set(x + 3, 0.18, -5.2); l.rotation.y = Math.PI / 2; scene.add(lampKeep(l)); lamps.push(l); } // far side only: near-side poles block the camera
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
  { const cx0 = CENTER.x; dress([{ x0: cx0 - 46, x1: cx0 + 46, z0: -15.5, z1: -8.2, kind: 'grass' }, { x0: cx0 - 46, x1: cx0 + 46, z0: 8.0, z1: 17, kind: 'grass' }, { x0: cx0 - 46, x1: cx0 + 46, z0: -7.7, z1: -4.9, y: 0.18, kind: 'paved', dens: 0.9 }, { x0: cx0 - 46, x1: cx0 + 46, z0: 4.9, z1: 7.7, y: 0.18, kind: 'paved', dens: 0.9 }, { x0: cx0 - 46, x1: cx0 + 46, z0: -4.3, z1: -3.3, y: 0.02, kind: 'paved', dens: 1.2 }, { x0: cx0 - 46, x1: cx0 + 46, z0: 3.3, z1: 4.3, y: 0.02, kind: 'paved', dens: 1.2 }], 1); }
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
    if (k % 2 === 0) { const l = lamp(); l.position.set(sd * 5.6, 0.18, z + 5); l.rotation.y = sd > 0 ? Math.PI : 0; scene.add(lampKeep(l)); lamps.push(l); const t = tree('round', k * 7 + sd); t.scale.multiplyScalar(0.7); t.position.set(sd * 6.2, 0.18, z - 3); scene.add(t); }
  });
  const nt = shot.traffic !== undefined ? shot.traffic : 4; for (let i = 0; i < nt; i++) { const c = car(CLOTH[Math.floor(R() * CLOTH.length)]); const dir = i % 2 ? 1 : -1; c.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(c); cars.push({ o: c, axis: 'z', lane: dir * -2.2, x0: (R() - 0.5) * 200, v: dir * (8 + R() * 4) }); }
  horizon(240);
}
function parkSet() {
  ground(); const cob = tmat('cobble', 256, 256, P.cobble, 100, 1.2);
  plane(400, 4, cob, 0, 0.02, -1); const R = prng(SEED * 7 + 3);
  for (let i = 0; i < 70; i++) { const x = (R() - 0.5) * 140, z = (R() > 0.5 ? 1 : -1) * (5 + R() * 40), kind = R() > 0.7 ? 'pine' : 'round'; if (z > 0 && z < 20 && Math.abs(x - CENTER.x) < 15) continue; solid(at(tree(kind, i, 1.1), x, 0, z)); } // no trees in the strip where cameras stand
  for (let x = -40; x <= 40; x += 10) { const b = bench(); b.position.set(x + 3, 0, -4); scene.add(b); const l = lamp(); l.position.set(x - 2, 0, 1.6); l.rotation.y = -Math.PI / 2; scene.add(lampKeep(l)); lamps.push(l); }
  for (let i = 0; i < 18; i++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), mat(['#f472b6', '#facc15', '#f87171', '#a78bfa', '#ffffff'][i % 5], { flatShading: true })); f.position.set((R() - 0.5) * 50, 0.25, 2.6 + R() * 1.5); scene.add(f); }
  const fn = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.8, 32), tmat('curb', 128, 128, P.curb, 6, 1)); fn.position.set(0, 0.4, -14); scene.add(fn);
  const wtr = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.1, 32), mat('#4aa3df', { roughness: 0.1, metalness: 0.2 })); wtr.position.set(0, 0.79, -14); scene.add(wtr);
  { const cx0 = CENTER.x; dress([{ x0: cx0 - 44, x1: cx0 + 44, z0: -30, z1: -3.2, kind: 'grass' }, { x0: cx0 - 44, x1: cx0 + 44, z0: 1.2, z1: 20, kind: 'grass' }, { x0: cx0 - 44, x1: cx0 + 44, z0: -2.9, z1: 0.9, y: 0.02, kind: 'paved', dens: 1.1 }], 2); }
  horizon();
}
function stripes(c1, c2, n = 6) { return (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? c1 : c2; g.fillRect(Math.floor(i * w / n), 0, Math.ceil(w / n) + 1, h); } }; }
const STALLS = [['FRUIT', '#d94b3d'], ['FLOWERS', '#be185d'], ['BREAD', '#b45309'], ['BALLOONS', '#2f6fb3'], ['TOYS', '#7d4fb3'], ['LEMONADE', '#ca8a04'], ['BOOKS', '#0f766e'], ['VEGGIES', '#2e8b57'], ['HONEY', '#d97706'], ['HATS', '#334155']];
function stall(i, name) { // market stall facing +z: posts, striped canopy, counter, goods and a sign (about 3.6 wide, 2.4 deep)
  const g = new THREE.Group(), r = prng(i * 31 + 9), def = STALLS.find(q => q[0] === name) || STALLS[i % STALLS.length], kind = def[0], col = def[1], wood = tmat('wood', 256, 256, P.wood, 1, 0.5), add = (o, x, y, z) => { o.position.set(x, y, z); g.add(o); return o; };
  [[-1.65, -1], [1.65, -1], [-1.65, 1.05], [1.65, 1.05]].forEach(([x, z]) => add(box(0.1, z > 0 ? 2.45 : 2.85, 0.1, '#6b4a2f', 0.02), x, (z > 0 ? 2.45 : 2.85) / 2, z));
  add(box(3.5, 0.95, 0.85, wood, 0.03), 0, 0.475, 0.75); add(box(3.5, 0.1, 1.0, '#8a5f3a', 0.02), 0, 0.99, 0.75); add(box(3.5, 1.5, 0.45, wood, 0.03), 0, 0.75, -0.85);
  const cv = add(box(3.9, 0.07, 2.7, tmat('stripe' + col, 128, 16, stripes(col, '#f7f3ea', 8), 1, 1, { roughness: 0.85 }), 0.02), 0, 2.68, 0.05); cv.rotation.x = 0.19;
  add(box(3.9, 0.32, 0.05, tmat('stripe' + col, 128, 16, stripes(col, '#f7f3ea', 8), 1, 1, { roughness: 0.85 }), 0.01), 0, 2.27, 1.4);
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.5), new THREE.MeshStandardMaterial({ map: canvasTex(500, 100, textPanel(kind, '#1f2937', '#fff7cc')), roughness: 0.7 })); add(sg, 0, 2.95, 1.36);
  const ball = (rad, c, x, y, z) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 1), mat(c, { roughness: 0.55 })); m.castShadow = true; return add(m, x, y, z); };
  const crate = (x, cols) => { add(box(0.95, 0.22, 0.62, '#a9794a', 0.02), x, 1.15, 0.75); for (let k = 0; k < 10; k++) ball(0.105, cols[k % cols.length], x - 0.34 + (k % 5) * 0.17, 1.3 + (k % 2) * 0.03, 0.62 + Math.floor(k / 5) * 0.24); };
  if (kind === 'FRUIT') { crate(-1.1, ['#dc2626', '#ef4444']); crate(0, ['#f59e0b', '#fbbf24']); crate(1.1, ['#84cc16', '#a3e635']); }
  else if (kind === 'VEGGIES') { crate(-1.1, ['#16a34a', '#22c55e']); crate(0, ['#ea580c', '#f97316']); crate(1.1, ['#7c3aed', '#dc2626']); }
  else if (kind === 'FLOWERS') for (let k = 0; k < 6; k++) { const x = -1.35 + k * 0.54, c = FLOWERC[(k + i) % FLOWERC.length]; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.36, 10), mat('#64748b', { roughness: 0.5, metalness: 0.3 })); add(b, x, 1.22, 0.75); for (let j = 0; j < 6; j++) ball(0.085, c, x + (r() - 0.5) * 0.26, 1.52 + r() * 0.16, 0.75 + (r() - 0.5) * 0.26); }
  else if (kind === 'BREAD') { for (let k = 0; k < 7; k++) add(box(0.36, 0.17, 0.2, ['#c98a4b', '#b9773a', '#d9a066'][k % 3], 0.08), -1.3 + k * 0.43, 1.13, 0.62 + (k % 2) * 0.24); for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), mat('#d9a066')); m.rotation.z = 0.5; add(m, -0.9 + k * 0.6, 1.9, -0.78); } }
  else if (kind === 'BALLOONS') { for (let k = 0; k < 11; k++) { const x = 1.9 + (r() - 0.5) * 1.1, y = 3.1 + r() * 1.5, z = 1.0 + (r() - 0.5) * 0.9, c = CLOTH[[0, 1, 3, 4, 5, 9, 2][k % 7]]; const b = ball(0.3, c, x, y, z); b.scale.y = 1.2; const st = box(0.012, y - 1.2, 0.012, '#e5e7eb', 0); add(st, 1.9 + (x - 1.9) * 0.5, 1.2 + (y - 1.2) / 2, 1.0 + (z - 1.0) * 0.5); st.castShadow = false; } add(box(0.5, 0.4, 0.5, '#475569', 0.04), 1.9, 0.2, 1.0); for (let k = 0; k < 4; k++) ball(0.16, CLOTH[k], -1.1 + k * 0.6, 1.2, 0.75); }
  else if (kind === 'TOYS') { for (let k = 0; k < 8; k++) add(box(0.3, 0.3, 0.3, CLOTH[(k * 3 + i) % CLOTH.length], 0.05), -1.4 + k * 0.4, 1.19, 0.6 + (k % 2) * 0.26); ball(0.2, '#f2c230', 0, 1.9, -0.8); ball(0.16, '#d94b3d', 0.8, 1.86, -0.8); add(box(0.4, 0.5, 0.25, '#2f6fb3', 0.06), -0.8, 1.95, -0.8); }
  else if (kind === 'BOOKS') { for (let k = 0; k < 6; k++) for (let j = 0; j < 2 + (k % 3); j++) add(box(0.4, 0.07, 0.3, CLOTH[(k + j * 2 + i) % CLOTH.length], 0.01), -1.3 + k * 0.52, 1.08 + j * 0.075, 0.75).rotation.y = (r() - 0.5) * 0.3; }
  else if (kind === 'LEMONADE') { const j = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 14), mat('#fde047', { roughness: 0.15, emissive: '#a16207', emissiveIntensity: 0.25 })); add(j, -0.9, 1.4, 0.75); for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.17, 10), mat('#fef9c3')); add(c, -0.1 + k * 0.25, 1.12, 0.75); } for (let k = 0; k < 5; k++) ball(0.1, '#facc15', 0.9 + (k % 3) * 0.2, 1.14 + Math.floor(k / 3) * 0.14, 0.9); }
  else if (kind === 'HONEY') { for (let k = 0; k < 9; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 10), mat('#f59e0b', { roughness: 0.2, emissive: '#92400e', emissiveIntensity: 0.3 })); add(c, -1.3 + (k % 5) * 0.32 + Math.floor(k / 5) * 0.16, 1.15 + Math.floor(k / 5) * 0.22, 0.75); } }
  else for (let k = 0; k < 6; k++) { const hgt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 12), mat(CLOTH[(k * 2 + 1) % CLOTH.length])); add(hgt, -1.3 + k * 0.52, 1.2, 0.75); const br = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 14), hgt.material); add(br, -1.3 + k * 0.52, 1.1, 0.75); }
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return g;
}
function parasolTable(i) { const g = new THREE.Group(), col = CLOTH[(i * 3 + 1) % CLOTH.length]; const t = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 16), mat('#e7e2d6')); t.position.y = 0.95; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.0, 8), mat('#52525b', { metalness: 0.5 })); leg.position.y = 1.5;
  const um = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 10), tmat('stripe' + col, 128, 16, stripes(col, '#f7f3ea', 8), 1, 1, { roughness: 0.85, flatShading: true })); um.position.y = 3.05; g.add(t, leg, um);
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + i, c = box(0.45, 0.5, 0.45, '#8a5f3a', 0.04); c.position.set(Math.cos(a) * 1.05, 0.25, Math.sin(a) * 1.05); g.add(c); } g.traverse(m => { if (m.isMesh) m.castShadow = true; }); return g; }
function planter(i, w = 1.5) { const g = new THREE.Group(), r = prng(i * 13 + 2); const b = box(w, 0.55, w, tmat('curb', 128, 128, P.curb, 1, 0.5), 0.05); b.position.y = 0.275; g.add(b); const soil = box(w - 0.2, 0.06, w - 0.2, '#4a3524', 0); soil.position.y = 0.55; g.add(soil);
  for (let k = 0; k < 4; k++) { const bu = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + r() * 0.12, 1), mat(shade('#3c8f43', (r() - 0.5) * 0.15), { flatShading: true })); bu.position.set((r() - 0.5) * (w - 0.6), 0.78, (r() - 0.5) * (w - 0.6)); bu.castShadow = true; g.add(bu); }
  for (let k = 0; k < 9; k++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), mat(FLOWERC[(k + i) % FLOWERC.length], { flatShading: true, roughness: 0.6 })); f.position.set((r() - 0.5) * (w - 0.3), 0.98 + r() * 0.18, (r() - 0.5) * (w - 0.3)); g.add(f); } return g; }
function bunting(a, b, sag = 0.9, n = 16) { // a string of little flags between two points
  const g = new THREE.Group(), d = new THREE.Vector3().subVectors(b, a), ry = Math.atan2(d.x, d.z) + Math.PI / 2;
  for (let i = 0; i <= n; i++) { const u = i / n, q = new THREE.Vector3().lerpVectors(a, b, u); q.y -= Math.sin(u * Math.PI) * sag; if (i < n) { const u2 = (i + 1) / n, q2 = new THREE.Vector3().lerpVectors(a, b, u2); q2.y -= Math.sin(u2 * Math.PI) * sag; const seg = box(0.015, 0.015, q.distanceTo(q2), '#3f3f46', 0); seg.position.lerpVectors(q, q2, 0.5); seg.lookAt(q2); seg.castShadow = false; g.add(seg); }
    if (i && i < n) { const fg = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.34, 3), mat(CLOTH[[0, 3, 1, 9, 2, 5, 4][i % 7]], { roughness: 0.8, side: THREE.DoubleSide, flatShading: true })); fg.scale.z = 0.12; fg.position.set(q.x, q.y - 0.19, q.z); fg.rotation.set(Math.PI, ry, 0); g.add(fg); } }
  return g;
}
function avenue(dx, dz, R) { // a street leaving the square and running out of sight, lined with shops on both sides
  const px = -dz, pz = dx, len = 380, from = 40, asph = tmat('asphalt', 512, 512, P.asphalt, 2, 60, { roughness: 0.9 }), slab = tmat('slab', 128, 128, P.slab, 1.5, 180), bc = ['#a9714f', '#c2a27e', '#b88a6a', '#96816b', '#c9b79c', '#8c5a44', '#9c6b5a', '#b7a089'], shops = ['CAFE', 'BAKERY', 'BOOKS', 'TOYS', 'MARKET', 'BANK', 'DINER', 'FLOWERS', 'ARCADE', 'PIZZA', 'TAILOR', 'BIKES', 'MUSIC', 'TEA'];
  const mid = from + len / 2, ry = Math.atan2(dx, dz), put = (o, along, side, y = 0) => { o.position.set(dx * along + px * side, y, dz * along + pz * side); return o; };
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, len), asph.clone()); road.material.polygonOffset = true; road.material.polygonOffsetFactor = -2; road.material.polygonOffsetUnits = -4; road.rotation.set(-Math.PI / 2, 0, -ry); put(road, mid, 0, 0.02); road.receiveShadow = true; scene.add(road);
  for (let a2 = from + 3; a2 < from + len; a2 += 6) { const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 2.6), mat('#f2c94c', { roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 })); ln.rotation.set(-Math.PI / 2, 0, -ry); put(ln, a2, 0, 0.03); scene.add(ln); }
  [-1, 1].forEach(sd => { const sw = box(2.6, 0.16, len, slab, 0, 1); sw.rotation.y = ry; put(sw, mid, sd * 5.8, 0.08); sw.castShadow = false; scene.add(sw);
    for (let a2 = from + 17, k = 0; a2 < from + 300; a2 += 12.4, k++) { const h = 8 + R() * 13, colr = bc[Math.floor(R() * bc.length)], b = box(12, h, 10, tmat('facade' + colr, 512, 512, facade(colr), 3, h / 8), 0.02, 1); b.rotation.y = ry + (sd > 0 ? -Math.PI / 2 : Math.PI / 2); put(b, a2, sd * 12.2, h / 2); solid(b);
      if (a2 < from + 150) { const fr = ry + (sd > 0 ? -Math.PI / 2 : Math.PI / 2), sg = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2), new THREE.MeshStandardMaterial({ map: canvasTex(768, 140, textPanel(shops[Math.floor(R() * shops.length)], '#1f2937', '#fff7cc')) })); sg.rotation.y = fr; put(sg, a2, sd * 7.14, 4.3); scene.add(sg);
        const aw = box(8, 0.12, 1.5, tmat('stripe' + colr, 128, 16, stripes(CLOTH[Math.floor(R() * CLOTH.length)], '#f7f3ea', 8), 1, 1, { roughness: 0.85 }), 0.02); aw.rotation.set(0, fr, 0); put(aw, a2, sd * 6.5, 3.35); scene.add(aw); }
      if (k % 2 === 0 && a2 < from + 200) { const l = lamp(); l.rotation.y = ry + (sd > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI / 2; put(l, a2 + 5, sd * 5.2, 0.16); scene.add(l); }
      if (k % 2 === 1 && a2 < from + 220) { const t = tree('round', k * 7 + (sd > 0 ? 3 : 11) + Math.round(dx * 5 + dz * 9), 0.8); put(t, a2 + 5, sd * 5.9, 0.16); scene.add(t); } }
    for (let a2 = from + 14 + R() * 10; a2 < from + 170; a2 += 9 + R() * 16) { const c = car(CLOTH[Math.floor(R() * CLOTH.length)]); c.rotation.y = ry - Math.PI / 2 + (sd > 0 ? 0 : Math.PI); put(c, a2, sd * 3.3, 0.02); scene.add(c); } });
  if (!shot.gather) for (let k = 0; k < 9; k++) { const a2 = from + 6 + R() * 110, sd = R() > 0.5 ? 1 : -1, dir = R() > 0.5 ? 1 : -1, v = 0.9 + R() * 0.6; STREETWALK.push([dx * a2 + px * sd * 5.8, dz * a2 + pz * sd * 5.8, dx * dir * v, dz * dir * v]); }
}
let STREETWALK = [];
function plazaSet(text) {
  // A market square: cobbles, a fountain, stalls and their keepers, cafe tables, planters, bunting, a clock tower -
  // and four streets that leave the square and run out of sight between rows of shops.
  ground(); const cob = tmat('cobble', 256, 256, P.cobble, 36, 36), R = prng(SEED * 11 + 5), R2 = prng(4243);
  plane(82, 82, cob, 0, 0.015, 0); NOGO = []; VENDORS = []; STREETWALK = [];
  const curbM = tmat('curb', 128, 128, P.curb, 8, 1), stone = tmat('curb', 128, 128, P.curb, 2, 2);
  const fn = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.8, 1.0, 40), curbM); fn.position.set(0, 0.5, -12); scene.add(fn); solids.push(new THREE.Box3().setFromObject(fn));
  const wtr = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 0.1, 40), mat('#4aa3df', { roughness: 0.08, metalness: 0.2 })); wtr.position.set(0, 0.99, -12); scene.add(wtr);
  [[0.55, 0.75, 3.0, 2.0], [1.7, 1.9, 0.28, 3.1], [0.3, 0.42, 1.2, 3.8], [0.85, 1.0, 0.22, 4.4]].forEach(([r1, r2, h, y]) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 20), stone); c.position.set(0, y, -12); c.castShadow = true; scene.add(c); });
  [[1.55, 3.27], [0.72, 4.53]].forEach(([rr, y]) => { const w2 = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 0.06, 20), mat('#4aa3df', { roughness: 0.08, metalness: 0.2 })); w2.position.set(0, y, -12); scene.add(w2); });
  FOUNT = [0, 4.5, -12]; NOGO.push([0, -12, 6.2]);
  const shops = ['CAFE', 'BAKERY', 'BOOKS', 'TOYS', 'MARKET', 'BANK', 'DINER', 'FLOWERS', 'ARCADE', 'PIZZA'], bc = ['#a9714f', '#c2a27e', '#b88a6a', '#96816b', '#c9b79c', '#8c5a44'];
  for (let side = 0; side < 4; side++) for (const i of [-3, -2, -1, 1, 2, 3]) { // the ring of shops around the square, with a gap on every side where a street leaves
    const h = (side === 3 ? 6 + R() * 4 : 9 + R() * 12), w = 12, colr = bc[Math.floor(R() * bc.length)], fm = tmat('facade' + colr, 512, 512, facade(colr), 3, h / 8);
    const b = box(w, h, 10, fm, 0.02, 1), ang = [0, Math.PI / 2, -Math.PI / 2, Math.PI][side], d = 46, off = Math.sign(i) * (0.6 + Math.abs(i) * 12.4);
    const px = side === 0 ? off : side === 1 ? -d : side === 2 ? d : off, pz = side === 0 ? -d : side === 3 ? d : off;
    b.position.set(px, h / 2, pz); b.rotation.y = ang; solid(b);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2), new THREE.MeshStandardMaterial({ map: canvasTex(768, 140, textPanel(shops[Math.floor(R() * shops.length)], '#1f2937', '#fff7cc')) }));
    const n = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)); sg.position.set(px + n.x * 5.05, 4.2, pz + n.z * 5.05); sg.rotation.y = ang; scene.add(sg);
    const aw = box(8, 0.12, 1.5, tmat('stripe' + colr + side, 128, 16, stripes(CLOTH[Math.floor(R() * CLOTH.length)], '#f7f3ea', 8), 1, 1, { roughness: 0.85 }), 0.02); aw.position.set(px + n.x * 5.7, 3.3, pz + n.z * 5.7); aw.rotation.y = ang; scene.add(aw);
  }
  [[0, -1], [0, 1], [1, 0], [-1, 0]].forEach(([dx, dz]) => avenue(dx, dz, R));
  // clock tower beside the north street
  { const tw = box(6.5, 30, 6.5, tmat('facade#8c5a44t', 512, 512, brick('#9a6a52'), 2, 9), 0.03, 1); tw.position.set(-13, 15, -47); solid(tw); const rf = new THREE.Mesh(new THREE.ConeGeometry(5.4, 6, 4), mat('#3f4a5c', { flatShading: true })); rf.rotation.y = Math.PI / 4; rf.position.set(-13, 33, -47); rf.castShadow = true; scene.add(rf);
    const ck = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), new THREE.MeshStandardMaterial({ roughness: 0.5, map: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f7f3ea'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill(); g.strokeStyle = '#1f2937'; g.lineWidth = 10; g.stroke(); g.lineWidth = 7; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; g.beginPath(); g.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100); g.lineTo(128 + Math.sin(a) * 116, 128 - Math.cos(a) * 116); g.stroke(); } g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 52, 128 - 40); g.stroke(); g.lineWidth = 7; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 18, 128 - 92); g.stroke(); }) })); ck.position.set(-13, 24.5, -43.7); scene.add(ck); }
  // market stalls and their keepers (stalls keep clear of the middle, where the story happens)
  const lay = [[-10.5, -24, 14, 'FRUIT'], [10.5, -24, -14, 'FLOWERS'], [-17, -11, 58, 'BREAD'], [17, -11, -58, 'BALLOONS'], [-21, 2, 82, 'TOYS'], [21, 2, -82, 'LEMONADE'], [-19, 15, 112, 'BOOKS'], [19, 15, -112, 'VEGGIES'], [-28, -23, 40, 'HONEY'], [28, -23, -40, 'HATS'],
    [-31, -7, 78, 'VEGGIES'], [31, -7, -78, 'BREAD'], [-32, 9, 98, 'FLOWERS'], [32, 9, -98, 'FRUIT'], [-13, -34, 8, 'TOYS'], [13, -34, -8, 'BOOKS'], [-24, -33, 24, 'LEMONADE'], [24, -33, -24, 'BALLOONS']];
  { const slabM = tmat('slab', 128, 128, P.slab, 1, 1); const ring = new THREE.Mesh(new THREE.RingGeometry(5.0, 9.6, 48), tmat('slabring', 128, 128, P.slab, 10, 10)); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.03, -12); ring.material = ring.material.clone(); ring.material.polygonOffset = true; ring.material.polygonOffsetFactor = -3; ring.material.polygonOffsetUnits = -6; ring.receiveShadow = true; scene.add(ring);
    plane(9, 82, tmat('slabpath', 128, 128, P.slab, 6, 54), 0, 0.022, 0); plane(82, 9, tmat('slabpath2', 128, 128, P.slab, 54, 6), 0, 0.024, 0); }
  for (let i = 0; i < 16; i++) { const sd = Math.floor(i / 4), u = (i % 4), off = [-31, -19, 19, 31][u], e = 37.5, x = sd === 0 ? off : sd === 1 ? off : sd === 2 ? -e : e, z = sd === 0 ? -e : sd === 1 ? e : off; if (i % 2) { const t = tree(i % 4 === 1 ? 'round' : 'pine', i + 120, 0.9); at(t, x, 0, z); scene.add(t); NOGO.push([x, z, 1.3]); } else { const pl = planter(i + 30, 1.8); at(pl, x, 0, z); scene.add(pl); NOGO.push([x, z, 1.5]); } }
  lay.forEach(([x, z, deg, name], i) => { const st = stall(i, name), ry = deg * D2R; at(st, x, 0, z, ry); scene.add(st); NOGO.push([x, z, 3.3]); VENDORS.push({ pos: [x - Math.sin(ry) * 0.15, z - Math.cos(ry) * 0.15], face: deg, i }); });
  // an ice-cream cart, cafe tables, planters, benches, lamps strung with bunting
  { const g = new THREE.Group(), bx = box(1.7, 0.9, 1.0, '#f1f5f9', 0.08); bx.position.y = 0.9; const st = box(1.74, 0.16, 1.04, '#f472b6', 0.03); st.position.y = 1.0; g.add(bx, st); [[-0.6, 0.5], [0.6, 0.5], [-0.6, -0.5], [0.6, -0.5]].forEach(([x, z]) => { const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 14), mat('#27272a')); w2.rotation.x = Math.PI / 2; w2.position.set(x, 0.3, z); g.add(w2); });
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8), mat('#a1a1aa')); pl.position.set(0, 2.3, 0); const um = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 10), tmat('stripe#f472b6', 128, 16, stripes('#f472b6', '#f7f3ea', 8), 1, 1, { flatShading: true })); um.position.y = 3.6; g.add(pl, um); g.traverse(m => { if (m.isMesh) m.castShadow = true; }); at(g, 9.5, 0, -3.5, -0.5); scene.add(g); NOGO.push([9.5, -3.5, 2.2]); VENDORS.push({ pos: [10.3, -4.3], face: -30, i: 20 }); }
  [[-31, 24], [-26, 29], [31, 24], [26, 29], [-33, -8], [33, -8]].forEach(([x, z], i) => { const t = parasolTable(i); at(t, x, 0, z, i); scene.add(t); NOGO.push([x, z, 2.2]); });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.52, pl = planter(i); at(pl, Math.cos(a) * 7.4, 0, -12 + Math.sin(a) * 7.4, a); scene.add(pl); NOGO.push([Math.cos(a) * 7.4, -12 + Math.sin(a) * 7.4, 1.4]); }
  [[-38, -38], [38, -38], [-38, 38], [38, 38]].forEach(([x, z], i) => { const bed = box(7, 0.3, 7, curbM, 0.05); bed.position.set(x * 0.92, 0.15, z * 0.92); scene.add(bed); plane(6.4, 6.4, tmat('grass', 512, 512, P.grass, 1.5, 1.5), x * 0.92, 0.31, z * 0.92); const t = tree(i % 2 ? 'round' : 'pine', i + 90, 1.25); at(t, x * 0.92, 0.3, z * 0.92); scene.add(t); NOGO.push([x * 0.92, z * 0.92, 4.6]); dress([{ x0: x * 0.92 - 3, x1: x * 0.92 + 3, z0: z * 0.92 - 3, z1: z * 0.92 + 3, y: 0.31, kind: 'grass', dens: 2.2 }], 20 + i); });
  const posts = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, l = lamp(); l.position.set(Math.cos(a) * 26, 0, Math.sin(a) * 26 - 4); l.rotation.y = -a; scene.add(lampKeep(l)); lamps.push(l); posts.push(new THREE.Vector3(Math.cos(a) * 26, 4.9, Math.sin(a) * 26 - 4));
    if (i % 2) { const t = tree('round', i + 70, 0.85); t.position.set(Math.cos(a + 0.25) * 31, 0, Math.sin(a + 0.25) * 31 - 4); scene.add(t); NOGO.push([t.position.x, t.position.z, 1.2]); } else { const b = bench(); b.position.set(Math.cos(a + 0.2) * 23.5, 0, Math.sin(a + 0.2) * 23.5 - 4); b.rotation.y = -a - Math.PI / 2; scene.add(lampKeep(b, 'bench')); } }
  posts.forEach((q, i) => scene.add(bunting(q, posts[(i + 1) % posts.length], 1.1, 18)));
  [[0, -40.5], [0, 40.5]].forEach(([x, z], k) => { [-6.2, 6.2].forEach(dx => { const po = box(0.3, 7.5, 0.3, '#3f3f46', 0.04); po.position.set(dx, 3.75, z); scene.add(po); }); const bn = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.5), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8, map: canvasTex(1200, 150, textPanel(text || 'MARKET DAY', '#b91c1c', '#fff7cc')) })); bn.position.set(x, 6.6, z); scene.add(bn); });
  dress([{ x0: -39, x1: 39, z0: -39, z1: 39, y: 0.02, kind: 'paved', dens: 0.55 }], 3);
  horizon(360, (x, z) => Math.abs(x) < 22 || Math.abs(z) < 22);
}
function spaceSet(text) {
  const P2 = new THREE.Mesh(new THREE.SphereGeometry(120, 64, 48), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas('planet', 2048, 1024, (g, w, h, r) => { const N = 64, grid = new Float32Array(N * N).map(() => r()); const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, q = (t) => t * t * (3 - 2 * t); const A = grid[((yi & 63) * N + (xi & 63))], B = grid[((yi & 63) * N + ((xi + 1) & 63))], C = grid[(((yi + 1) & 63) * N + (xi & 63))], D = grid[(((yi + 1) & 63) * N + ((xi + 1) & 63))]; return lerp(lerp(A, B, q(xf)), lerp(C, D, q(xf)), q(yf)); }; const img = g.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = vn(x / 128, y / 128) * 0.5 + vn(x / 48, y / 48) * 0.27 + vn(x / 18, y / 18) * 0.15 + vn(x / 6, y / 6) * 0.08, cl = vn(x / 80 + 9, y / 60 + 3) * 0.8 + vn(x / 14, y / 14) * 0.2, lat = Math.abs(y / h - 0.5) * 2; let c = n > 0.55 ? (lat > 0.85 ? [235, 240, 245] : n > 0.66 ? [120, 140, 90] : [70, 130, 70]) : [25, 70 + n * 60, 150 + n * 60]; if (cl > 0.6) c = c.map(v => lerp(v, 245, Math.min((cl - 0.6) * 3, 0.9))); const o = (y * w + x) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255; } g.putImageData(img, 0, 0); })), roughness: 0.9 }));
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
  lamps.length = 0; solids.length = 0; clutter.length = 0; FOUNT = null; NOGO = []; VENDORS = []; STREETWALK = [];
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
  if (time === 'night' && indoor) { const fill = new THREE.DirectionalLight('#ffe2c0', 1.25); fill.position.set(-5, 6, 16); scene.add(fill); } // lamp-light on faces: the ceiling light alone leaves them in shadow
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


// ---------- motion style: every character walks, stands and gestures in their own way ----------
// cad: cadence, leg/arm: swing, out: arms held away, bob: rise per step, sway/roll: hips, twist: shoulders against hips,
// lean, lift: foot lift, nod: head, spring: extra bounce, slump: chest forward, rise/crouch: height, lag: arm delay
const GAITS = {
  plain:   { cad: 1.00, leg: 0.52, arm: 0.46, out: 0.05, bob: 0.045, sway: 0.030, roll: 0.030, twist: 0.10, lean: 0.03, lift: 0.05, nod: 0.025 },
  bouncy:  { cad: 1.10, leg: 0.58, arm: 0.70, out: 0.14, bob: 0.105, sway: 0.025, roll: 0.040, twist: 0.16, lean: 0.05, lift: 0.10, nod: 0.050, spring: 0.5 },
  stride:  { cad: 0.86, leg: 0.68, arm: 0.56, out: 0.04, bob: 0.040, sway: 0.020, roll: 0.020, twist: 0.13, lean: 0.07, lift: 0.06, nod: 0.020 },
  glide:   { cad: 0.94, leg: 0.42, arm: 0.30, out: 0.10, bob: 0.020, sway: 0.045, roll: 0.055, twist: 0.15, lean: 0.02, lift: 0.03, nod: 0.015, lag: 0.5 },
  shuffle: { cad: 1.22, leg: 0.27, arm: 0.14, out: 0.02, bob: 0.015, sway: 0.050, roll: 0.045, twist: 0.04, lean: 0.09, lift: 0.01, nod: 0.040, slump: 0.20 },
  swagger: { cad: 0.90, leg: 0.50, arm: 0.62, out: 0.30, bob: 0.050, sway: 0.085, roll: 0.090, twist: 0.24, lean: -0.05, lift: 0.05, nod: 0.060, lag: 0.55 },
  tiptoe:  { cad: 1.32, leg: 0.34, arm: 0.18, out: 0.42, bob: 0.060, sway: 0.020, roll: 0.020, twist: 0.05, lean: 0.03, lift: 0.13, nod: 0.020, rise: 0.07 },
  march:   { cad: 1.00, leg: 0.80, arm: 0.86, out: 0.02, bob: 0.030, sway: 0.000, roll: 0.000, twist: 0.03, lean: 0.00, lift: 0.14, nod: 0.000, lag: 0 },
  heavy:   { cad: 0.80, leg: 0.50, arm: 0.40, out: 0.22, bob: 0.085, sway: 0.080, roll: 0.070, twist: 0.08, lean: 0.06, lift: 0.08, nod: 0.050 },
  skip:    { cad: 0.78, leg: 0.62, arm: 0.80, out: 0.20, bob: 0.240, sway: 0.030, roll: 0.030, twist: 0.12, lean: 0.03, lift: 0.18, nod: 0.050, spring: 1.0 },
  sneak:   { cad: 0.74, leg: 0.60, arm: 0.12, out: 0.26, bob: 0.020, sway: 0.030, roll: 0.020, twist: 0.06, lean: 0.20, lift: 0.11, nod: 0.020, crouch: 0.12 },
  hobble:  { cad: 1.05, leg: 0.36, arm: 0.26, out: 0.08, bob: 0.050, sway: 0.070, roll: 0.080, twist: 0.06, lean: 0.10, lift: 0.03, nod: 0.060, slump: 0.14, asym: 0.5 },
};
// posture and tempo set by the face: slump (chest forward), head, tilt, wide (stance), hip (weight on one side), bounce, fidget
const MOODS = {
  neutral: {}, happy: { slump: -0.04, head: -0.05, bounce: 0.012, tempo: 1.25 }, grin: { slump: -0.06, head: -0.08, bounce: 0.022, tempo: 1.45 },
  sad: { slump: 0.16, head: 0.20, tempo: 0.6, drop: 0.03 }, cry: { slump: 0.20, head: 0.24, tempo: 0.8, drop: 0.04 }, worried: { slump: 0.07, head: 0.07, fidget: 1, tempo: 1.2 },
  bored: { slump: 0.12, head: 0.08, tilt: 0.13, tempo: 0.5, hip: 0.05 }, determined: { slump: 0.07, head: 0.04, wide: 0.06 }, angry: { slump: 0.09, head: 0.07, wide: 0.09 },
  smug: { slump: -0.05, head: -0.10, tilt: 0.10, hip: 0.07 }, shock: { slump: -0.10, head: -0.06, wide: 0.05 },
};
function gaitOf(a, spec) { // the named gait (shot > character > one picked from the id), with a personal variation so no two people move alike
  const name = (spec && spec.gait) || a.def.gait || a._gname || (a._gname = ['plain', 'plain', 'stride', 'glide', 'bouncy'][hcode(a.id) % 5]);
  if (a._gait && a._gkey === name) return a._gait;
  const base = typeof name === 'object' ? { ...GAITS.plain, ...name } : (GAITS[name] || GAITS.plain), r = prng(hcode(a.id) % 7919 + 11), G = {};
  for (const k in base) G[k] = base[k] * (k === 'cad' ? 0.94 + r() * 0.12 : 0.86 + r() * 0.28);
  if (G.asym === undefined) G.asym = (r() - 0.5) * 0.18; if (G.lag === undefined) G.lag = 0.22 + r() * 0.22;
  a._gkey = name; return (a._gait = G);
}
function gaitPose(H, ph, k, G, run) { // one walk cycle = 2 steps. Adds to the pose; returns how far the body rises
  const s = Math.sin(ph), c = Math.cos(ph), s2 = Math.sin(2 * ph), Rn = run ? 1 : 0;
  const legA = G.leg * (1 + 0.6 * Rn) * k, armA = G.arm * (1 + 0.5 * Rn) * k, as = G.asym || 0;
  H.legL.rotation.x += (s + 0.16 * s2) * legA; H.legR.rotation.x += (-s + 0.16 * s2) * legA; // quick forward swing, longer push
  const lift = G.lift * (1 + 1.2 * Rn) * k; H.legL.position.y = lift * Math.pow(Math.max(0, -c), 1.5); H.legR.position.y = lift * Math.pow(Math.max(0, c), 1.5); // the swinging foot clears the ground
  const sa = Math.sin(ph - G.lag), out = G.out * k * (0.8 + 0.2 * Math.sin(2 * ph + 1));
  H.armL.rotation.x += -sa * armA * (1 + as) - 0.22 * Rn * k; H.armR.rotation.x += sa * armA * (1 - as) - 0.22 * Rn * k; // arms trail the legs a beat
  H.armL.rotation.z += out; H.armR.rotation.z -= out;
  H.hips.position.x += G.sway * s * k; H.hips.rotation.z += -G.roll * s * k; H.hips.rotation.y += G.twist * 0.5 * s * k; // weight rolls over the standing leg
  H.chest.rotation.y += -G.twist * 1.5 * s * k; H.chest.rotation.z += G.roll * 0.8 * s * k; H.chest.rotation.x += (G.slump || 0) * k; // shoulders counter the hips
  H.head.rotation.y += G.twist * 0.9 * s * k; H.head.rotation.x += G.nod * Math.sin(2 * ph + 0.7) * k - (G.slump || 0) * 0.5 * k; // eyes stay on the path
  const c2 = c * c; return (G.bob * (c2 + (G.spring || 0) * c2 * c2 * c2) * (1 + Rn) + (G.rise || 0) - (G.crouch || 0)) * k;
}
function glance(t, hr) { // eyes wander: look somewhere, hold, look somewhere else (half the time straight ahead)
  const T = 1.9 + hr[3] * 1.6, x = t / T + hr[4] * 7, i = Math.floor(x), f = x - i;
  const tgt = (k) => { const q = Math.sin(k * 91.7 + hr[2] * 311) * 43758.5, v = (q - Math.floor(q)) * 2 - 1, q2 = q * 1.7, v2 = (q2 - Math.floor(q2)) * 2 - 1; return Math.abs(v) < 0.45 ? [0, 0] : [v, v2]; };
  const a0 = tgt(i - 1), a1 = tgt(i), e = smooth(0, 0.26, f); return [lerp(a0[0], a1[0], e), lerp(a0[1], a1[1], e)];
}
function coinFlip(a, H, t, w, spec) { // flicks a coin, watches it rise and fall, catches it
  if (!a._coin) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 18), new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.85, roughness: 0.25, emissive: '#8a6200', emissiveIntensity: 0.5 })); c.userData.keep = true; c.castShadow = true; a.root.add(c); a._coin = c; }
  const T = spec.rate || 1.3, c = (t % T) / T, up = Math.min(c / 0.74, 1), hgt = 4 * up * (1 - up), flick = Math.exp(-c * 16);
  H.armR.rotation.set((-1.2 - 0.4 * flick) * w, 0, 0.1 * w); H.head.rotation.x += (0.06 - 0.36 * hgt) * w; H.chest.rotation.x += -0.05 * hgt * w; H.armL.rotation.z += 0.1 * w;
  a._coin.visible = w > 0.5; a._coin.position.set(-0.88, 1.82 + 1.7 * hgt, 0.98); a._coin.rotation.set(up < 1 ? t * 34 : 0, 0, 0.2);
}

// ---------- animation ----------
function pathPts(spec) { return (spec.path || [spec.pos || [0, 0], ...(spec.to ? [spec.to] : [])]).map(p => p.length === 3 ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p[0], spec.y || 0, p[1])); }
function pathAt(a, spec, u) { if (!a._curve) { const pts = pathPts(spec); a._curve = pts.length > 1 ? new THREE.CatmullRomCurve3(pts) : { getPointAt: () => pts[0].clone() }; } return a._curve.getPointAt(Math.min(Math.max(u, 0), 1)); }
function moveU(spec, t, dur) { const m = spec.move || [0, 1], k = (t - m[0] * dur) / Math.max((m[1] - m[0]) * dur, 0.01); return (spec.to || spec.path) ? (spec.linear ? Math.min(Math.max(k, 0), 1) : ease(k)) : 0; }
function placeActor(a, spec, t, dur) { if (spec.ride) { const r = ridePos(spec, t); if (r) { a.root.position.copy(r.p); return; } } a.root.position.copy(pathAt(a, spec, moveU(spec, t, dur))); }
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
  a._speed = speed; let RP = P0;
  if (spec.ride) { const r = ridePos(spec, t); if (r) { RP = r.p; face = r.yaw + (spec.face || 0) * D2R; a._speed = r.v; } }
  a.root.position.copy(RP); a.root.rotation.set(0, face, 0); a._yaw = face; a.blob.visible = RP.y < 0.5;
  const H = a, ph0 = a.id.length * 1.7; let y = 2 * S, bob = 0, lean = 0;
  // rest pose: breathing, weight that settles on one leg and shifts, wandering glances, and a posture set by the mood.
  // Always on, layered under every action; everything is a pure function of time, so any frame can be drawn on its own.
  const G = gaitOf(a, spec), M = MOODS[spec.expr] || MOODS.neutral, hr = a._hr || (a._hr = (() => { const r = prng(hcode(a.id) % 9973 + 5); return [r(), r(), r(), r(), r()]; })());
  const br = Math.sin(t * 1.6 * (M.tempo || 1) + ph0), wm = ease(t / 0.5);
  H.chest.rotation.set(0.012 * br, 0, 0); H.hips.position.x = 0; H.legL.position.y = 0; H.legR.position.y = 0; if (a._coin) a._coin.visible = false;
  H.armL.rotation.set(0.02 * br, 0, 0.05 + 0.015 * br); H.armR.rotation.set(-0.02 * br, 0, -0.05 - 0.015 * br);
  H.legL.rotation.set(0, 0, 0); H.legR.rotation.set(0, 0, 0); H.hips.rotation.set(0, 0, 0); H.head.rotation.set(0.015 * br, 0, 0); bob = br * 0.008;
  const idleK = (1 - kMove) * (['sit', 'lie', 'fall', 'fly', 'float', 'push', 'strain', 'walk', 'run'].includes(act) ? 0 : 1);
  const ws = Math.tanh(2.4 * Math.sin((t / (3.4 + hr[0] * 2.4) + hr[1]) * 6.2832)) * idleK; // weight on one leg, a hold, then over to the other
  H.hips.position.x = 0.045 * ws; H.hips.rotation.z = -0.03 * ws; H.chest.rotation.z = 0.04 * ws; H.head.rotation.z = -0.015 * ws; (ws > 0 ? H.legR : H.legL).rotation.z = (ws > 0 ? -0.05 : 0.05) * Math.abs(ws);
  if (!spec.look && amp < 0.03) { const gl = glance(t, hr); H.head.rotation.y += gl[0] * 0.2 * idleK; H.head.rotation.x += gl[1] * 0.05 * idleK; H.chest.rotation.y += gl[0] * 0.05 * idleK; }
  H.chest.rotation.x += (M.slump || 0) * wm; H.head.rotation.x += (M.head || 0) * wm; H.head.rotation.z += (M.tilt || 0) * wm * (hr[2] > 0.5 ? 1 : -1); bob -= (M.drop || 0) * wm;
  if (M.wide) { H.armL.rotation.z += M.wide * wm; H.armR.rotation.z -= M.wide * wm; H.legL.rotation.z += M.wide * 0.5 * wm; H.legR.rotation.z -= M.wide * 0.5 * wm; }
  if (M.hip) { const sd = hr[3] > 0.5 ? 1 : -1; H.hips.rotation.z += sd * M.hip * wm * idleK; H.chest.rotation.z -= sd * M.hip * wm * idleK; }
  if (M.bounce) bob += Math.abs(Math.sin(t * 2.6 + ph0)) * M.bounce * idleK;
  if (M.fidget) { H.armR.rotation.x += -0.14 * wm * (0.5 + 0.5 * Math.sin(t * 2.3 + ph0)); H.armL.rotation.x += -0.1 * wm * (0.5 + 0.5 * Math.sin(t * 1.9)); H.head.rotation.y += Math.sin(t * 1.1 + ph0) * 0.06 * wm; }
  const w = ease(t / 0.35), wo = easeBack(t / 0.55), osc = (f, k = 0) => Math.sin(t * f + k); // action blend-in (plain, and with a little overshoot), oscillator
  // locomotion: legs driven by distance travelled, amplitude by speed (no sliding, no snapping); the gait gives it character
  const run = act === 'run', loco = act === 'walk' || run || kMove > 0, cadK = (run ? 3.6 : 5.6) * G.cad / Math.pow(a.def.scale || 1, 0.6);
  if ((act === 'walk' || run) && !hasPath) { bob += gaitPose(H, t * (run ? 9 : 6.2) * G.cad, w, G, run); lean = (run ? 0.14 : G.lean) * w; }
  else if (loco && act !== 'fly' && act !== 'float') {
    const k = sm(0.05, run ? 3.5 : 1.3, speed); bob += gaitPose(H, L * u * cadK + ph0, k, G, run); lean = (run ? 0.14 : G.lean) * k;
    const spAt = (tt) => L * Math.abs(moveU(spec, tt + h, dur) - moveU(spec, Math.max(tt - h, 0), dur)) / (tt + h - Math.max(tt - h, 0)), acc = (spAt(t + 0.1) - spAt(Math.max(t - 0.1, 0))) / 0.2;
    lean += Math.max(-0.09, Math.min(0.12, acc * 0.03)); // leans into speeding up, sits back when slowing
    const dirAt = (uu) => { const p1 = pathAt(a, spec, Math.min(uu + 0.01, 1)), p0 = pathAt(a, spec, Math.max(uu - 0.01, 0)); return Math.atan2(p1.x - p0.x, p1.z - p0.z); };
    const turn = wrapA(dirAt(moveU(spec, t + 0.12, dur)) - dirAt(moveU(spec, Math.max(t - 0.12, 0), dur))) / 0.24; a.root.rotation.z = Math.max(-0.12, Math.min(0.12, -turn * 0.07)) * k; // banks into a curve
  }
  if (hasPath && t > mv1 && mv1 < dur * 0.98 && act !== 'fly' && act !== 'float') { const ts = t - mv1, q = Math.exp(-4.5 * ts) * Math.sin(11 * ts) * 0.05 * Math.min(1, L / Math.max(mv1 - mv0, 0.1) / 1.4); H.chest.rotation.x += q; H.armL.rotation.x -= q * 2.2; H.armR.rotation.x -= q * 2.2; H.head.rotation.x -= q * 0.6; } // settle after stopping: the arms and head arrive last
  if (act === 'fly' || act === 'float') {
    const fl = act === 'fly', dy = Pn.y - Pp.y, dh = Math.hypot(Pn.x - Pp.x, Pn.z - Pp.z), pitch = fl ? Math.min(Math.max(Math.PI / 2 - Math.atan2(dy, dh + 1e-5) * 0.8, 0.5), 1.4) : 0;
    a.root.rotation.x = pitch * ease(t / 0.5); bob = osc(2.2) * 0.08;
    H.armL.rotation.set(fl ? -2.95 * w : 0, 0, fl ? 0.18 : 0.9 + osc(1.4) * 0.08); H.armR.rotation.set(fl ? -2.95 * w : 0, 0, fl ? -0.18 : -0.9 - osc(1.4) * 0.08);
    H.legL.rotation.x = fl ? 0.12 + osc(3.1) * 0.05 : osc(1.5) * 0.1; H.legR.rotation.x = fl ? 0.04 - osc(3.1) * 0.05 : -osc(1.5) * 0.1; if (fl) H.head.rotation.x = -0.8 * w;
  }
  if (act === 'wave') { H.armR.rotation.z = lerp(-0.05, -2.6, wo) + osc(5.2) * 0.28 * w; H.armR.rotation.x = -0.15 * w; H.head.rotation.z += 0.07 * w; H.chest.rotation.z += -0.07 * w + osc(5.2, 0.6) * 0.02 * w; H.hips.position.x += 0.03 * w; H.armL.rotation.z += 0.1 * w; bob += Math.abs(osc(5.2)) * 0.018 * w; }
  if (act === 'push' || act === 'strain') { const tr = act === 'strain' ? osc(31) * 0.035 + osc(47) * 0.02 : 0; H.armL.rotation.set(-1.5 * w + tr, 0, 0.1); H.armR.rotation.set(-1.5 * w - tr, 0, -0.1); lean = (act === 'strain' ? 0.32 : 0.24) * w; H.legL.rotation.x = 0.42 * w; H.legR.rotation.x = -0.32 * w; H.head.rotation.x += (act === 'strain' ? 0.12 : -0.05) * w + tr; bob -= 0.08 * w; }
  if (a.fingers) { const pk = act === 'pinky' || (act === 'pinky_late' && t > (spec.at || 1)); a.fingers.forEach(f => f.visible = pk && (act !== 'pinky' || w > 0.6)); a.censor.visible = act === 'flip'; }
  if (act === 'pinky' || (act === 'pinky_late' && t > (spec.at || 1))) { const k = act === 'pinky' ? w : ease((t - (spec.at || 1)) / 0.3); H.armL.rotation.set(-1.25 * k, 0, -0.78 * k); H.armR.rotation.set(-1.25 * k, 0, 0.78 * k); }
  if (act === 'flip') { H.armR.rotation.set(-2.1 * w, 0, -0.15 * w); }
  if (act === 'raise') { H.armR.rotation.set(-1.0 * w + osc(9) * 0.03, 0, 0.1); } // hand starting to come up... and freezing
  if (act === 'hold') { H.armL.rotation.set(-1.35 * w, 0, -0.32 * w); H.armR.rotation.set(-1.35 * w, 0, 0.32 * w); }
  if (act === 'twirl') { const k = osc(spec.rate || 9); H.armL.rotation.set(-1.35 * w + k * 0.12, 0, -0.32 * w); H.armR.rotation.set(-1.35 * w - k * 0.12, 0, 0.32 * w); H.hips.rotation.y += osc((spec.rate || 9) / 2) * 0.04; }
  if (act === 'reach') { H.armL.rotation.set(-2.6 * w, 0, 0.15); H.armR.rotation.set(-2.6 * w, 0, -0.15); H.head.rotation.x -= 0.15 * w; }
  if (act === 'point') { H.armR.rotation.x = -1.5 * wo; H.head.rotation.x -= 0.05 * w; H.chest.rotation.y += 0.14 * w; H.chest.rotation.x += 0.05 * w; H.armL.rotation.z += 0.08 * w; }
  if (act === 'arms_up' || act === 'cheer') { const b = 0.5 + 0.5 * osc(5, -1.5); H.armL.rotation.z = lerp(0.05, 2.55 + 0.15 * b, wo); H.armR.rotation.z = lerp(-0.05, -2.55 - 0.15 * b, wo); bob += b * 0.22 * w; H.head.rotation.x -= 0.12 * w; H.chest.rotation.x -= 0.06 * w; H.chest.rotation.z += osc(2.5, hr[0] * 6) * 0.05 * w; H.legL.rotation.x += -0.12 * b * w; H.legR.rotation.x += -0.12 * b * w; }
  if (act === 'jump') { const c = (t * 0.9) % 1, hgt = Math.sin(Math.min(c / 0.7, 1) * Math.PI); bob += hgt * 0.9; H.legL.rotation.x = H.legR.rotation.x = -0.35 * hgt; H.armL.rotation.z = 0.05 + 0.9 * hgt; H.armR.rotation.z = -0.05 - 0.9 * hgt; }
  if (act === 'dance') { const b = osc(4.2), b2 = osc(2.1, hr[0] * 6); H.armL.rotation.z = 1.0 + b * 0.8 * w; H.armR.rotation.z = -1.0 + b * 0.8 * w; H.armL.rotation.x += osc(4.2, 1.2) * 0.3 * w; H.armR.rotation.x += osc(4.2, 2.4) * 0.3 * w; H.hips.rotation.y += b2 * 0.3 * w; H.chest.rotation.y += -b2 * 0.42 * w; H.hips.position.x += b2 * 0.07 * w; H.chest.rotation.z += b2 * 0.07 * w; bob += Math.abs(b) * 0.12 * w; H.head.rotation.z += b2 * 0.1; H.legL.rotation.x += Math.max(0, b) * 0.3 * w; H.legR.rotation.x += Math.max(0, -b) * 0.3 * w; }
  if (act === 'cry') { H.head.rotation.x = 0.14 * w + osc(5) * 0.02; H.armL.rotation.set(-0.28 * w, 0, 0.08); H.armR.rotation.set(-0.28 * w, 0, -0.08); H.hips.rotation.z += osc(11) * 0.008; bob += Math.abs(osc(5)) * 0.015; }
  if (act === 'sob') { H.head.rotation.x = 0.32 * w; H.armL.rotation.set(-2.25 * w, 0, -0.42 * w); H.armR.rotation.set(-2.25 * w, 0, 0.42 * w); H.hips.rotation.z += osc(11) * 0.012; }
  if (act === 'think') { H.armR.rotation.set(-2.35 * w, 0, 0.5 * w); H.head.rotation.x += -0.08 * w; H.head.rotation.y += 0.18 * w; H.head.rotation.z += 0.1 * w + osc(0.8) * 0.03; H.armL.rotation.set(-0.5 * w, 0, -0.55 * w); H.chest.rotation.z += 0.03 * w; }
  if (act === 'talk' || (amp > 0.03 && (act === 'idle' || act === 'sit'))) { // gestures follow the voice: the louder the syllable, the bigger the beat; hands take turns
    const g = Math.min(1, amp * 1.6), sel = Math.tanh(2.5 * Math.sin(t * 1.9 + hr[1] * 6)), e = (act === 'talk' ? 0.45 : 0.22) + 0.55 * g, rightHand = sel * (hr[2] > 0.5 ? 1 : -1) > 0;
    const A = rightHand ? H.armR : H.armL, B = rightHand ? H.armL : H.armR, sA = rightHand ? 1 : -1, k = (0.35 + 0.65 * Math.abs(sel)) * w;
    A.rotation.x += (-0.6 * e - 0.1 * osc(3.1, hr[0] * 6)) * k; A.rotation.z -= sA * (0.08 + 0.22 * g) * k; B.rotation.x += -0.14 * e * k;
    H.chest.rotation.x += 0.035 * e * w; H.chest.rotation.y += sel * 0.07 * w; H.head.rotation.x += 0.05 * g * Math.sin(t * 6.1); H.head.rotation.z += sel * 0.03 * w; bob += g * 0.012;
  }
  if (act === 'laugh') { const b = Math.abs(osc(11)) * (0.6 + 0.4 * osc(1.3)); bob += b * 0.035 * w; H.chest.rotation.x += (-0.14 + b * 0.05) * w; H.head.rotation.x += -0.2 * w + b * 0.05; H.armR.rotation.set(-0.9 * w, 0, 0.55 * w); H.armL.rotation.z += 0.12 * w; }
  if (act === 'nod') H.head.rotation.x += Math.max(0, osc(7)) * 0.24 * w * Math.exp(-t * 0.5);
  if (act === 'shake') { H.head.rotation.y += osc(8) * 0.32 * w * Math.exp(-t * 0.45); H.chest.rotation.y += osc(8, -0.5) * 0.04 * w * Math.exp(-t * 0.45); }
  if (act === 'hug') { H.armL.rotation.set(-1.25 * wo, 0, -0.55 * wo); H.armR.rotation.set(-1.25 * wo, 0, 0.55 * wo); H.chest.rotation.x += 0.16 * w; H.head.rotation.x += 0.12 * w; H.head.rotation.z += 0.14 * w; bob += osc(1.3) * 0.01; }
  if (act === 'clap') { const k = 0.5 + 0.5 * osc(13); H.armL.rotation.set(-1.2 * w, 0, (-0.2 - 0.3 * k) * w); H.armR.rotation.set(-1.2 * w, 0, (0.2 + 0.3 * k) * w); bob += Math.abs(osc(6.5)) * 0.04 * w; H.chest.rotation.x -= 0.04 * w; }
  if (act === 'sigh') { const k = Math.sin(Math.min(t / 0.9, 1) * Math.PI), d = sm(0.7, 1.6, t); H.chest.rotation.x += -0.07 * k + 0.16 * d; H.head.rotation.x += -0.1 * k + 0.2 * d; bob += 0.03 * k - 0.035 * d; }
  if (act === 'stumble') { const k = Math.sin(Math.min(t / 0.95, 1) * Math.PI), q = Math.exp(-2.5 * t); a.root.rotation.x = 0.5 * k; H.armL.rotation.set(-1.6 * k + osc(17) * 0.3 * q, 0, 0.9 * k); H.armR.rotation.set(-1.2 * k - osc(19) * 0.3 * q, 0, -1.1 * k); H.legL.rotation.x += 0.7 * k; H.legR.rotation.x -= 0.4 * k; H.head.rotation.x -= 0.25 * k; }
  if (act === 'shiver') { const tr = osc(38) * 0.018 + osc(53) * 0.012; H.armL.rotation.set(-0.95 * w, 0, -0.75 * w); H.armR.rotation.set(-0.95 * w, 0, 0.75 * w); H.chest.rotation.x += 0.14 * w; H.head.rotation.x += 0.1 * w + tr; H.hips.rotation.z += tr; bob += tr - 0.03 * w; }
  if (act === 'spin') { const k = ease(t / Math.max(spec.spin_dur || 1.2, 0.2)), o = Math.sin(k * Math.PI); a.root.rotation.y += k * Math.PI * 2 * (spec.spins || 1); H.armL.rotation.z += 1.3 * o; H.armR.rotation.z -= 1.3 * o; bob += o * 0.25; H.head.rotation.x -= 0.15 * o; }
  if (act === 'look_up') { H.head.rotation.x += -0.5 * w; H.chest.rotation.x += -0.08 * w; }
  if (act === 'pick') { const dn = sm(0.1, 0.6, t), upk = sm(1.0, 1.6, t), k = dn * (1 - upk); H.chest.rotation.x += 1.0 * k; bob -= 0.25 * k; H.legL.rotation.x += -0.5 * k; H.legR.rotation.x += 0.35 * k; H.armR.rotation.x += -1.3 * k - 1.25 * upk; H.head.rotation.x += -0.3 * k - 0.1 * upk; }
  if (act === 'hope') { H.armL.rotation.set(-1.75 * w, 0, -0.62 * w); H.armR.rotation.set(-1.75 * w, 0, 0.62 * w); H.head.rotation.x += 0.16 * w; H.chest.rotation.x += 0.08 * w; bob += osc(3) * 0.006; }
  if (act === 'coin') coinFlip(a, H, t, w, spec);
  if (act === 'shrug') { const k = sm(0.2, 0.6, t) * (1 - sm(1.4, 1.9, t)); H.armL.rotation.z = 0.05 + k * 0.75; H.armR.rotation.z = -0.05 - k * 0.75; H.armL.rotation.x += -0.3 * k; H.armR.rotation.x += -0.3 * k; H.head.rotation.z += k * 0.1; H.chest.rotation.x -= 0.04 * k; bob += k * 0.04; }
  if (act === 'shock') { const k = easeBack(t / 0.3), rec = 1 - 0.25 * sm(0.4, 1.2, t), q = Math.exp(-3.5 * t) * Math.sin(16 * t) * 0.04; H.armL.rotation.z = 0.05 + k * 1.15 * rec; H.armR.rotation.z = -0.05 - k * 1.15 * rec; bob += Math.sin(Math.min(t / 0.35, 1) * Math.PI) * 0.25; H.head.rotation.x += -0.1 * k + q; H.chest.rotation.x += -0.12 * k * rec + q; H.legL.rotation.z += 0.06 * k; H.legR.rotation.z -= 0.06 * k; }
  if (act === 'sit') { y = 1.25; H.legL.rotation.x = -1.5 + osc(0.9, ph0) * 0.03; H.legR.rotation.x = -1.5 + osc(0.7, 1) * 0.03; H.armL.rotation.x += -0.35; H.armR.rotation.x += -0.35; }
  if (act === 'fall') { const k = ease(t / 0.55); a.root.rotation.x = -k * Math.PI / 2; H.armL.rotation.z = 0.05 + k * 2.3; H.armR.rotation.z = -0.05 - k * 2.3; }
  if (act === 'lie') a.root.rotation.x = -Math.PI / 2;
  if (act === 'bow') { const k = Math.sin(Math.min(t / 1.2, 1) * Math.PI); H.chest.rotation.x += 0.75 * k; H.head.rotation.x += 0.2 * k; H.armL.rotation.x += -0.2 * k; H.armR.rotation.x += -0.2 * k; }
  H.hips.position.y = y + bob; H.hips.rotation.x += lean;
  if (spec.trail || act === 'fly') trail(a, spec, u, t, mv1 - mv0);
  if (amp > 0.02) { const k = Math.min(amp * 2.5, 1); H.head.rotation.x += (osc(4.1) * 0.025 + osc(2.3, 1) * 0.015) * k; H.head.rotation.y += osc(1.7, 2) * 0.04 * k; }
  const expr = spec.expr || (act === 'cry' || act === 'sob' ? 'cry' : act === 'shock' ? 'shock' : act === 'cheer' || act === 'dance' ? 'grin' : 'neutral');
  const mouth = amp > 0.16 ? 2 : amp > 0.06 ? 1 : 0, bt = (t + rnd(a.id.length) * 3) % 3.6;
  const blink = act === 'lie' ? 0 : bt > 3.5 ? 1 : bt > 3.42 ? 2 : bt > 3.36 ? 1 : 0; // half - closed - half
  const key = expr + mouth + blink; if (key !== a.faceKey) { drawFace(a.faceC.getContext('2d'), a.def, expr, mouth, blink); a.faceT.needsUpdate = true; a.faceKey = key; }
  let tg = spec.tag !== undefined ? spec.tag : a.def.tag;
  if (tg && typeof tg === 'object') { // {from,to,at,dur} counter, or {bind:'v', fmt:'v = {} m/s', dec:1} live readout
    const raw = tg.bind === 'v' ? (a._speed || 0) * (tg.k || 1) : lerp(tg.from, tg.to, ease((t - (tg.at || 0) * dur) / Math.max((tg.dur || 1) * dur, 0.01)));
    const dec = tg.dec !== undefined ? tg.dec : (tg.fmt ? 1 : 0), num = dec ? raw.toFixed(dec) : Math.round(raw).toLocaleString('en-US'); tg = tg.fmt ? tg.fmt.replace('{}', num) : num; }
  if (tg !== undefined && tg !== null && tg !== '') { const tk = String(tg) + (spec.tag_color || a.def.tag_color || ''); if (tk !== a.tagKey) { if (a.tag) { a.root.remove(a.tag); a.tag.material.map.dispose(); } a.tag = tagSprite(String(tg), spec.tag_color || a.def.tag_color); a.tag.position.y = 3.85; a.root.add(a.tag); if (String(tg).length > 6) a.tag.scale.set(Math.min(0.19 * String(tg).length, 3.2), 0.5, 1); a.tagKey = tk; } }
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
  const u = Math.min(t / dur, 1), e = easeCut(u), mv = c.move || 'push'; let focus = null;
  if (c.path) {
    if (!c._curve) c._curve = new THREE.CatmullRomCurve3(c.path.map(p => new THREE.Vector3(...p)));
    const k = c.linear ? u : easeCut(u); cam.position.copy(c._curve.getPointAt(k));
    if (c.look) cam.lookAt(...c.look); else cam.lookAt(c._curve.getPointAt(Math.min(k + 0.04, 1)).add(new THREE.Vector3(0, -1.5, 0)));
  } else if (c.type === 'follow' || c.type === 'track') {
    const A = actors[[].concat(c.on)[0]]; const p = anchor(A), d = (c.dist || 8) * (c.zoom || 1), ang = (c.angle || 0) * D2R + (c.type === 'follow' ? A.root.rotation.y + Math.PI : 0), hh = c.height !== undefined ? c.height : 1.2;
    if (c.type === 'follow' || !c._anchor) c._anchor = new THREE.Vector3(p.x + Math.sin(ang) * d, p.y + 2.2 + hh, p.z + Math.cos(ang) * d);
    if (c.type === 'follow') { c._sm = c._sm && t > c._st ? c._sm.lerp(c._anchor, 1 - Math.exp(-(t - c._st) * 7.7)) : c._anchor.clone(); c._st = t; cam.position.copy(c._sm); } else cam.position.copy(c._anchor);
    const lp = new THREE.Vector3(p.x, p.y + 2.3, p.z); unblock(lp, t); cam.lookAt(lp); focus = lp;
  } else if (c.pos) {
    const p0 = new THREE.Vector3(...c.pos), p1 = new THREE.Vector3(...(c.to_pos || c.pos)), l0 = new THREE.Vector3(...(c.look || [0, 2, 0])), l1 = new THREE.Vector3(...(c.to_look || c.look || [0, 2, 0]));
    cam.position.lerpVectors(p0, p1, easeCut(u)); const lk = new THREE.Vector3().lerpVectors(l0, l1, easeCut(u)); cam.lookAt(lk); focus = lk;
  } else {
    const ons = [].concat(c.on || Object.keys(actors)[0] || Object.keys(PROPS)[0]).filter(id => actors[id] || PROPS[id]);
    const pts = ons.map(id => actors[id] ? anchor(actors[id]) : PROPS[id].focusNow()), ctr = pts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / Math.max(pts.length, 1));
    const spread = pts.length > 1 ? Math.max(...pts.map(p => p.distanceTo(ctr))) : 0;
    const F = { xclose: [1.6, 2.82, 2.77], close: [2.8, 2.95, 2.72], medium: [5.4, 3.0, 2.35], full: [8.2, 2.7, 1.75], wide: [17, 5.5, 1.5], low: [4.6, 0.55, 2.7], high: [9, 11, 1.2], top: [0.01, 22, 0] }[c.type || 'medium'] || [5.4, 3.0, 2.35];
    const sc = (c.scale || 1) * ons.reduce((a, id) => a + (actors[id] ? (actors[id].def.scale || 1) : (PROPS[id].frame || 1)), 0) / Math.max(ons.length, 1);
    let dist = (F[0] * sc + spread * 1.8) * (c.zoom || 1);
    if (pts.length > 1 && c.type !== 'ots') { const hh = Math.atan(Math.tan((c.fov || 40) * D2R / 2) * cam.aspect); dist = Math.max(dist, (spread + 1.15) / Math.tan(hh) * (c.zoom || 1)); }
    const K = c.energy || POST.cam_energy || 1.8; // movement strength (1 = the old, calmer moves)
    if (mv === 'push') dist *= lerp(1 + 0.06 * K, 1 - 0.05 * K, e); if (mv === 'pull') dist *= lerp(1 - 0.05 * K, 1 + 0.08 * K, e); if (mv === 'static') dist *= lerp(1.025, 0.985, e);
    let rv = 0; if (mv === 'reveal' || mv === 'zoomout' || mv === 'descend') { const k = easeCut(Math.min(t / dur, 1)); rv = mv === 'descend' ? 1 - k : k; }
    let baseA = c.angle;
    if (baseA === undefined && ons.length === 1) { const sp = (shot.cast || []).find(k => k.id === ons[0]); if (sp && sp.look && actors[sp.look]) { const A = actors[ons[0]].root, B = actors[sp.look].root.position; const az = Math.atan2(B.x - A.position.x, B.z - A.position.z), dl = Math.atan2(Math.sin(az - A.rotation.y), Math.cos(az - A.rotation.y)); baseA = -Math.sign(dl || 1) * 38; } }
    let ang = (baseA || 0) * D2R + (ons.length === 1 && c.relative !== false ? (actors[ons[0]] ? (actors[ons[0]]._yaw !== undefined ? actors[ons[0]]._yaw : actors[ons[0]].root.rotation.y) : PROPS[ons[0]].yaw0) : 0);
    if (mv === 'orbit' || mv === 'arc') ang += lerp(-0.16, 0.16, e) * K * (c.dir || 1);
    if (mv === 'push' || mv === 'pull' || mv === 'static') ang += lerp(-0.045, 0.045, e) * K * (c.dir || 1); // slow parallax drift while pushing
    if (c.type === 'ots' && ons.length > 1) {
      const A = actors[ons[0]].root.position, B = actors[ons[1]].root.position, dir = new THREE.Vector3().subVectors(A, B).setY(0).normalize();
      cam.position.copy(A).addScaledVector(dir, 3.6 + (mv === 'push' ? lerp(0.25, -0.15, e) : 0)).add(new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(c.side || 1.5)).setY(3.15); cam.lookAt(B.x, 2.55, B.z); ctr.copy(B);
    } else {
      let lx = 0; if (mv === 'dolly' || mv === 'pan') lx = lerp(-1, 1, e) * (c.dir || 1) * (mv === 'dolly' ? 1.4 : 0.9) * K;
      const side = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang));
      if (rv) { ang += rv * (c.spin !== undefined ? c.spin : 25) * D2R; dist = lerp(dist, c.reveal_dist || 60, rv * rv * (3 - 2 * rv)); }
      const camH = F[1] * sc + (c.height || 0) + (mv === 'rise' || mv === 'crane' ? lerp(-0.6, 1.4, e) * K : 0) + (rv ? lerp(0, c.reveal_height || 38, rv) : 0);
      cam.position.set(ctr.x + Math.sin(ang) * dist, ctr.y + camH, ctr.z + Math.cos(ang) * dist).addScaledVector(side, lx);
      cam.lookAt(ctr.x + (mv === 'pan' ? side.x * lx * 0.2 : 0), ctr.y + lerp(F[2] * sc + (c.look_y || 0), 0, rv), ctr.z + (mv === 'pan' ? side.z * lx * 0.2 : 0));
    }
    focus = ctr.clone().setY(ctr.y + 2.7 * sc); unblock(focus, t, cam.position.y >= 14); // always tracked, so crossing the 14 m line can't snap
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
// whole-video looks ("camera filters"): set post.look in the story (or per shot)
const LOOKS = {
  film: {},
  golden: { grade: 'warm', bloom: 0.42, bloom_th: 0.8, bloom_r: 0.5, tone: 1.2, leak: 1.3, vignette: 0.68, exposure: 1.0 },
  dreamy: { grade: 'dream', bloom: 0.55, bloom_th: 0.7, bloom_r: 0.75, tone: 0.8, leak: 1.1, vignette: 0.55, grain: 0.04 },
  flashback: { grade: 'sepia', bloom: 0.45, bloom_th: 0.75, vignette: 0.95, grain: 0.1, leak: 0.7, tone: 0.2, ca: 1.5 },
  camcorder: { grade: 'cool', bloom: 0.35, ca: 2.2, tone: 0.6, leak: 0.3, vignette: 0.5, grain: 0.07, scan: 1, overlay: 'camcorder' },
};
let OVC = null, OVT = null;
function camcorderOverlay(t, w, h) { // REC dot, timecode, frame brackets drawn into a transparent layer composited in the post shader
  if (!OVC) { OVC = document.createElement('canvas'); OVC.width = w; OVC.height = h; OVT = new THREE.CanvasTexture(OVC); OVT.colorSpace = SRGB; }
  const g = OVC.getContext('2d'); g.clearRect(0, 0, w, h); const m = w * 0.06, L = w * 0.09; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = w * 0.006;
  [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(([x, y, sx, sy]) => { g.beginPath(); g.moveTo(x, y + sy * L); g.lineTo(x, y); g.lineTo(x + sx * L, y); g.stroke(); });
  g.font = `900 ${w * 0.045}px ${FONT}`; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.92)'; g.fillText('REC', m + w * 0.075, m + w * 0.07);
  if (Math.floor(t * 1.6) % 2 === 0) { g.fillStyle = '#ff3030'; g.beginPath(); g.arc(m + w * 0.04, m + w * 0.07, w * 0.016, 0, 7); g.fill(); }
  const tt = TC + t, tc = [Math.floor(tt / 3600), Math.floor(tt / 60) % 60, Math.floor(tt) % 60, Math.floor((tt % 1) * 30)].map(v => String(v).padStart(2, '0')).join(':');
  g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.92)'; g.font = `700 ${w * 0.036}px ${FONT}`; g.fillText(tc, w - m - w * 0.02, m + w * 0.07); g.textAlign = 'left';
  g.fillText('▶ 1080p  60', m + w * 0.02, h - m - w * 0.06); OVT.needsUpdate = true; return OVT;
}
let TC = 0;
const GRADES = { sepia: [1.06, 0.22, [0.07, 0.045, 0.0], [1.08, 0.95, 0.76]], film: [1.1, 1.1, [0.0, 0.018, 0.04], [1.07, 1.01, 0.92]], warm: [1.05, 1.1, [0.02, 0.01, 0.0], [1.08, 1.0, 0.9]], cool: [1.05, 0.98, [0.0, 0.01, 0.03], [0.95, 1.0, 1.06]], night: [1.1, 0.92, [0.0, 0.01, 0.035], [0.9, 0.97, 1.1]], dream: [0.96, 1.15, [0.04, 0.03, 0.05], [1.05, 1.0, 1.05]], none: [1, 1, [0, 0, 0], [1, 1, 1]] };
let HQ = false;
function makePost(w, h) {
  rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: HQ ? 4 : 0 }); rt.depthTexture = new THREE.DepthTexture(w, h); rt.depthTexture.type = THREE.UnsignedIntType;
  bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.5, 0.45, 0.92);
  quad = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: { tC: { value: rt.texture }, tD: { value: rt.depthTexture }, res: { value: new THREE.Vector2(w, h) }, near: { value: 0.1 }, far: { value: 1000 }, focus: { value: 10 }, ap: { value: 0 }, time: { value: 0 }, con: { value: 1 }, sat: { value: 1 }, lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) }, vig: { value: 0.3 }, grain: { value: 0.025 }, ca: { value: 1 }, tone: { value: 1 }, leak: { value: 1 }, seed: { value: 0 }, scan: { value: 0 }, tOv: { value: null }, ov: { value: 0 }, expo: { value: 1.0 }, flash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tC, tD; uniform vec2 res; uniform float near, far, focus, ap, time, con, sat, vig, grain, expo, flash, ca, tone, leak, seed, scan, ov; uniform sampler2D tOv; uniform vec3 lift, gain;
      float lin(float d){ float z=d*2.-1.; return 2.*near*far/(far+near-z*(far-near)); }
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec3 col = texture2D(tC,vUv).rgb;
        if (ca > 0.) { vec2 dd = (vUv-.5)*ca*.0045*smoothstep(.25,.7,length(vUv-.5)); col.r = texture2D(tC,vUv+dd).r; col.b = texture2D(tC,vUv-dd).b; } // lens fringing toward the edges
        if (ap > 0.) { float z = lin(texture2D(tD,vUv).r); float coc = clamp(abs(z-focus)/z*ap*res.y, 0., res.y*.005);
          if (coc > 0.8) { vec3 acc=col; float wsum=1.; for (int i=0;i<16;i++){ float fi=float(i)+.5; float r=sqrt(fi/16.)*coc; float a=fi*2.39996; vec2 o=vec2(cos(a),sin(a))*r/res; float zs=lin(texture2D(tD,vUv+o).r); float w = zs < z-0.5 ? clamp(abs(zs-focus)/zs*ap*res.y/coc,0.,1.) : 1.; acc += texture2D(tC,vUv+o).rgb*w; wsum+=w; } col = acc/wsum; } }
        col = aces(col*expo); col = pow(col, vec3(1./2.2));
        col = col*gain + lift*(1.-col); float l = dot(col,vec3(.299,.587,.114)); col = mix(vec3(l),col,sat); col = (col-.5)*con+.5;
        float L = dot(col,vec3(.299,.587,.114)); // teal shadows / orange highlights split-tone
        col = mix(col, col*vec3(.78,1.02,1.12)+vec3(0.,.02,.04), tone*.55*(1.-smoothstep(.0,.55,L)));
        col = mix(col, col*vec3(1.12,1.0,.84), tone*.5*smoothstep(.45,1.,L));
        float hl = smoothstep(.72,1.,L); col += vec3(1.,.45,.2)*hl*.06*tone; // warm halation on bright edges
        vec2 lp = vec2(.15+.6*sin(time*.23+seed), 1.05); float lk = exp(-3.2*length((vUv-lp)*vec2(1.,.75))); // slow drifting light leak
        col += vec3(1.,.55,.25)*lk*.32*leak*(.65+.35*sin(time*.7+seed*3.));
        col *= 1.+ (sin(time*31.+seed)*.5+sin(time*19.7+seed*2.)*.3+sin(time*47.3)*.2)*.012*leak; // gentle film flicker (smooth, so it never steps out of cadence with 60 fps)
        col = mix(col, vec3(.07,.06,.09)+col*.93, .55*tone); // filmic faded blacks
        vec2 q=vUv-.5; col *= 1.-vig*smoothstep(.25,.85,length(q*vec2(1.,1.2)));
        col += (h(vUv*res+fract(time*7.31)*100.)-.5)*grain; col *= 1.-scan*.07*step(.5,fract(vUv.y*res.y*.25)); col = mix(col, vec3(1.), flash);
        if (ov > 0.) { vec4 o = texture2D(tOv, vUv); col = mix(col, o.rgb, o.a); }
        gl_FragColor = vec4(clamp(col,0.,1.),1.); }` }));
}
function renderPost(t, focusDist, s) {
  const look = LOOKS[(s.post || {}).look || POST.look || 'film'] || {};
  const p = Object.assign({ grade: 'film', bloom: 0.42, bloom_th: 0.92, bloom_r: 0.45, dof: 'auto', vignette: 0.6, grain: 0.055, exposure: 1.02, ca: 1.0, tone: 1.0, leak: 1.0, scan: 0 }, look, POST, s.post || {});
  const G = GRADES[p.grade] || GRADES.film, U = quad.material.uniforms;
  R.setRenderTarget(rt); R.render(scene, cam);
  if (p.bloom > 0) { bloom.strength = p.bloom; bloom.threshold = p.bloom_th; bloom.radius = p.bloom_r; bloom.render(R, null, rt, 0, false); }
  R.setRenderTarget(null);
  // DOF rule: the subject is always sharp and a whole frame is never soft. Blur only separates subject from background;
  // it fades out as focus distance grows (wides, reveals, aerials stay crisp) and is off for cameras with no subject.
  const c = s.cam || {}, ctype = c.type || 'medium', noSubject = !!(c.pos || c.path);
  const autoAp = noSubject ? 0 : ({ xclose: 0.010, close: 0.007, medium: 0.0035, low: 0.003, ots: 0.005, follow: 0.002, full: 0.002 }[ctype] || 0);
  const refD = { xclose: 1.8, close: 3.0, medium: 5.6, low: 4.8, ots: 4.0, follow: 8, full: 8.4 }[ctype] || 6;
  U.focus.value = focusDist; U.ap.value = (p.dof === 'auto' || p.dof === undefined ? autoAp : +p.dof) * Math.min(1, refD / Math.max(focusDist, 0.1)); U.near.value = cam.near; U.far.value = cam.far; U.time.value = t;
  U.con.value = G[0]; U.sat.value = G[1]; U.lift.value.set(...G[2]); U.gain.value.set(...G[3]); U.vig.value = p.vignette; U.grain.value = p.grain; U.ca.value = p.ca; U.tone.value = p.tone; U.leak.value = p.leak; U.scan.value = p.scan; U.ov.value = p.overlay === 'camcorder' ? 1 : 0; if (p.overlay === 'camcorder') U.tOv.value = camcorderOverlay(t, U.res.value.x, U.res.value.y); U.seed.value = SEED * 1.7; U.expo.value = p.exposure; U.flash.value = s.flash ? Math.max(0, 1 - t / 0.18) : 0;
  quad.render(R);
  if (OVER.children.length) { R.autoClear = false; R.clearDepth(); R.render(OVER, cam); R.autoClear = true; }
}

// ---------- physics props (Spin Trials): spinning / swinging / rolling bodies, riders, vectors, live readouts ----------
// Every physics prop has an id, a rotating group (rot), an angle th(t) and angular speed w(t), so riders, labels and
// cameras can follow it. Angles come from closed-form motion (spin = constant alpha, swing = eased keyframes, roll = v=Rw),
// so any frame can be rendered on its own and the physics shown on screen is exactly the physics being taught.
let PROPS = {}, PHYS = [], LABELS = [], OVER = new THREE.Scene();
const _ws = new THREE.Vector3();
function shown(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
const _wp = new THREE.Vector3();
// Floating text never overlaps: project every visible tag/label to the screen and, in priority order
// (screen-pinned HUD > cast tags > world labels > crowd tags), nudge later ones upward until they clear; crowd tags that
// still collide are hidden.
const _dv = new THREE.Vector3(), _cu = new THREE.Vector3(), _ws2 = new THREE.Vector3();
function declutter() {
  const th = Math.tan(cam.fov * D2R / 2), items = [], placed = [], m = 0.012;
  cam.updateMatrixWorld(); _cu.set(0, 1, 0).applyQuaternion(cam.quaternion);
  LABELS.forEach(l => { if (l.sp.visible) items.push({ sp: l.sp, pri: l.anchor.parent === cam || (l.anchor.parent && l.anchor.parent.parent === cam) ? 0 : 2, over: true }); });
  Object.values(actors).forEach(a => { if (a.tag && a.tag.visible) { a.tag.position.y = 3.85; items.push({ sp: a.tag, pri: 1, base: a }); } });
  npcs.forEach(n => { const t = n.tg || (n.a.root.children.find(c => c.isSprite)); if (t && t.visible && n.a.root.visible) { t.position.y = 3.85; items.push({ sp: t, pri: 3 }); } });
  items.sort((x, y) => x.pri - y.pri);
  for (const it of items) {
    for (let k = 0; k < 10; k++) {
      it.sp.updateMatrixWorld(); it.sp.getWorldPosition(_dv); const d = Math.max(_dv.distanceTo(cam.position), 0.1); it.sp.getWorldScale(_ws2); _dv.project(cam);
      if (_dv.z > 1) { break; }
      const hh = _ws2.y / 2 / (th * d), hw = _ws2.x / 2 / (th * d * cam.aspect), r = { x0: _dv.x - hw, x1: _dv.x + hw, y0: _dv.y - hh, y1: _dv.y + hh };
      const hit = placed.find(q => r.x0 < q.x1 + m && r.x1 > q.x0 - m && r.y0 < q.y1 + m && r.y1 > q.y0 - m);
      if (!hit || it.pri === 0) { placed.push(r); break; }
      if (it.pri === 3 || k === 9) { it.sp.visible = false; break; }
      const up = hit.y1 + m - r.y0 + 0.004, down = hit.y0 - m - r.y1 - 0.004, dyN = r.y1 + up < 0.94 ? up : down, dyW = dyN * th * d; // move up just enough to clear (down if that would leave the frame)
      if (it.over) it.sp.position.addScaledVector(_cu, dyW); else it.sp.position.y += dyW / Math.max(it.sp.parent.getWorldScale(_ws2).y, 0.01);
    }
  }
}
function minScreen(sprite, bw, bh, frac, ps = 1) { sprite.getWorldPosition(_wp); const d = Math.max(_wp.distanceTo(cam.position), 0.1), vh = 2 * Math.tan(cam.fov * D2R / 2) * d; let s = Math.max(1, frac * vh / (bh * ps)); s = Math.min(s, 0.9 * vh * cam.aspect / (bw * ps)); sprite.scale.set(bw * s, bh * s, 1); }
const easeBack = (u) => { u = Math.min(Math.max(u, 0), 1); const c = 1.6; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
function vis(p, t) { const s = p.show; if (!s) return 1; const a = s[0], b = s[1] === undefined ? 1e9 : s[1]; if (t < a || t > b + 0.25) return 0; const pop = p.grow === false ? 1 : easeBack((t - a) / 0.32); return t > b ? Math.max(0, 1 - (t - b) / 0.25) * pop : pop; }
// spin: number (rad/s) or {w: start rad/s, alpha: rad/s^2, at: s when alpha kicks in, max: speed cap (or floor when braking)}
function spinAt(sp, t) {
  if (!sp) return { th: 0, w: 0 };
  if (typeof sp === 'number') return { th: sp * t, w: sp };
  const w0 = sp.w || 0, al = sp.alpha || 0, t0 = sp.at || 0;
  if (!al || t <= t0) return { th: w0 * t, w: w0 };
  const target = sp.max !== undefined ? sp.max : (al > 0 ? 1e9 : 0), tm = Math.max((target - w0) / al, 0), tt = t - t0, tc = Math.min(tt, tm);
  return { th: w0 * t0 + w0 * tc + 0.5 * al * tc * tc + (tt > tm ? target * (tt - tm) : 0), w: tt < tm ? w0 + al * tt : target };
}
// swing: [[t, deg], ...] eased between keys; wobble adds a struggling tremor
function swingAt(keys, t, wob) {
  if (!keys || !keys.length) return { th: 0, w: 0 };
  const f = (x) => { if (x <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (x <= keys[i][0]) { const [t0, a0] = keys[i - 1], [t1, a1] = keys[i]; return lerp(a0, a1, ease((x - t0) / Math.max(t1 - t0, 1e-3))); } return keys[keys.length - 1][1]; };
  const wb = wob ? Math.sin(t * 23) * wob + Math.sin(t * 37) * wob * 0.5 : 0;
  return { th: (f(t) + wb) * D2R, w: (f(t + 0.01) - f(t - 0.01)) / 0.02 * D2R };
}
function motionOf(p) { return (t) => p.swing ? swingAt(p.swing, t, p.wobble) : spinAt(p.spin, t); }
const glow = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
function keepAll(o) { o.traverse(m => { if (m.isMesh) m.userData.keep = true; }); return o; }

function drawMath(g, text, W, H, color, maxW) { // "I = [1|12]ML²" -> stacked fraction
  const parts = [], re = /\[([^|\]]*)\|([^\]]*)\]/g; let last = 0, m;
  while ((m = re.exec(text))) { if (m.index > last) parts.push({ t: text.slice(last, m.index) }); parts.push({ n: m[1], d: m[2] }); last = re.lastIndex; }
  if (last < text.length) parts.push({ t: text.slice(last) });
  const frac = parts.some(p => p.n !== undefined); let s = H * (frac ? 0.46 : 0.66);
  const meas = () => { let ws = 0; for (const p of parts) { if (p.t !== undefined) { g.font = `900 ${s}px ${FONT}`; p.w = g.measureText(p.t).width; } else { g.font = `900 ${s * 0.66}px ${FONT}`; p.w = Math.max(g.measureText(p.n).width, g.measureText(p.d).width) + s * 0.24; } ws += p.w; } return ws; };
  let tw = meas(); if (tw > maxW) { s *= maxW / tw; tw = meas(); }
  let x = (W - tw) / 2; const cy = H / 2; g.fillStyle = color; g.textBaseline = 'middle';
  for (const p of parts) {
    if (p.t !== undefined) { g.font = `900 ${s}px ${FONT}`; g.textAlign = 'left'; g.fillText(p.t, x, cy); }
    else { g.font = `900 ${s * 0.66}px ${FONT}`; g.textAlign = 'center'; g.fillText(p.n, x + p.w / 2, cy - s * 0.42); g.fillText(p.d, x + p.w / 2, cy + s * 0.46); g.fillRect(x + s * 0.08, cy - s * 0.04, p.w - s * 0.16, s * 0.08); }
    x += p.w;
  }
}
function panelCanvas(text, o) { // holographic readout panel (the "in this world you can see physics" look)
  const W = 1024, H = Math.round(1024 * (o.h || 1) / (o.w || 3)), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = o.bg || 'rgba(12,20,34,.86)'; rrect(g, 8, 8, W - 16, H - 16, Math.min(60, H * 0.3)); g.fill();
  g.strokeStyle = o.border || o.color || '#5ef2c2'; g.lineWidth = 12; rrect(g, 8, 8, W - 16, H - 16, Math.min(60, H * 0.3)); g.stroke();
  drawMath(g, text, W, H, o.color || '#ffffff', W * 0.86); return c;
}
function mkLabel(p) { // floating readout; text may hold {} filled from bind (prop quantity) or from/to animation
  const g = new THREE.Group(), cv = panelCanvas('', p), tex = new THREE.CanvasTexture(cv); tex.colorSpace = SRGB;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, toneMapped: false })); sp.renderOrder = 10; sp.scale.set(p.w || 3, p.h || 1, 1); OVER.add(sp);
  let lastTxt = null; LABELS.push({ sp, anchor: g, w: p.w || 3, h: p.h || 1, frac: p.minh !== undefined ? p.minh : 0.045 });
  const value = (t) => { if (p.bind) { const pr = PROPS[p.bind.prop]; if (!pr) return 0; const st = pr.motion(t); const q = p.bind.q || 'w'; return q === 'w' ? Math.abs(st.w) : q === 'th' ? st.th : q === 'deg' ? st.th / D2R : q === 'v' ? Math.abs(pr.speed ? pr.speed(t) : 0) : q === 'rev' ? st.th / (2 * Math.PI) : q === 'd' ? (pr.dist ? pr.dist(t) : 0) : 0; } if (p.from !== undefined) return lerp(p.from, p.to, ease((t - (p.at || 0)) / Math.max(p.dur || 1, 0.01))); return 0; };
  return { o: g, step(t) { const txt = String(p.text || '').replace('{}', value(t).toFixed(p.dec !== undefined ? p.dec : 1)); if (txt !== lastTxt) { const c2 = panelCanvas(txt, p); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); cv.getContext('2d').drawImage(c2, 0, 0); tex.needsUpdate = true; lastTxt = txt; } } };
}
function mkArrowMesh(color, thick = 0.11) {
  const g = new THREE.Group(), m = glow(color, 1.15), dark = new THREE.MeshBasicMaterial({ color: '#0b0f18', toneMapped: false });
  const sg = new THREE.CylinderGeometry(thick, thick, 1, 14); sg.translate(0, 0.5, 0); const shaft = new THREE.Mesh(sg, m);
  const hg = new THREE.ConeGeometry(thick * 2.9, thick * 6.5, 20); hg.translate(0, thick * 3.25, 0); const head = new THREE.Mesh(hg, m);
  const og = new THREE.CylinderGeometry(thick * 1.45, thick * 1.45, 1, 14); og.translate(0, 0.5, 0); const out = new THREE.Mesh(og, dark); out.renderOrder = 8; // dark outline so it reads on any background
  const ohg = new THREE.ConeGeometry(thick * 3.6, thick * 8, 20); ohg.translate(0, thick * 4, 0); const outH = new THREE.Mesh(ohg, dark);
  [out, outH].forEach(o => { o.material.side = THREE.BackSide; }); [shaft, head].forEach(o => o.renderOrder = 9);
  g.add(out, outH, shaft, head); g.userData = { shaft, head, out, outH, hl: thick * 6.5 };
  g.setLen = (L) => { const hl = Math.min(g.userData.hl, L * 0.5); const s = Math.max(L - hl, 0.001); shaft.scale.y = s; out.scale.y = s; head.position.y = s; outH.position.y = s - 0.05; head.scale.setScalar(hl / g.userData.hl); outH.scale.setScalar(hl / g.userData.hl); g.visible = L > 0.02; };
  keepAll(g); g.traverse(o => { if (o.isMesh) o.castShadow = false; }); return g;
}
const _up = new THREE.Vector3(0, 1, 0);
function aim(g, from, dir, len) { g.position.copy(from); g.quaternion.setFromUnitVectors(_up, dir.clone().normalize()); g.setLen(len); }
function mkArrow(p) { // static or prop-attached vector: from [x,y,z] to [x,y,z] (in the prop's rotating frame when on: id)
  const g = new THREE.Group(), ar = mkArrowMesh(p.color || '#ff4d4d', p.thick || 0.11); g.add(ar);
  const a = new THREE.Vector3(...p.from), b = new THREE.Vector3(...p.to), d = b.clone().sub(a);
  let lb = null; if (p.label) { lb = mkLabel({ text: p.label, w: p.lw || 1.6, h: p.lh || 0.7, color: p.color || '#ff4d4d', border: p.color || '#ff4d4d' }); if (p.lat) lb.o.position.set(...p.lat); else lb.o.position.copy(b).add(d.clone().normalize().multiplyScalar(0.7)).add(new THREE.Vector3(0, 0.45, 0)); g.add(lb.o); lb.step(0); }
  return { o: g, step(t) { const k = vis(p, t); aim(ar, a, d, d.length() * Math.max(k, 0.001)); ar.visible = k > 0.01; if (lb) { lb.o.visible = k > 0.5; lb.o.scale.setScalar(Math.min(k, 1)); } } };
}
function mkTurntable(p) { // the Great Wheel: a giant spinning platform with radius rings painted on it
  const R = p.r || 11, g = new THREE.Group(), rot = new THREE.Group(); g.add(rot);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.55, R + 0.9, 0.5, 96), mat('#4f5868', { metalness: 0.35, roughness: 0.45 })); base.position.y = 0.25; base.receiveShadow = true; g.add(base);
  const lights = new THREE.Mesh(new THREE.TorusGeometry(R + 0.62, 0.09, 8, 192), glow('#ffd46b', 2.2)); lights.rotation.x = Math.PI / 2; lights.position.y = 0.52; g.add(lights);
  const top = canvasTex(2048, 2048, (cg, w, h) => {
    const cx = w / 2, cy = h / 2, rr = w / 2, N = 16;
    for (let i = 0; i < N; i++) { cg.fillStyle = i % 2 ? '#f4ecd8' : '#e2574c'; cg.beginPath(); cg.moveTo(cx, cy); cg.arc(cx, cy, rr, i / N * 6.2832, (i + 1) / N * 6.2832); cg.fill(); }
    for (let k = 2; k < R; k += 2) { cg.strokeStyle = 'rgba(30,30,40,.55)'; cg.lineWidth = 7; cg.setLineDash([26, 18]); cg.beginPath(); cg.arc(cx, cy, rr * k / R, 0, 6.2832); cg.stroke(); }
    cg.setLineDash([]); cg.font = `900 54px ${FONT}`; cg.textAlign = 'center'; cg.textBaseline = 'middle';
    for (let k = 2; k < R; k += 2) { const x = cx + rr * k / R; cg.fillStyle = 'rgba(20,24,34,.85)'; rrect(cg, x - 62, cy - 34, 124, 68, 18); cg.fill(); cg.fillStyle = '#ffffff'; cg.fillText(k + ' m', x, cy + 2); }
    cg.lineWidth = 22; cg.strokeStyle = '#2a2f3b'; cg.beginPath(); cg.arc(cx, cy, rr - 12, 0, 6.2832); cg.stroke();
    const sp = cg.createRadialGradient(cx, cy, 0, cx, cy, rr); sp.addColorStop(0, 'rgba(0,0,0,0)'); sp.addColorStop(1, 'rgba(0,0,0,.12)'); cg.fillStyle = sp; cg.fillRect(0, 0, w, h);
  });
  const side = tmat('ttside', 256, 64, (cg, w, h) => { cg.fillStyle = '#c9a75c'; cg.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 32) { cg.fillStyle = '#8f6f2c'; cg.fillRect(x, 0, 4, h); } cg.fillStyle = 'rgba(255,255,255,.25)'; cg.fillRect(0, 6, w, 5); }, 24, 1);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.45, 128), [side, new THREE.MeshStandardMaterial({ map: top, roughness: 0.7 }), side]); deck.position.y = 0.73; deck.castShadow = deck.receiveShadow = true; rot.add(deck);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 2.2, 24), tmat('hub', 128, 128, (cg, w, h) => { for (let i = 0; i < 8; i++) { cg.fillStyle = i % 2 ? '#f4ecd8' : '#3a6fd8'; cg.fillRect(i * w / 8, 0, w / 8, h); } }, 1, 1)); hub.position.y = 2.05; hub.castShadow = true; rot.add(hub);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 10, 0, 6.2832, 0, Math.PI / 2), mat('#ffd46b', { metalness: 0.5, roughness: 0.3 })); cap.position.y = 3.15; rot.add(cap);
  keepAll(rot); return { o: g, rot, top: 0.96, axis: 'y', frame: 2.2, focusY: 0, apply(th) { rot.rotation.y = th; } };
}
function mkDoor(p) { // the Vault Door: hinge at the prop origin, leaf along +x, opens away from +z
  const W = p.w || 6, Hh = p.h || 7.5, g = new THREE.Group(), rot = new THREE.Group(); g.add(rot);
  const stone = tmat('vaultstone', 256, 256, P.slab, 2, 4), stoneW = tmat('vaultstoneW', 256, 256, P.slab, 4, 1);
  const pl = box(1.4, Hh + 1.2, 1.6, stone, 0.08); pl.position.set(-0.75, (Hh + 1.2) / 2, -0.3); const pr = box(1.4, Hh + 1.2, 1.6, stone, 0.08); pr.position.set(W + 0.75, (Hh + 1.2) / 2, -0.3);
  const li = box(W + 2.9, 1.3, 1.7, stoneW, 0.08); li.position.set(W / 2, Hh + 1.2 + 0.65, -0.3); g.add(pl, pr, li);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.9), new THREE.MeshBasicMaterial({ map: canvasTex(1024, 160, (cg, w, h) => { cg.fillStyle = '#1d2433'; cg.fillRect(0, 0, w, h); fitText(cg, p.text || 'TRIAL 2  ·  THE VAULT DOOR', w, h * 0.8, '#ffd46b'); }) })); sign.position.set(W / 2, Hh + 1.85, 0.56); g.add(sign);
  const leafT = canvasTex(1024, 1280, (cg, w, h) => { const gr = cg.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#9aa5b5'); gr.addColorStop(1, '#5c6676'); cg.fillStyle = gr; cg.fillRect(0, 0, w, h); cg.strokeStyle = 'rgba(20,24,30,.5)'; cg.lineWidth = 10; cg.strokeRect(40, 40, w - 80, h - 80); cg.strokeRect(90, 90, w - 180, h - 180); cg.fillStyle = '#3d4552'; for (let i = 0; i < 9; i++) for (const y of [64, h - 64]) { cg.beginPath(); cg.arc(64 + i * (w - 128) / 8, y, 13, 0, 7); cg.fill(); } for (let i = 0; i < 11; i++) for (const x of [64, w - 64]) { cg.beginPath(); cg.arc(x, 64 + i * (h - 128) / 10, 13, 0, 7); cg.fill(); } });
  const leaf = box(W, Hh, 0.55, [mat('#6b7584'), mat('#6b7584'), mat('#7a8494'), mat('#5b6573'), new THREE.MeshStandardMaterial({ map: leafT, metalness: 0.55, roughness: 0.38 }), new THREE.MeshStandardMaterial({ map: leafT, metalness: 0.55, roughness: 0.38 })], 0.06); leaf.position.set(W / 2, Hh / 2, 0); rot.add(leaf);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.09, 10, 40), mat('#d9b24a', { metalness: 0.7, roughness: 0.25 })); wheel.position.set(W - 1.15, Hh * 0.5, 0.42); rot.add(wheel);
  for (let i = 0; i < 3; i++) { const sp = box(1.5, 0.12, 0.12, mat('#d9b24a', { metalness: 0.7, roughness: 0.25 }), 0.02); sp.position.copy(wheel.position); sp.rotation.z = i * Math.PI / 3; rot.add(sp); }
  [Hh * 0.18, Hh * 0.82].forEach(y => { const hg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 16), mat('#3a414d', { metalness: 0.6, roughness: 0.35 })); hg.position.set(0, y, 0); rot.add(hg); });
  keepAll(rot); g.userData.solid = true; return { o: g, rot, top: 0, axis: 'y', frame: 2.0, focusX: W / 2, apply(th) { rot.rotation.y = th; } };
}
function mkStaff(p) { // a uniform rod, spun (or struggled with) in the plane facing the camera; grip 'end' or 'center'
  const L = p.len || 3.6, g = new THREE.Group(), rot = new THREE.Group(); g.add(rot); rot.position.y = p.y || 2.2;
  const rodT = tmat('staffrod', 256, 32, (cg, w, h) => { cg.fillStyle = '#d9a63a'; cg.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 64) { cg.fillStyle = '#7a3fd0'; cg.fillRect(x, 0, 18, h); } cg.fillStyle = 'rgba(255,255,255,.3)'; cg.fillRect(0, 4, w, 4); }, 1, 4);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, L, 20), rodT); rod.rotation.z = Math.PI / 2; rod.position.x = p.grip === 'end' ? L / 2 : 0; rod.castShadow = true; rot.add(rod);
  [-L / 2, L / 2].forEach(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat('#7a3fd0', { metalness: 0.3, roughness: 0.35 })); e.position.x = rod.position.x + x; e.castShadow = true; rot.add(e); });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 16), mat('#2a2a2a', { roughness: 0.9 })); grip.rotation.z = Math.PI / 2; grip.position.x = p.grip === 'end' ? 0.25 : 0; rot.add(grip);
  const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), glow('#5ef2c2', 1.5)); pivot.position.z = 0.12; rot.add(pivot);
  keepAll(rot); return { o: g, rot, top: 0, axis: 'z', frame: 1, apply(th) { rot.rotation.z = -th; } };
}
function wheelFace(kind) { return canvasTex(1024, 1024, (cg, w, h) => { const cx = w / 2, r = w / 2;
  if (kind === 'hoop') { cg.clearRect(0, 0, w, h); return; }
  for (let i = 0; i < 8; i++) { cg.fillStyle = i % 2 ? '#e9e2d0' : '#3a6fd8'; cg.beginPath(); cg.moveTo(cx, cx); cg.arc(cx, cx, r, i / 8 * 6.2832, (i + 1) / 8 * 6.2832); cg.fill(); }
  cg.fillStyle = '#ffd46b'; cg.beginPath(); cg.arc(cx, cx, r * 0.16, 0, 7); cg.fill(); cg.strokeStyle = '#1d2433'; cg.lineWidth = 18; cg.beginPath(); cg.arc(cx, cx, r - 9, 0, 7); cg.stroke(); }); }
function mkFlywheel(p) { // disk (I = ½MR²) or hoop (I = MR²) on a stand; spins about the axis pointing at the camera
  const Rw = p.r || 2.4, kind = p.kind || 'disk', g = new THREE.Group(), rot = new THREE.Group(); g.add(rot); const hy = p.axle || Rw + 0.7; rot.position.y = hy;
  const post = mat('#4f5868', { metalness: 0.4, roughness: 0.4 });
  [-1, 1].forEach(sx => { const leg = box(0.3, hy + 0.3, 0.3, post, 0.04); leg.position.set(sx * 0.55, (hy + 0.3) / 2 - 0.1, -0.7); leg.rotation.z = -sx * 0.18; g.add(leg); });
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 16), mat('#2f3540', { metalness: 0.6, roughness: 0.3 })); axle.rotation.x = Math.PI / 2; axle.position.set(0, hy, -0.35); g.add(axle);
  const foot = box(2.4, 0.25, 1.4, post, 0.04); foot.position.set(0, 0.12, -0.7); g.add(foot);
  if (kind === 'hoop') {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(Rw - 0.25, 0.25, 18, 120), mat('#e2b53a', { metalness: 0.75, roughness: 0.22 })); rim.castShadow = true; rot.add(rim);
    for (let i = 0; i < 4; i++) { const sp = box(Rw * 2 - 0.5, 0.06, 0.06, mat('#9aa3ad', { metalness: 0.5 }), 0.01); sp.rotation.z = i * Math.PI / 4; rot.add(sp); }
    const mk = box(0.5, 0.52, 0.52, mat('#e2574c'), 0.06); mk.position.set(0, Rw - 0.25, 0); rot.add(mk);
  } else {
    const ft = wheelFace('disk'), fm = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55, metalness: 0.15 });
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(Rw, Rw, 0.5, 96), [mat('#2a2f3b', { roughness: 0.8 }), fm, fm]); disk.rotation.x = Math.PI / 2; disk.castShadow = true; rot.add(disk);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.7, 20), mat('#ffd46b', { metalness: 0.6, roughness: 0.3 })); hub.rotation.x = Math.PI / 2; rot.add(hub);
  keepAll(rot); let wt = null, rope = null; if (p.weight) {
    wt = box(0.7, 0.7, 0.7, tmat('weightblk', 128, 128, (cg, w, h) => { cg.fillStyle = '#3b4250'; cg.fillRect(0, 0, w, h); cg.fillStyle = '#ffd46b'; cg.font = `900 52px ${FONT}`; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText('kg', w / 2, h / 2); }, 1, 1), 0.06); g.add(wt);
    const rg = new THREE.CylinderGeometry(0.03, 0.03, 1, 6); rg.translate(0, -0.5, 0); rope = new THREE.Mesh(rg, mat('#e9e2d0')); rope.position.set(0.34, hy, 0.5); g.add(rope); keepAll(g);
  }
  return { o: g, rot, top: 0, axis: 'z', frame: 1.5, apply(th) { rot.rotation.z = -th; if (wt) { const y = Math.max(hy - 1.6 - 0.34 * th, 0.36); wt.position.set(0.34, y, 0.5); rope.scale.y = hy - y - 0.35; } } };
}
function mkRoller(p) { // a wheel rolling without slipping along a line: x = d(t), angle = d/R; dot sticker, cycloid trail, point-velocity vectors
  const Rw = p.r || 3, g = new THREE.Group(), car = new THREE.Group(), rot = new THREE.Group(); g.add(car); car.add(rot); rot.position.y = Rw;
  const ft = wheelFace('disk'), fm = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55, metalness: 0.15 });
  const tread = tmat('tread', 256, 64, (cg, w, h) => { cg.fillStyle = '#23262d'; cg.fillRect(0, 0, w, h); cg.fillStyle = '#3a3f49'; for (let x = 0; x < w; x += 24) cg.fillRect(x, 6, 12, h - 12); }, 24, 1);
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(Rw, Rw, 0.9, 96), [tread, fm, fm]); disk.rotation.x = Math.PI / 2; disk.castShadow = true; rot.add(disk);
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.95, 24), glow('#ff3b8d', 1.4)); dot.rotation.x = Math.PI / 2; dot.position.set(0, -(Rw - 0.42), 0); rot.add(dot);
  const v0 = p.v || 6, acc = p.a || 0, t0 = p.at || 0, tstop = acc < 0 ? v0 / -acc : 1e9;
  const dist = (t) => { const tt = Math.max(t - t0, 0), tc = Math.min(tt, tstop); return v0 * tc + 0.5 * acc * tc * tc; };
  const speed = (t) => (t < t0 ? (p.idle ? 0 : v0) : t - t0 > tstop ? 0 : v0 + acc * (t - t0));
  const dir = (p.dir || 0) * D2R; // travel direction in the world (0 = +x)
  let trail = null; if (p.trail) { const N = 240, tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: '#ff3b8d', toneMapped: false })); trail.frustumCulled = false; g.add(trail); }
  const vecs = p.vectors ? [['2v', '#ffd46b', 2 * Rw, 2], ['v', '#5ef2c2', Rw, 1], ['0', '#ff6b6b', 0.05, 0]].map(([lab, col, y, k]) => { const a = mkArrowMesh(col, 0.13); const lb = mkLabel({ text: lab === '0' ? 'v = 0' : lab, w: lab === '0' ? 1.7 : 1.1, h: 0.62, color: col, border: col }); car.add(a, lb.o); lb.step(0); return { a, lb, y, k }; }) : [];
  const out = { o: g, rot, top: 0, axis: 'z', frame: 1.6, speed, dist, motion: (t) => ({ th: dist(t) / Rw, w: speed(t) / Rw }),
    apply(th, t) { const d = dist(t); car.position.set(Math.cos(dir) * d, 0, -Math.sin(dir) * d); car.rotation.y = dir; rot.rotation.z = -th;
      const sc = (p.vscale || 0.35), v = speed(t), kv = vis({ show: p.vectors_show, grow: true }, t);
      vecs.forEach(({ a, lb, y, k }) => { const L = k * v * sc * kv; aim(a, new THREE.Vector3(0.75, y, 0.62), new THREE.Vector3(1, 0, 0), Math.max(L, 0.001)); a.visible = L > 0.05; lb.o.position.set(0.75 + Math.max(L, 0.3) + 0.9, y + (k === 0 ? -0.1 : 0.25), 0.62); lb.o.visible = kv > 0.5; });
      if (trail) { const pos = trail.geometry.attributes.position, N = pos.count; for (let i = 0; i < N; i++) { const ts = t0 + (t - t0) * i / (N - 1), di = dist(ts), an = di / Rw; const lx = di + Math.sin(an) * (Rw - 0.42), ly = Rw - Math.cos(an) * (Rw - 0.42); pos.setXYZ(i, Math.cos(dir) * lx, ly, -Math.sin(dir) * lx + 0.5); } pos.needsUpdate = true; } } };
  out.track = car; out.yawExtra = dir; keepAll(car); return out;
}
const PHYSMAKERS = { turntable: mkTurntable, door: mkDoor, staff: mkStaff, flywheel: mkFlywheel, roller: mkRoller };
function makePhys(p) {
  let r;
  if (p.type === 'label') r = mkLabel(p); else if (p.type === 'arrow') r = mkArrow(p); else r = PHYSMAKERS[p.type](p);
  const o = r.o; const [x, z] = p.pos || [0, 0]; o.position.set(x, p.type === 'label' || p.type === 'arrow' ? 0 : (p.lift || 0), z); o.rotation.y = (p.face || 0) * D2R;
  if (p.type === 'label' && p.at3) o.position.set(...p.at3);
  if (p.hud) { const d = 3, hh = Math.tan(20 * D2R) * d; cam.add(o); o.position.set(p.hud[0] * hh * cam.aspect, p.hud[1] * hh, -d); o.rotation.set(0, 0, 0); }
  if (p.hud) { /* placed on the camera above */ } else if (p.on && PROPS[p.on]) { (p.frame === 'base' && PROPS[p.on].track ? PROPS[p.on].track : PROPS[p.on].rot).add(o); o.position.set(...(p.at3 || [0, 0, 0])); o.rotation.set(0, 0, 0); } else scene.add(o);
  o.traverse(m => { if (m.isMesh && m.castShadow !== false && p.type !== 'arrow') { m.castShadow = m.receiveShadow = true; } });
  const motion = r.motion || motionOf(p), rec = Object.assign(r, { p, motion, yaw0: o.rotation.y });
  rec.focus = new THREE.Vector3(x + Math.cos(o.rotation.y) * (r.focusX || 0), 0, z - Math.sin(o.rotation.y) * (r.focusX || 0));
  rec.focusNow = () => r.track ? r.track.getWorldPosition(new THREE.Vector3()).setY(0) : rec.focus.clone();
  if (o.userData.solid) { o.updateMatrixWorld(true); solids.push(new THREE.Box3().setFromObject(o).expandByScalar(0.3)); }
  if (p.id) PROPS[p.id] = rec; PHYS.push(rec); return rec;
}
function stepPhys(t) {
  for (const r of PHYS) {
    const st = r.motion(t); if (r.apply) r.apply(st.th, t); if (r.step) r.step(t);
    if (r.p.show && r.p.type !== 'arrow') { const k = vis(r.p, t); r.o.visible = k > 0.01; if (r.p.type === 'label') r.o.scale.setScalar(Math.max(k, 0.001)); }
  }
  scene.updateMatrixWorld();
}
// riders: an actor standing on / pushing a physics prop, given in the prop's rotating frame: ride: {on: id, at: [x, z], y?}
const _rv = new THREE.Vector3();
function ridePos(spec, t) {
  const pr = PROPS[spec.ride.on]; if (!pr) return null; pr.apply && pr.apply(pr.motion(t).th, t);
  const base = spec.ride.frame === 'base' && pr.track ? pr.track : pr.rot; base.updateMatrixWorld(true);
  const [lx, lz] = spec.ride.at || [0, 5]; const p = base.localToWorld(_rv.set(lx, (spec.ride.y !== undefined ? spec.ride.y : pr.top || 0) - base.position.y, lz)).clone();
  const st = pr.motion(t); if (base === pr.track) return { p, yaw: pr.yaw0 + (pr.yawExtra || 0), v: Math.abs(pr.speed(t)) };
  return { p, yaw: pr.yaw0 + (pr.axis === 'y' ? st.th : 0), v: Math.hypot(lx, lz) * Math.abs(st.w) };
}

// ---------- api ----------
window.ENGINE = {
  camState() { return [cam.position.toArray(), cam.quaternion.toArray(), cam.fov]; }, // camera pose, for pacing tests
  dbg() { const cp = cam.position; return { cam: cp.toArray().map(v => +v.toFixed(2)), near: npcs.map((n, j) => ({ j, id: n.a.id, v: n.a.root.visible, p: n.a.root.position.toArray().map(v => +v.toFixed(2)), d: +n.a.root.position.distanceTo(cp).toFixed(2), walk: !!n.spec.walk })).filter(o => o.d < 9), cast: Object.values(actors).map(a => [a.id, a.root.position.toArray().map(v => +v.toFixed(2))]) }; }, // what stands near the lens (for debugging a blocked shot)
  init(w, h, opts = {}) {
    R = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true }); R.setPixelRatio(1); R.setSize(w, h);
    HQ = !!opts.hq; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFShadowMap; SHADOW = opts.shadow || (HQ ? 4096 : 2048); R.toneMapping = THREE.NoToneMapping; document.body.appendChild(R.domElement);
    POST = opts.post || {}; cam = new THREE.PerspectiveCamera(40, w / h, 0.25, 1000); makePost(w, h); return true;
  },
  setup(s, chars, seed) {
    if (scene) { const ms = new Set(); scene.traverse(o => { if (o.geometry && o.geometry !== HEADGEO && o.geometry !== CAPGEO) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => ms.add(m)); }); ms.forEach(m => m.dispose()); Object.values(TEXS).forEach(t => t.dispose()); }
    scene = new THREE.Scene(); shot = s; UB = null; SEED = seed || 1; TC = s._start || 0; actors = {}; npcs = []; cars = []; MATS = {}; TEXS = {};
    while (cam.children.length) cam.remove(cam.children[0]); scene.add(cam); if ((s.cam || {}).foreground) foreground(s.cam.foreground);
    if (s.cam) { delete s.cam._curve; delete s.cam._anchor; delete s.cam._sm; }
    const c0 = (s.cast || [])[0]; const cp = c0 ? pathPts(c0)[0] : new THREE.Vector3(); CENTER.copy(cp).setY(0);
    const setName = s.set || 'street'; buildSet(setName, s.set_text); sun = lighting(s.time || 'day', setName); buildSky(s.time || 'day', setName);
    const isPhys = (p) => PHYSMAKERS[p.type] || p.type === 'label' || p.type === 'arrow';
    (s.props || []).forEach(p => { if (!isPhys(p)) makeProp(p); }); bake();
    PROPS = {}; PHYS = []; LABELS = []; OVER = new THREE.Scene(); (s.props || []).forEach(p => { if (isPhys(p)) makePhys(p); });
    (s.cast || []).forEach(c => { if (chars[c.id]) actors[c.id] = makeActor(c.id, chars[c.id]); });
    spawnNpcs(s, setName); fx = makeFx(s.fx);
    if (Array.isArray(s.npc_tag)) { const rr = prng(SEED * 31 + 7), cols = [].concat(s.npc_tag_color || '#5ef2c2'); // a list: every extra gets one of these tags (e.g. ages)
      npcs.forEach(nn => { const k = Math.floor(rr() * s.npc_tag.length), tx = String(s.npc_tag[k]), tg = tagSprite(tx, cols[k % cols.length]); tg.position.y = 3.85; tg.scale.set(Math.max(1.3, 0.19 * tx.length), 0.42, 1); nn.a.root.add(tg); nn.tg = tg; }); }
    else if (s.npc_tag) npcs.forEach(n => { if (!n.spec.cheer) return; const tg = tagSprite(s.npc_tag, s.npc_tag_color || '#5ef2c2'); tg.position.y = 3.85; tg.scale.set(1.3, 0.42, 1); n.a.root.add(tg); n.tg = tg; });
    if (s.npc_tags) { // "in this world, everyone can see physics": speed readouts over walkers and cars
      npcs.forEach(n => { if (!n.spec.walk) return; const v = Math.hypot(n.spec.walk[2], n.spec.walk[3]), tg = tagSprite(`v = ${v.toFixed(1)} m/s`, '#5ef2c2'); tg.position.y = 3.85; tg.scale.set(2.0, 0.48, 1); n.a.root.add(tg); });
      cars.forEach(c => { const tg = tagSprite(`v = ${Math.abs(c.v).toFixed(0)} m/s`, '#ffd46b'); tg.position.y = 3.0; tg.scale.set(2.6, 0.62, 1); c.o.add(tg); });
    }
    return Object.keys(actors).length;
  },
  frame(t, dur, amps) { this.draw(t, dur, amps); return R.domElement.toDataURL('image/jpeg', 0.9); },
  draw(t, dur, amps) {
    if (!shot._occl) { shot._occl = 1; hideBlockers(dur); } // first: it scrubs actors/camera through the whole shot, so frame 0 must be placed after it
    stepPhys(t);
    (shot.cast || []).forEach(c => { const a = actors[c.id]; if (a) placeActor(a, c, t, dur); });
    (shot.cast || []).forEach(c => actors[c.id] && actorPose(actors[c.id], c, t, dur, (amps || {})[c.id] || 0));
    stepNpcs(t); stepSky(t);
    const fd = camPose(shot.cam || {}, t, dur); cam.updateMatrixWorld();
    LABELS.forEach(l => { const on = shown(l.anchor); l.sp.visible = on; if (!on) return; l.anchor.getWorldPosition(l.sp.position); l.anchor.getWorldScale(_ws); minScreen(l.sp, l.w, l.h, l.frac); l.sp.scale.multiplyScalar(_ws.x); });
    Object.values(actors).forEach(a => { if (a.tag && a.tag.visible !== false) { const b = a.tag.userData.base || (a.tag.userData.base = [a.tag.scale.x, a.tag.scale.y]); minScreen(a.tag, b[0], b[1], shot.tag_min || 0.03, a.def.scale || 1); } });
    declutter();
    const ctr = Object.values(actors)[0] ? Object.values(actors)[0].root.position.clone().setY(0) : new THREE.Vector3();
    const sd = sun.userData.dir || (sun.userData.dir = sun.position.clone().normalize()); sun.target.position.copy(ctr); sun.position.copy(ctr).addScaledVector(sd, 45);
    stepFx(t, cam.position.clone().setY(0)); renderPost(t, fd, shot);
  },
};
// extras that would block the subject or pop into the lens at any point of the shot are hidden for the whole shot (no popping)
function hideBlockers(dur) {
  const c = shot.cam || {}, fwd = new THREE.Vector3(), hide = new Set(), hideL = new Set();
  for (let i = 0; i <= 8; i++) {
    const ts = dur * i / 8;
    stepPhys(ts); (shot.cast || []).forEach(k => { const a = actors[k.id]; if (a) placeActor(a, k, ts, dur); });
    (shot.cast || []).forEach(k => actors[k.id] && actorPose(actors[k.id], k, ts, dur, 0)); // facing matters: cameras are placed relative to it
    stepNpcs(ts); const fd = camPose(c, ts, dur); cam.updateMatrixWorld(); cam.getWorldDirection(fwd); const cp = cam.position;
    npcs.forEach((n, j) => { const p = n.a.root.position, dx = p.x - cp.x, dy = p.y + 1.6 - cp.y, dz = p.z - cp.z, al = dx * fwd.x + dy * fwd.y + dz * fwd.z, pe = Math.sqrt(Math.max(dx * dx + dy * dy + dz * dz - al * al, 0));
      let block = al > -0.5 && ((al < fd - 1.8 && pe < 1.25) || (al < 4.5 && pe < al * 0.75 + 0.9));
      if (!block && al > 0.3 && al < (shot.clear_fg ? fd - 3 : Math.min(fd - 1.5, 9))) { _rv.set(p.x, p.y + 1.6, p.z).project(cam); block = Math.abs(_rv.x) < 1.15 && Math.abs(_rv.y) < 1.15; } // extras in the foreground of a dialogue/medium shot
      if (block) hide.add(j); });
    clutter.forEach((l, j) => { const lp = l.position, dx = lp.x - cp.x, dz = lp.z - cp.z, fh = Math.hypot(fwd.x, fwd.z) || 1, al = (dx * fwd.x + dz * fwd.z) / fh, pe = Math.abs(dx * fwd.z - dz * fwd.x) / fh;
      if (al > 0 && al < fd - 1.5 && pe < Math.max(1.2, al * 0.38 * Math.tan((cam.fov || 40) * D2R / 2) * 2)) hideL.add(j); });
  }
  c._sm = null; c._anchor = null; UB = null; npcs.forEach((n, j) => { n.a.root.visible = !hide.has(j); }); clutter.forEach((l, j) => { l.visible = !hideL.has(j) && !(shot.gather && l.userData.kind === 'bench'); }); stepPhys(0);
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
