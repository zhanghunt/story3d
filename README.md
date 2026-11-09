# story3d

Renders Roblox-style (R6, round-head) blocky 3D story Shorts (1080x1920) from a `story.json`:
three.js scenes, offline Kokoro voices, synthesized sound effects, burned-in captions.

```
npm install
python3 -I story3d.py stories/three_wishes.json work out.mp4 --voice-only   # timing
python3 -I story3d.py stories/three_wishes.json work out.mp4 --stills       # one frame per shot
python3 -I story3d.py stories/three_wishes.json work out.mp4                # full render (headless Chromium)
python3 -I story3d.py stories/three_wishes.json work out.mp4 --gpu          # work/job.html: open in Chrome on a GPU machine
python3 -I story3d.py stories/three_wishes.json work out.mp4 --finish frames.mp4   # add captions + voice + sfx
```

Folders: `stories/` (story scripts, pushed), `renders/` (render pages + finished videos, kept local, not pushed).

Files: `engine.js` (three.js renderer), `gpu_main.js` (in-browser WebCodecs render+encode), `story3d.py` (driver).
Needs Python packages `kokoro-onnx soundfile playwright numpy`, ffmpeg, Node 18+.

## Story options worth knowing

- **Narrator**: female `af_jessica` by default. Override with `narrator_voice`, shift with `narrator_pitch` (semitones). Any line or character can take `pitch` too (e.g. `+3` for kid voices). Pitch shifting is formant-preserving.
- **fps**: 60 for `--gpu` / `--finish` renders, 30 for cloud renders; set `fps` in the story to force one.
- **Big scenes**: sets `street` (now a town grid with back streets), `plaza` (town square), `space` (planet, ring station, observation deck), plus `city`, `park`, `room`, `classroom`, `stage`, `studio`.
- **Crowds**: `crowd: N` per shot; `gather: [x, z, minR, maxR, dirDeg, arcDeg]` packs the crowd around a focal point facing it, and `cheer: 0.3` is the share of the crowd that cheers. Extras that would block the subject are hidden for the whole shot.
- **Zoom-outs**: camera `move: "reveal"` / `"zoomout"` (start on the subject, pull up and out), `"descend"` (the reverse), with `reveal_dist`, `reveal_height`, `spin`. `angle: 180` reveals from behind the subject.
- **Animation**: walking is driven by distance travelled (no foot sliding), characters turn smoothly into and out of walks, idle breathing, eased action blends, half-blinks and a smoothed mouth.

## Physics series tools (Spin Trials)

- **Physics props** (`props` with `type`): `turntable`, `door`, `staff`, `flywheel` (`kind: disk|hoop`, `weight`), `roller` (rolling without slipping, `trail`, `vectors`), `arrow` (r / F vectors, attachable with `on`), `label` (floating readout; `{}` filled live from `bind: {prop, q: w|v|rev|deg}`, `[a|b]` draws a stacked fraction; `hud: [x, y]` pins it to the screen).
- Motion: `spin: {w, alpha, at, max}` (constant angular acceleration) or `swing: [[t, deg], ...]` with `wobble`. Actors can `ride: {on, at: [x, z]}` a prop.
- Tags can show live physics: `tag: {bind: "v", fmt: "v = {} m/s", dec: 1}`; `npc_tags: true` puts speed readouts over walkers and cars.
- Extras or lamp posts that block the subject are hidden for the whole shot; `clear_fg: true` clears the whole foreground crowd.
- Look: stronger film grade, vignette, grain and lens fringing by default (`post: {ca, vignette, grain, bloom}` to tune); camera moves are stronger (`post.cam_energy` or `cam.energy`, default 1.8; 1 = the old calm moves) and `static`/`push` shots drift slightly.
- Narration default speed is 1.375 (1.25x faster than before) with shorter gaps between lines.
- `--stills` renders start/middle/end of every shot (`stills_ends_N.jpg`) and flags frames that are soft all over in `stills_report.txt`. Depth of field never blurs a whole frame.
- Rendering without file:// : the render page also works as a private claude.ai artifact (it saves through the artifact downloads capability).
- `stories/spin_trials/` holds the 5-episode ECE 105 rotation series (`python ep1.py` regenerates `ep1.json`).
