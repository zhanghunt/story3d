#!/usr/bin/env python3
"""story3d.py - render a blocky 3D story Short (1080x1920) from story.json.

  python3 -I story3d.py STORY.json WORKDIR OUT.mp4 [--stills] [--draft] [--only 3-7] [--voice-only]
  python3 -I story3d.py STORY.json WORKDIR OUT.mp4 --gpu            # write WORKDIR/job.html to render on a real GPU in Chrome
  python3 -I story3d.py STORY.json WORKDIR OUT.mp4 --finish FRAMES  # add captions + voice + sfx to the GPU-rendered video

--stills   render start/middle/end frames of every shot: WORKDIR/stills.jpg (middles), stills_ends_N.jpg (rows of a|b|c),
           and flag frames that are soft all over in stills_report.txt; then stop
--draft    540x960, no AA cost; for checking timing and cameras fast
--only a-b render just those shots (others reuse cached files); final mux still runs if all exist
Needs engine.js + node_modules/three next to this script (or ENGINE_DIR), plus kokoro-onnx, soundfile, playwright.
"""
import base64, hashlib, json, os, re, subprocess, sys, urllib.request
from pathlib import Path
import numpy as np

FPS, SR = 30, 24000
GAP = 0.08  # pause between lines (shortened 1.25x with the narration)
ENGINE = Path(os.environ.get("ENGINE_DIR", Path(__file__).resolve().parent))
CACHE = Path.home() / ".cache" / "rbx_story"
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit("FAILED: " + " ".join(map(str, cmd))[:300] + "\n" + r.stderr[-1500:])


# ---------------- voice ----------------
def models():
    CACHE.mkdir(parents=True, exist_ok=True)
    for f in ("kokoro-v1.0.int8.onnx", "voices-v1.0.bin"):
        p = CACHE / f
        if not p.exists():
            print("downloading", f, flush=True)
            urllib.request.urlretrieve(MODEL_URL + f, str(p) + ".part"); os.rename(str(p) + ".part", p)
    return str(CACHE / "kokoro-v1.0.int8.onnx"), str(CACHE / "voices-v1.0.bin")


def trim(a, thr=0.01):
    i = np.where(np.abs(a) > thr)[0]
    return a if not len(i) else a[max(i[0] - 480, 0):min(i[-1] + 1440, len(a))]


def squeeze_silence(a, sr, max_gap=0.16, thr=0.012):
    """Shorten any pause inside a line to at most max_gap seconds (no dead air mid-sentence)."""
    win = int(sr * 0.01); n = len(a) // win
    if n < 3:
        return a
    loud = np.array([np.abs(a[i * win:(i + 1) * win]).max() > thr for i in range(n)])
    keep, run_ = np.ones(len(a), bool), 0
    for i in range(n):
        run_ = run_ + 1 if not loud[i] else 0
        if run_ * 0.01 > max_gap:
            keep[i * win:(i + 1) * win] = False
    return a[keep]


def speech_report(chunks_audio, sr, timeline, work, limit=0.35):
    """Flag silences longer than `limit` between the first and last word (breaks in speech)."""
    win = int(sr * 0.01); a = chunks_audio; n = len(a) // win
    loud = [np.abs(a[i * win:(i + 1) * win]).max() > 0.012 for i in range(n)]
    first = next((i for i, x in enumerate(loud) if x), 0); last = n - next((i for i, x in enumerate(reversed(loud)) if x), 0)
    gaps, run_ = [], 0
    for i in range(first, last):
        if not loud[i]:
            run_ += 1
        else:
            if run_ * 0.01 > limit:
                gaps.append((round((i - run_) * 0.01, 2), round(run_ * 0.01, 2)))
            run_ = 0
    lines = [f"{d:.2f}s silence at {t:.2f}s" for t, d in gaps]
    (work / "speech_report.txt").write_text("\n".join(lines) or "no breaks in speech")
    for l in lines:
        print("SPEECH GAP:", l)


