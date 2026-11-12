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
- Looks ("camera filters"): set `post: {look: "film" | "golden" | "dreamy" | "camcorder"}` on the story or a shot. Spin Trials uses `golden` (warm grade, light leaks, haze, vignette). `camcorder` adds REC / timecode / frame brackets and scanlines.
- In a claude.ai artifact the render page asks to save as soon as it finishes; renders run ~20+ frames/s on the 5080 when the browser pane is visible (hidden panes are throttled).

## Writing rules for new stories (learned from The Loophole)

- **No breaks in speech.** Narration runs continuously. Shots with `lines` are as long as their audio
  (pause is capped at 0.25 s); a shot's `dur` only adds silence if the shot sets `"hold": true`.
  To make a video longer, write more narration — never pad with `dur`/`pause`. Ellipses are spoken as
  commas and in-line pauses are squeezed to ≤0.16 s. `--voice-only` writes `speech_report.txt` and prints
  `SPEECH GAP` for any silence over 0.35 s — fix the script until it reports none.
- **Floating text never overlaps.** `declutter()` runs every frame: HUD/overlay labels win, then actor tags,
  then world labels; anything that collides is nudged up just enough to clear (or down, if up would leave
  the frame), and NPC tags that still collide are hidden. Still check `stills.jpg` when a shot has 2+ bubbles.
- **Names:** multicultural casts are encouraged (e.g. Mr. Singh, Ling Ling, Priya, Mateo, Chief Tremblay).

## Movement, voice and world detail (added for Nine Hundred)

### Movement: every character moves in their own way

- **`gait`** on a character (or on one cast entry, for one shot): `plain`, `bouncy`, `stride`, `glide`, `shuffle`, `swagger`,
  `tiptoe`, `march`, `heavy`, `skip`, `sneak`, `hobble`. An object overrides single values, e.g. `{"bob": 0.2, "out": 0.3}`.
  Each gait sets cadence, leg and arm swing, how far the arms are held out, rise per step, hip sway and roll, shoulder
  counter-twist, lean, foot lift and head nod. Every character also gets a small personal variation from their id, and
  extras each get a gait of their own, so no two people walk alike.
- **Mood sets posture.** `expr` now also shapes the body: `sad`/`cry` slump and slow down, `happy`/`grin` lift the chest
  and bounce, `determined`/`angry` widen the stance, `smug`/`bored` put the weight on one hip, `worried` fidgets.
- **Always-on life:** weight settles on one leg and shifts, eyes wander and hold, the chest breathes. Walks lean into
  speeding up, bank into curves, and the arms and head settle a beat after the feet stop.
- **Gestures follow the voice:** while a character speaks, hand beats scale with how loud each syllable is.
- **New `act` values:** `laugh`, `nod`, `shake`, `hug`, `clap`, `sigh`, `stumble`, `shiver`, `spin` (`spins`, `spin_dur`),
  `look_up`, `pick` (bend and pick something up), `hope` (hands clasped), `coin` (flip a coin and catch it; `rate`).
- The rig has a waist joint (`chest`), so shoulders turn against the hips.
- All of it is a pure function of time: any frame can be drawn on its own, so stills match the final video.

### Voice: clarity first

- The narration of the previous video was measured by transcribing it with a speech recogniser (`check_speech.py`):
  **18.7 % of words misheard at 4.9 words/s**. Nine Hundred measures **0.3 % at 3.4 words/s**.
- What the tests showed (same script, Kokoro voices, Whisper as the listener):
  - **Speed is the cliff.** Up to `speed` 1.3 the error stays at 0-4 %; at 1.375 it jumps to 9-27 % for every voice.
    The default is now **1.25**. Do not go above 1.3.
  - **Pitch-shifting a voice more than doubles the errors** (`am_puck` 5 % -> 13 %). Pick a voice that already sounds
    right and leave `pitch` out.
  - The full-precision model is slightly cleaner than the 8-bit one; it is now the default (`"tts_model": "int8"` goes back).
  - Clearest male narrators: `bm_george` (0 % up to 1.25, and the most robust in noise), then `am_michael` (1.3 %).
    Clear character voices: `am_liam`, `am_echo`, `am_michael`, `af_heart`, `af_sarah`, `am_adam`.
