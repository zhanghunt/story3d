// gpu_main.js - renders a whole story job on the local GPU in Chrome, encodes H.264 with WebCodecs, downloads one MP4.
import './engine.js';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
const job = JSON.parse(document.getElementById('job').textContent);
const status = (s) => { document.title = s; const el = document.getElementById('st'); if (el) el.textContent = s; };
const dequeue = (enc) => new Promise(r => enc.addEventListener('dequeue', r, { once: true }));
async function run() {
  const { W, H, fps, shots, chars, post } = job;
  ENGINE.init(W, H, { post, hq: job.hq !== false });
  const cv = document.querySelector('canvas'); cv.style.width = '270px'; cv.style.height = '480px';
  const tries = [['avc', { codec: 'avc1.640033', hardwareAcceleration: 'prefer-hardware', avc: { format: 'avc' } }], ['avc', { codec: 'avc1.640033', avc: { format: 'avc' } }], ['vp9', { codec: 'vp09.00.40.08' }]];
  let pick = null; for (const [mc, c] of tries) { const cfg = { width: W, height: H, bitrate: 18e6, framerate: fps, ...c }; if ((await VideoEncoder.isConfigSupported(cfg)).supported) { pick = [mc, cfg]; break; } }
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
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = job.out || 'story_frames.mp4'; document.body.appendChild(a); a.click();
  window.DONE = { frames: fi, secs: +((performance.now() - t0) / 1000).toFixed(1), file: a.download };
  status(`DONE ${fi} frames in ${window.DONE.secs}s -> ${a.download}`);
}
run().catch((e) => { window.FAIL = String(e && e.stack || e); status('FAILED ' + e); });
