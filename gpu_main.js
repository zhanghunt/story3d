// gpu_main.js - renders a whole story job on the local GPU in Chrome, encodes H.264 with WebCodecs, downloads one MP4.
import './engine.js';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
const job = JSON.parse(document.getElementById('job').textContent);
const status = (s) => { document.title = s; const el = document.getElementById('st'); if (el) el.textContent = s; };
const dequeue = (enc) => new Promise(r => enc.addEventListener('dequeue', r, { once: true }));
// When served as a claude.ai artifact the page saves through the platform's downloads capability (iframes can't download directly).
// Ask for it only after rendering: if the viewer was still loading when the page started, an early use() resolves null.
const getDl = () => (window.claude && window.claude.use) ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
async function run() {
  const { W, H, fps, shots, chars, post } = job;
  ENGINE.init(W, H, { post, hq: job.hq !== false });
  const cv = document.querySelector('canvas'); cv.style.width = '270px'; cv.style.height = '480px';
  const tries = [['avc', { codec: 'avc1.640033', hardwareAcceleration: 'prefer-hardware', avc: { format: 'avc' } }], ['avc', { codec: 'avc1.640033', avc: { format: 'avc' } }], ['vp9', { codec: 'vp09.00.40.08' }]];
  let pick = null; for (const [mc, c] of tries) { const cfg = { width: W, height: H, bitrate: job.bitrate || 12e6, framerate: fps, ...c }; if ((await VideoEncoder.isConfigSupported(cfg)).supported) { pick = [mc, cfg]; break; } }
  if (!pick) throw new Error('no supported video encoder');
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: pick[0], width: W, height: H, frameRate: fps }, fastStart: 'in-memory' });
  let err = null;
  const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { err = e; } });
  enc.configure(pick[1]); window.CODEC = pick[1].codec;
  const total = shots.reduce((a, s) => a + s.n, 0), t0 = performance.now(); let fi = 0;
  for (let si = 0; si < shots.length; si++) {
    const s = shots[si]; ENGINE.setup(s.spec, chars, si + 1);
    for (let f = 0; f < s.n; f++) {
      ENGINE.draw(f / fps, s.dur, s.amps[f] || {});
      const vf = new VideoFrame(cv, { timestamp: Math.round(fi * 1e6 / fps), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: fi % (fps * 2) === 0 }); vf.close(); fi++;
      if (err) throw err;
      if (enc.encodeQueueSize > 6) await dequeue(enc);
      if (fi % 10 === 0) { status(`RENDER ${Math.round(fi / total * 100)}% (${fi}/${total})`); await new Promise(r => queueMicrotask(r)); }
    }
  }
  await enc.flush(); muxer.finalize();
  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = job.out || 'story_frames.mp4'; document.body.appendChild(a);
  window.DONE = { frames: fi, secs: +((performance.now() - t0) / 1000).toFixed(1), file: a.download };
  // Chrome only allows downloads started by a click, so offer a big button (and try once anyway).
  const btn = document.createElement('button'); btn.textContent = `Save video (${(blob.size / 1e6).toFixed(0)} MB)`;
  btn.style.cssText = 'display:block;margin:12px 8px;padding:18px 28px;font:700 22px sans-serif;background:#22c55e;color:#0b1a0f;border:0;border-radius:12px;cursor:pointer';
  let dl = await getDl(); btn.id = 'save';
  btn.onclick = async () => {
    if (!dl && window.claude) dl = await getDl();
    if (dl) { try { btn.textContent = 'Saving...'; await dl.save({ filename: a.download, data: blob }); btn.textContent = 'Saved: ' + a.download; window.SAVED = 1; status('SAVED ' + a.download); } catch (e) { btn.textContent = 'Save failed: ' + (e && (e.code || e.message) || e) + ' - click to retry'; } }
    else if (window.claude) { btn.textContent = 'Saving is not available yet - click to retry'; }
    else { a.click(); btn.textContent = 'Saved to Downloads: ' + a.download; window.SAVED = 1; }
  };
  document.body.insertBefore(btn, document.body.children[1] || null);
  if (!dl && !window.claude) try { a.click(); } catch (e) { }
  if (dl && job.autosave !== false) setTimeout(() => btn.onclick(), 300); // ask the viewer right away (claude.ai shows its own confirmation)
  status(`DONE ${fi} frames in ${window.DONE.secs}s - click Save video`);
}
run().catch((e) => { window.FAIL = String(e && e.stack || e); status('FAILED ' + e); });