def synth(story, work):
    import soundfile as sf
    kok, chars = None, story.get("characters", {})
    speed = float(story.get("speed", 1.375))  # 1.25x the old 1.1 default: faster narration + captions for high-energy shorts
    (work / "lines").mkdir(parents=True, exist_ok=True)
    t, timeline, chunks = 0.0, [], []
    for si, sh in enumerate(story["shots"]):
        start = t
        for li, ln in enumerate(sh.get("lines", [])):
            who = ln.get("who", "")
            cdef = chars.get(who, {})
            v = ln.get("voice") or cdef.get("voice") or story.get("voices", {}).get(who) or story.get("narrator_voice", "af_jessica")
            pitch = float(ln.get("pitch", cdef.get("pitch", story.get("narrator_pitch", 0) if who not in chars else 0)))
            sp = float(ln.get("speed", speed))
            key = hashlib.md5(f"{ln['text']}|{v}|{sp}|{pitch}|sq1".encode()).hexdigest()[:10]
            p = work / "lines" / f"{key}.wav"
            if not p.exists():
                if kok is None:
                    from kokoro_onnx import Kokoro
                    kok = Kokoro(*models())
                say = re.sub(r"\s*(\.\.\.|…)\s*", ", ", ln["text"]).strip(" ,") or ln["text"]  # ellipses make the TTS stall
                a, sr = kok.create(say, voice=v, speed=sp, lang=story.get("lang", "en-us"))
                a = squeeze_silence(a, sr)
                if pitch:  # natural-sounding pitch shift (formants preserved), e.g. +3 makes a boy voice younger
                    raw = p.with_suffix(".raw.wav"); sf.write(raw, a, sr)
                    run(["ffmpeg", "-y", "-i", str(raw), "-af", f"rubberband=pitch={2 ** (pitch / 12):.4f}:formant=preserved", "-ar", str(sr), str(p)]); raw.unlink()
                else:
                    sf.write(p, a, sr)
            a = trim(sf.read(p, dtype="float32")[0])
            d = len(a) / SR
            env = [float(np.sqrt(np.mean(a[i:i + SR // FPS] ** 2))) for i in range(0, len(a), SR // FPS)]
            pk = np.percentile(env, 95) if env else 1
            sm_, out_ = 0.0, []  # smooth the mouth: fast-ish attack, slower release -> no flicker
            for e in env:
                e = e / (pk + 1e-6); k = 1 - (0.35 if e > sm_ else 0.18) ** (30 / FPS); sm_ += (e - sm_) * k; out_.append(sm_)
            env = [x * (pk + 1e-6) for x in out_]
            timeline.append({"shot": si, "who": who, "text": ln.get("caption", ln["text"]), "start": t, "end": t + d,
                             "env": [round(min(e / (pk + 1e-6), 1.0), 3) for e in env], "anim": who in chars})
            chunks += [a, np.zeros(int(GAP * SR), np.float32)]; t += d + GAP
        # No dead air: a shot with narration lasts as long as its lines (plus at most a short beat); "dur" only stretches
        # shots without lines, unless the shot sets "hold": true. Need more screen time? Write more narration.
        has_lines = bool(sh.get("lines"))
        dmin = (min(float(sh.get("pause", 0)), 0.25) + (float(sh.get("dur", 0)) if sh.get("hold") else 0)) if has_lines else float(sh.get("dur", 0)) + float(sh.get("pause", 0))
        if t - start < dmin:
            chunks.append(np.zeros(int((dmin - (t - start)) * SR), np.float32)); t = start + dmin
        if timeline and timeline[-1]["shot"] == si:
            timeline[-1]["hold"] = t - timeline[-1]["end"]
        sh["_start"], sh["_end"] = start, t
    full = np.concatenate(chunks) if chunks else np.zeros(SR, np.float32)
    sf.write(work / "voice.wav", full, SR); speech_report(full, SR, timeline, work)
    return timeline, t


# ---------------- captions ----------------
def ass_color(h):
    h = h.lstrip("#"); return f"&H{h[4:6]}{h[2:4]}{h[0:2]}&"


def pick_font():
    have = subprocess.run(["fc-list", ":", "family"], capture_output=True, text=True).stdout
    return next((f for f in ("Montserrat Black", "Inter Black", "Anton", "Arial Black", "Roboto Black", "DejaVu Sans") if f in have), "Sans")


def ts(s):
    s = max(s, 0); return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def srt_ts(s):
    ms = int(round(max(s, 0) * 1000)); return f"{ms // 3600000:02d}:{ms % 3600000 // 60000:02d}:{ms % 60000 // 1000:02d},{ms % 1000:03d}"


def word_times(ln):
    words = ln["text"].split()
    wts = [len(re.sub(r"\W", "", w)) + 2 + (3 if re.search(r"[.,!?;:]$", w) else 0) for w in words]
    t, out = ln["start"], []
    for w, k in zip(words, wts):
        d = (ln["end"] - ln["start"]) * k / sum(wts); out.append([w, t, t + d]); t += d
    return out


def captions(story, timeline, total, work, W, H):
    c = story.get("captions", {})
    style = c.get("style", "word")
    font = c.get("font") or pick_font()
    size = int(c.get("size", {"word": 124, "phrase": 74, "karaoke": 96}[style]))
    y = int(c.get("y", 1240))
    col = ass_color(c.get("color", "#E8FF2E" if style == "word" else "#FFFFFF"))
    hi = ass_color(c.get("highlight", "#FFE500"))
    out = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "WrapStyle: 0", "", "[V4+ Styles]",
           "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
           f"Style: Cap,{font},{size},{col},&H00FFFFFF&,&H00000000&,&H90000000&,-1,0,0,0,100,100,1,0,1,{8 if style == 'word' else 6},3,5,60,60,0,1",
           f"Style: Brand,{font},46,{ass_color(c.get('brand_color', '#FFD447'))},&H00FFFFFF&,&H00000000&,&H90000000&,-1,0,0,0,100,100,2,0,1,5,2,8,0,0,64,1",
           "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    if story.get("brand"):
        out.append(f"Dialogue: 1,{ts(0)},{ts(total + 1)},Brand,,0,0,0,,{story['brand']}")
    srt, n, pop = [], 1, "{\\fscx70\\fscy70\\t(0,70,\\fscx108\\fscy108)\\t(70,130,\\fscx100\\fscy100)}"
    esc = lambda s: s.replace("{", "(").replace("}", ")")
    for ln in timeline:
        wt = word_times(ln)
        if style == "word":
            groups = [[w] for w in wt]
        else:
            mx_w, mx_c = (5, 26) if style == "phrase" else (3, 16)
            groups, cur = [], []
            for w in wt:
                if cur and (len(cur) >= mx_w or len(" ".join(x[0] for x in cur + [w])) > mx_c):
                    groups.append(cur); cur = []
                cur.append(w)
                if re.search(r"[.!?,]$", w[0]) and style == "phrase":
                    groups.append(cur); cur = []
            groups += [cur] if cur else []
        for gi, g in enumerate(groups):
            a, b = g[0][1], g[-1][2] + (ln.get("hold", GAP) if gi == len(groups) - 1 else 0)
            text = " ".join(w[0] for w in g)
            srt += [str(n), f"{srt_ts(a)} --> {srt_ts(b)}", text, ""]; n += 1
            if style == "karaoke":
                for i, (w, wa, wb) in enumerate(g):
                    wb = b if i == len(g) - 1 else wb
                    txt = " ".join((("{\\c" + hi + "}" + esc(x).upper() + "{\\c&HFFFFFF&}") if j == i else esc(x).upper()) for j, (x, _, _) in enumerate(g))
                    out.append(f"Dialogue: 0,{ts(wa)},{ts(wb)},Cap,,0,0,0,,{{\\pos(540,{y})}}{pop if i == 0 else ''}{txt}")
            else:
                t2 = esc(text.lower() if c.get("case") == "lower" else text.upper() if c.get("case") == "upper" else text)
                out.append(f"Dialogue: 0,{ts(a)},{ts(b)},Cap,,0,0,0,,{{\\pos(540,{y})}}{pop if style == 'word' else ''}{t2}")
    (work / "captions.ass").write_text("\n".join(out) + "\n", encoding="utf-8")
    (work / "captions.srt").write_text("\n".join(srt), encoding="utf-8")


def ass_slice(work, a, b, i):
    out = []
    for l in (work / "captions.ass").read_text(encoding="utf-8").splitlines():
        m = re.match(r"Dialogue: (\d),([\d:.]+),([\d:.]+),(.*)", l)
        if not m:
            out.append(l); continue
        s, e = (sum(float(x) * k for x, k in zip(v.split(":"), (3600, 60, 1))) for v in m.groups()[1:3])
        if e > a and s < b:
            out.append(f"Dialogue: {m.group(1)},{ts(max(s, a) - a)},{ts(min(e, b) - a)},{m.group(4)}")
    p = work / f"cap_{i:02d}.ass"; p.write_text("\n".join(out) + "\n", encoding="utf-8"); return p


# ---------------- sound effects (synthesized, no downloads) ----------------
def sfx_lib(work):
    d = work / "sfx"; d.mkdir(exist_ok=True)
    defs = {
        "whoosh": "anoisesrc=c=pink:d=0.5:a=0.9,bandpass=f=1400:w=1.2,afade=t=in:d=0.22:curve=exp,afade=t=out:st=0.22:d=0.28",
        "swoosh_long": "anoisesrc=c=pink:d=1.4:a=0.9,bandpass=f=900:w=1.4,afade=t=in:d=0.6,afade=t=out:st=0.6:d=0.8",
        "boom": "aevalsrc='0.9*sin(2*PI*(70-35*t)*t)*exp(-3.5*t)+0.35*sin(2*PI*140*t)*exp(-9*t)':s=48000:d=1.1",
        "impact": "aevalsrc='0.8*sin(2*PI*(110-60*t)*t)*exp(-7*t)+0.3*(random(0)-0.5)*exp(-18*t)':s=48000:d=0.6",
        "pop": "aevalsrc='0.7*sin(2*PI*(500+2500*t)*t)*exp(-40*t)':s=48000:d=0.15",
        "ding": "aevalsrc='0.5*sin(2*PI*1320*t)*exp(-3*t)+0.25*sin(2*PI*2640*t)*exp(-5*t)':s=48000:d=1.4",
        "magic": "aevalsrc='0.25*(sin(2*PI*1568*t)*exp(-4*mod(t,0.12)*10)+sin(2*PI*2093*t)*exp(-3*t)+sin(2*PI*2637*(t+0.06))*exp(-4*t))':s=48000:d=1.2",
        "step": "anoisesrc=c=brown:d=0.07:a=0.8,lowpass=f=900,afade=t=out:st=0.01:d=0.06",
        "riser": "aevalsrc='0.35*sin(2*PI*(200*t+300*t*t))*t/1.5':s=48000:d=1.5",
        "thud": "aevalsrc='0.9*sin(2*PI*(80-30*t)*t)*exp(-9*t)':s=48000:d=0.5",
        "sad": "aevalsrc='0.22*(sin(2*PI*440*t)+sin(2*PI*349*(t))*0.8)*exp(-1.2*t)':s=48000:d=2.2",
        "crowd": "anoisesrc=c=pink:d=2.8:a=0.7,bandpass=f=1100:w=1.6,tremolo=f=6.5:d=0.45,afade=t=in:d=0.35,afade=t=out:st=1.7:d=1.1",
        "ooh": "anoisesrc=c=pink:d=1.8:a=0.5,bandpass=f=520:w=1.0,tremolo=f=4:d=0.3,afade=t=in:d=0.4,afade=t=out:st=0.9:d=0.9",
        "creak": "aevalsrc='0.28*sin(2*PI*(150+70*sin(2*PI*2.6*t))*t)*(0.6+0.4*sin(2*PI*31*t))*min(t*4,1)*exp(-0.8*t)':s=48000:d=1.8",
        "crack": "aevalsrc='0.9*(random(0)-0.5)*exp(-35*t)+0.6*sin(2*PI*(95-40*t)*t)*exp(-10*t)':s=48000:d=0.7",
        "hum": "aevalsrc='0.22*sin(2*PI*(70*t+45*t*t))*min(t*2,1)+0.08*sin(2*PI*(140*t+90*t*t))':s=48000:d=2.6",
    }
    for k, f in defs.items():
        p = d / f"{k}.wav"
        if not p.exists():
            run(["ffmpeg", "-y", "-f", "lavfi", "-i", f, "-ar", "48000", "-ac", "1", str(p)])
    return d


def sfx_track(story, work, total):
    import soundfile as sf
    d, SR2 = sfx_lib(work), 48000
    trk = np.zeros(int((total + 1.5) * SR2), np.float32)
    lib = {p.stem: sf.read(p, dtype="float32")[0] for p in d.glob("*.wav")}
    for f in Path(story.get("sfx_dir", "_none_")).glob("*.wav"):  # user-supplied sounds override by name
        a, sr = sf.read(f, dtype="float32"); lib[f.stem] = (a.mean(1) if a.ndim > 1 else a) if sr == SR2 else lib.get(f.stem)

    def put(name, at, db):
        a = lib.get(name)
        if a is None:
            return
        i = int(at * SR2); seg = a[: max(len(trk) - i, 0)] * (10 ** (db / 20)); trk[i:i + len(seg)] += seg
    for si, sh in enumerate(story["shots"]):
        st, du = sh["_start"], sh["_end"] - sh["_start"]
        if si and sh.get("whoosh", story.get("whoosh", True)):
            put("whoosh", max(st - 0.18, 0), -15)
        for c in sh.get("cast", []):
            act = c.get("act", "")
            if act in ("walk", "run") or (c.get("to") or c.get("path")) and act not in ("fly", "float"):
                m0, m1 = (c.get("move") or [0, 1]); step = 0.19 if act == "run" else 0.3
                for k in np.arange(st + m0 * du, st + m1 * du, step):
                    put("step", k, -20)
            if act == "fly":
                put("swoosh_long", st, -9)
            if act == "shock":
                put("pop", st, -10)
        if sh.get("fx") in ("sparkles", "glow"):
            put("magic", st, -10)
        if sh.get("flash"):
            put("impact", st, -6)
        for e in sh.get("sfx", []):
            e = {"type": e} if isinstance(e, str) else e
            put(e["type"], st + float(e.get("at", 0)) * (du if float(e.get("at", 0)) <= 1 else 1), float(e.get("db", -6)))
    sf.write(work / "sfx.wav", np.clip(trk, -1, 1), SR2)


# ---------------- rendering ----------------
def page_html():
    return """<!doctype html><html><body style="margin:0;background:#000;overflow:hidden">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module" src="/engine.js"></script></body></html>"""


def amps_for(timeline, sh, f, chars):
    t = sh["_start"] + f / FPS; out = {}
    for ln in timeline:
        if ln["anim"] and ln["start"] <= t < ln["end"]:
            k = int((t - ln["start"]) * FPS)
            if k < len(ln["env"]):
                out[ln["who"]] = ln["env"][k]
    return out


def blur_report(paths):
    """Flag frames that are soft all over (focus missed / too much DOF). A frame passes if any region has crisp edges."""
    import numpy as np
    from PIL import Image
    bad = []
    for pth in paths:
        a = np.asarray(Image.open(pth).convert("L").resize((540, 960)), dtype=np.float32)
        L = np.abs(a[1:-1, 1:-1] * 4 - a[:-2, 1:-1] - a[2:, 1:-1] - a[1:-1, :-2] - a[1:-1, 2:]); h, w = L.shape
        best = max(L[y * h // 6:(y + 1) * h // 6, x * w // 4:(x + 1) * w // 4].var() for y in range(6) for x in range(4))
        if best < 55 and a.mean() < 215:  # very bright = a flash frame, not a focus problem
            bad.append(f"{pth.name} sharpness {best:.0f} (< 55)")
    return bad


def contact_sheets(sheet, work, fontfile):
    """stills.jpg = middle frame of every shot (4 across); stills_ends_N.jpg = 4 shots per page, each row start|middle|end."""
    from PIL import Image, ImageDraw, ImageFont
    try:
        font = ImageFont.truetype(fontfile, 30)
    except Exception:
        font = ImageFont.load_default()
    def tile(path, label, w, h):
        im = Image.open(path).convert("RGB").resize((w, h)); d = ImageDraw.Draw(im)
        d.text((10, 8), label, font=font, fill="white", stroke_width=3, stroke_fill="black"); return im
    n = len(sheet); cols = 4; rows = (n + cols - 1) // cols
    out = Image.new("RGB", (cols * 270, rows * 480))
    for k, trio in enumerate(sheet):
        out.paste(tile(trio[1], str(k), 270, 480), ((k % cols) * 270, (k // cols) * 480))
    out.save(work / "stills.jpg", quality=88)
    for old in work.glob("stills_ends_*.jpg"):
        old.unlink()
    for p0 in range(0, n, 4):
        rows_ = sheet[p0:p0 + 4]; pg = Image.new("RGB", (3 * 240, len(rows_) * 427))
        for r, trio in enumerate(rows_):
            for c, pth in enumerate(trio):
                pg.paste(tile(pth, f"{p0 + r}{'abc'[c]}", 240, 427), (c * 240, r * 427))
        pg.save(work / f"stills_ends_{p0 // 4}.jpg", quality=88)


def render(story, timeline, total, work, W, H, only, stills):
    from playwright.sync_api import sync_playwright
    chars, shots = story.get("characters", {}), story["shots"]
    eng_hash = hashlib.md5((ENGINE / "engine.js").read_bytes()).hexdigest()[:8]
    files, sheet = [], []
    with sync_playwright() as p:
        lvp = Path("/opt/lavapipe/lvp_icd.json")  # Mesa lavapipe: ~2x faster than SwiftShader when present
        args = ["--use-gl=angle", "--use-angle=vulkan", "--enable-features=Vulkan", "--ignore-gpu-blocklist"] if lvp.exists() else \
            ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
        b = p.chromium.launch(args=args, env={**os.environ, **({"VK_ICD_FILENAMES": str(lvp)} if lvp.exists() else {})})
        pg = b.new_page(viewport={"width": W, "height": H})

        def serve(route):
            rel = route.request.url.split("story.local/", 1)[1].split("?")[0]
            if rel in ("", "index.html"):
                return route.fulfill(body=page_html(), content_type="text/html")
            route.fulfill(path=str(ENGINE / rel))
        pg.route("http://story.local/**", serve)
        pg.goto("http://story.local/index.html"); pg.wait_for_function("window.ready===true", timeout=60000)
        pg.evaluate("([w,h,o])=>ENGINE.init(w,h,o)", [W, H, {"post": story.get("post", {})}])
        for i, sh in enumerate(shots):
            dur = (sh["_end"] - sh["_start"]) + (0.5 if i == len(shots) - 1 else 0)
            n = max(int(round(dur * FPS)), 1)
            spec = {k: v for k, v in sh.items() if not k.startswith("_") and k not in ("lines", "sfx")}
            if stills:  # start / middle / end of every shot, so camera moves and reveals are checked at both ends
                pg.evaluate("([s,c,seed])=>ENGINE.setup(s,c,seed)", [spec, chars, i + 1])
                trio = []
                for tag, at in (("a", 0.06), ("b", sh.get("still_at", 0.5)), ("c", 0.94)):
                    f = int(at * (n - 1))
                    data = pg.evaluate("([t,d,a])=>ENGINE.frame(t,d,a)", [f / FPS, dur, amps_for(timeline, sh, f, chars)])
                    pth = work / "stills" / f"shot_{i:02d}{tag}.jpg"; pth.parent.mkdir(exist_ok=True)
                    pth.write_bytes(base64.b64decode(data.split(",", 1)[1])); trio.append(pth)
                sheet.append(trio); continue
            cap = ass_slice(work, sh["_start"], sh["_start"] + dur, i)
            key = hashlib.md5(json.dumps([spec, {c["id"]: chars.get(c["id"]) for c in sh.get("cast", [])}, round(dur, 3), W, H,
                                          story.get("post"), eng_hash, cap.read_text()], sort_keys=True).encode()).hexdigest()[:10]
            out = work / f"shot_{i:02d}_{key}.mp4"; files.append(out)
            if out.exists() or (only and not (only[0] <= i <= only[1])):
                continue
            for old in work.glob(f"shot_{i:02d}_*.mp4"):
                old.unlink()
            pg.evaluate("([s,c,seed])=>ENGINE.setup(s,c,seed)", [spec, chars, i + 1])
            tmp = work / f"shot_{i:02d}.tmp.mp4"
            ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", str(FPS), "-i", "-",
                                   "-vf", f"ass={cap}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
                                   "-r", str(FPS), str(tmp)], stdin=subprocess.PIPE)
            for f in range(n):
                data = pg.evaluate("([t,d,a])=>ENGINE.frame(t,d,a)", [f / FPS, dur, amps_for(timeline, sh, f, chars)])
                ff.stdin.write(base64.b64decode(data.split(",", 1)[1]))
            ff.stdin.close()
            if ff.wait():
                sys.exit(f"ffmpeg failed on shot {i}")
            os.replace(tmp, out); print(f"shot {i + 1}/{len(shots)} rendered ({dur:.1f}s)", flush=True)
        b.close()
    if stills:
        FONTFILE = subprocess.run(["fc-match", "-f", "%{file}", "sans:bold"], capture_output=True, text=True).stdout
        soft = blur_report([p for trio in sheet for p in trio])
        (work / "stills_report.txt").write_text("\n".join(soft) or "all frames sharp")
        for line in soft:
            print("SOFT FRAME:", line)
        contact_sheets(sheet, work, FONTFILE)
        print("stills:", work / "stills.jpg"); return None
    return files


def gpu_job(story, timeline, total, work, out):
    chars, shots = story.get("characters", {}), []
    js = ENGINE / "gpu.js"
    if not js.exists() or js.stat().st_mtime < max((ENGINE / f).stat().st_mtime for f in ("engine.js", "gpu_main.js")):
        run(["npx", "--prefix", str(ENGINE), "esbuild", str(ENGINE / "gpu_main.js"), "--bundle", "--format=iife", "--minify", f"--outfile={js}"])
    for i, sh in enumerate(story["shots"]):
        dur = (sh["_end"] - sh["_start"]) + (0.5 if i == len(story["shots"]) - 1 else 0)
        n = max(int(round(dur * FPS)), 1)
        spec = {k: v for k, v in sh.items() if not k.startswith("_") and k not in ("lines", "sfx")}
        amps = [{k: round(v, 2) for k, v in amps_for(timeline, sh, f, chars).items()} for f in range(n)]
        shots.append({"spec": spec, "dur": round(dur, 4), "n": n, "amps": amps})
    job = {"W": 1080, "H": 1920, "fps": FPS, "shots": shots, "chars": chars, "post": story.get("post", {})}
    tag = hashlib.md5((json.dumps(job, sort_keys=True) + js.read_text(encoding="utf-8")).encode()).hexdigest()[:6]
    job["out"] = f"{Path(out).stem}_{tag}_frames.mp4"  # unique names: a stale page or video can never be mistaken for the new one
    body = js.read_text(encoding="utf-8").replace("</script", "<\\/script")
    html = ("<!doctype html><html><head><meta charset='utf-8'><title>story3d</title></head>"
            "<body style='margin:0;background:#111;color:#eee;font:16px sans-serif'><div id='st' style='padding:8px'>loading</div>"
            f"<script id='job' type='application/json'>{json.dumps(job, separators=(',', ':')).replace('</', '<\\/')}</script>"
            f"<script>{body}</script></body></html>")
    p = work / f"{Path(out).stem}_{tag}_render.html"; p.write_text(html, encoding="utf-8")
    print(f"gpu job: {p} ({p.stat().st_size // 1024} KB, {sum(s['n'] for s in shots)} frames) -> downloads {job['out']}")


def finish_gpu(story, work, frames, total, out):
    sfx_track(story, work, total)
    ins = ["-i", str(frames), "-i", str(work / "voice.wav"), "-i", str(work / "sfx.wav")]
    fl = f"[0:v]ass={work / 'captions.ass'},format=yuv420p[vo];[1:a]aresample=48000,apad[v];[2:a]aresample=48000[s];"
    mixn = "[v][s]"
    if story.get("music"):
        ins += ["-stream_loop", "-1", "-i", story["music"]]
        fl += f"[3:a]aresample=48000,volume={story.get('music_db', -20)}dB[m];"; mixn += "[m]"
    fl += f"{mixn}amix=inputs={mixn.count('[')}:duration=first:normalize=0,atrim=0:{total + 0.5:.2f},alimiter=limit=0.8,volume=-0.5dB[a]"
    tmp = str(out) + ".tmp.mp4"
    run(["ffmpeg", "-y", *ins, "-filter_complex", fl, "-map", "[vo]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
         "-r", str(FPS), "-fps_mode", "cfr",  # constant 60 fps: every frame exactly 1/60 s apart
         "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", tmp])
    os.replace(tmp, out); print("wrote", out)


def mux(story, work, files, total, out):
    if not all(f.exists() for f in files):
        print("some shots not rendered yet; run again without --only to finish"); return
    lst = work / "concat.txt"; lst.write_text("".join(f"file '{f.resolve()}'\n" for f in files))
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(work / "video.mp4")])
    ins = ["-i", str(work / "video.mp4"), "-i", str(work / "voice.wav"), "-i", str(work / "sfx.wav")]
    fl = "[1:a]aresample=48000,apad[v];[2:a]aresample=48000[s];"
    mixn = "[v][s]"
    if story.get("music"):
        ins += ["-stream_loop", "-1", "-i", story["music"]]
        fl += f"[3:a]aresample=48000,volume={story.get('music_db', -20)}dB[m];"; mixn += "[m]"
    k = mixn.count("[")
    fl += f"{mixn}amix=inputs={k}:duration=first:normalize=0,atrim=0:{total + 0.5:.2f},alimiter=limit=0.8,volume=-0.5dB[a]"
    tmp = str(out) + ".tmp.mp4"
    run(["ffmpeg", "-y", *ins, "-filter_complex", fl, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
         "-shortest", "-movflags", "+faststart", tmp])
    os.replace(tmp, out); print("wrote", out)


def main():
    a = sys.argv
    if len(a) < 4:
        sys.exit(__doc__)
    story = json.loads(Path(a[1]).read_text(encoding="utf-8"))
    global FPS
    FPS = int(story.get("fps", 60))  # always 60 fps for smooth motion
    story.setdefault("shots", story.pop("scenes", []))
    work, out = Path(a[2]), Path(a[3]); work.mkdir(parents=True, exist_ok=True)
    draft = "--draft" in a
    W, H = (540, 960) if draft else (1080, 1920)
    only = None
    if "--only" in a:
        x = a[a.index("--only") + 1].split("-"); only = (int(x[0]), int(x[-1]))
    if draft:
        story.setdefault("post", {}); story["post"] = {**story["post"], "dof": 0, "bloom": 0}
    timeline, total = synth(story, work)
    print(f"voice: {total:.1f}s, {len(story['shots'])} shots", flush=True)
    if total > 179:
        print("WARNING: over 3 minutes")
    captions(story, timeline, total, work, W, H)
    if "--voice-only" in a:
        return
    if "--gpu" in a:
        return gpu_job(story, timeline, total, work, out)
    if "--finish" in a:
        return finish_gpu(story, work, Path(a[a.index("--finish") + 1]), total, out)
    files = render(story, timeline, total, work, W, H, only, "--stills" in a)
    if files is None:
        return
    sfx_track(story, work, total)
    mux(story, work, files, total, out)


if __name__ == "__main__":
    main()