- A character can have its own `speed` (dialogue a little slower than narration reads well).
- The mix is built for speech: rumble filtered out, a little presence added, light compression, effects duck under the
  voice, and the whole mix is set to -15 LUFS.
- **`python check_speech.py STORY.json WORKDIR`** lists every line a recogniser mishears. Reword or slow those lines.
- The `brand` header is gone: it only covered the picture.

### The town square (`plaza`, `square`, `townsquare`)

- Four streets leave the square and run out of sight between rows of shops, with pavements, lamps, trees, parked cars
  and people walking them.
- Eighteen market stalls (fruit, flowers, bread, balloons, toys, lemonade, books, vegetables, honey, hats) with a keeper
  behind each, an ice-cream cart, cafe tables under parasols, planters, benches, flower beds with trees at the corners,
  bunting between the lamps, a tiered fountain with falling water, a clock tower, and a `MARKET DAY` banner over two
  street mouths (`set_text` changes the words).
- Paved ring and paths give the cobbles structure. The middle stays clear for the story; extras keep off the stalls.
- Default crowd is 70.

### Sky and ground, on every outdoor set

- Cloud banks at several heights drift slowly, and flocks of birds cross behind the action (`"birds": n` per shot,
  default 6; `"sky": false` turns both off). Pigeons peck about in the square and the park.
- Lawns get grass tufts, clumps of flowers, pebbles and fallen leaves; pavements get leaves, scraps of paper and the odd
  can (`"dress": false` turns it off).

### Fixes found on the way

- A camera placed relative to where someone faces was scanned for blockers from the wrong side; extras standing in
  front of the lens are now hidden in those shots too.
- Park: no trees in the strip where cameras stand.
- `--stills --only a-b` renders stills for some shots; `STORY3D_DEBUG=1` prints what stands near the lens.

## Added for Bored to Death (ages over heads)

- **`wrinkles: true`** on a character draws forehead lines, crow's feet and smile lines (an aged face).
- **`expr: "bored"`**: heavy eyelids, flat brows, flat mouth.
- **`npc_tag` as a list**: every extra gets one of the tags (e.g. `["AGE 8", "AGE 27", ...]`), not only the cheering ones.
  A single string still behaves as before.
- Night interiors (`room` / `classroom` with `time: "night"`) get a warm front fill so faces are not left in shadow.
- `stories/bored_to_death/` holds the story (`python make.py` regenerates `bored_to_death.json`).
- Street shots: a camera further than about z = 11 on the near side gets pulled in front of the hedges and houses there;
  use `full`/`medium` on the cast, or lift the camera to y >= 7 as The Loophole's street montage does.

## Smooth 60 fps (frame pacing)

Every output is constant 60 fps (`-fps_mode cfr`); the GPU page stamps frame *i* at exactly i/60 s, so how fast
the page renders never changes the timing. What *can* judder is the motion inside the frames, so the engine avoids:
- **Camera teleports** — `unblock()` (pull the camera in front of a wall) now glides through two cascaded smoothers
  (in fast, out slow) and is tracked every frame, even above 14 m, so crossing that line can't snap.
- **Dead stops at cuts** — camera moves use `easeCut()`: the same S-curve but still ~25% of cruise speed on the
  first/last frame, so shots never freeze for a few frames before a cut.
- **First-frame flash** — the occlusion scrub (`hideBlockers`) runs before frame 0 is placed, so walking actors are
  where they belong on the first frame.
- **Out-of-cadence flicker** — film flicker is a smooth sum of sines (a 24 Hz stepped flicker beats 3:2 against 60 fps).
- Follow cameras smooth by time, not per frame.

To check a change, trace the camera per frame (`ENGINE.camState()`) and look for single-frame speed jumps.

**Rendering:** Hunt renders final videos himself in the Claude app's built-in browser, with the window in the
foreground. Claude prepares the render page and finishes (`--finish`) the downloaded frames.
