# story3d

Renders Roblox-style (R6, round-head) blocky 3D story Shorts (1080x1920) from a `story.json`:
three.js scenes, offline Kokoro voices, synthesized sound effects, burned-in captions.

```
npm install
python3 -I story3d.py examples/three_wishes.json work out.mp4 --voice-only   # timing
python3 -I story3d.py examples/three_wishes.json work out.mp4 --stills       # one frame per shot
python3 -I story3d.py examples/three_wishes.json work out.mp4                # full render (headless Chromium)
python3 -I story3d.py examples/three_wishes.json work out.mp4 --gpu          # work/job.html: open in Chrome on a GPU machine
python3 -I story3d.py examples/three_wishes.json work out.mp4 --finish frames.mp4   # add captions + voice + sfx
```

Files: `engine.js` (three.js renderer), `gpu_main.js` (in-browser WebCodecs render+encode), `story3d.py` (driver).
Needs Python packages `kokoro-onnx soundfile playwright numpy`, ffmpeg, Node 18+.
