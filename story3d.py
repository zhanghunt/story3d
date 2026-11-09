#!/usr/bin/env python3
"""story3d.py - render a blocky 3D story Short (1080x1920) from story.json.

  python3 -I story3d.py STORY.json WORKDIR OUT.mp4 [--stills] [--draft] [--only 3-7] [--voice-only]
  python3 -I story3d.py STORY.json WORKDIR OUT.mp4 --gpu            # write WORKDIR/job.html to render on a real GPU in Chrome
  python3 -I story3d.py STORY.json WORKDIR OUT.mp4 --finish FRAMES  # add captions + voice + sfx to the GPU-rendered video

--stills   render the middle frame of every shot to WORKDIR/stills.jpg (contact sheet) and stop
--draft    540x960, no AA cost; for checking timing and cameras fast
--only a-b render just those shots (others reuse cached files); final mux still runs if all exist
Needs engine.js + node_modules/three next to this script (or ENGINE_DIR), plus kokoro-onnx, soundfile, playwright.
"""
import base64, hashlib, json, os, re, subprocess, sys, urllib.request
from pathlib import Path
import numpy as np

FPS, SR = 30, 24000
GAP = 0.1
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


def synth(story, work):
    import soundfile as sf
    kok, chars = None, story.get("characters", {})
    speed = float(story.get("speed", 1.1))
    (work / "lines").mkdir(parents=True, exist_ok=True)
    t, timeline, chunks = 0.0, [], []
    for si, sh in enumerate(story["shots"]):
        start = t
        for li, ln in enumerate(sh.get("lines", [])):
            who = ln.get("who", "")
            v = ln.get("voice") or chars.get(who, {}).get("voice") or story.get("voices", {}).get(who) or story.get("narrator_voice", "am_adam")
            sp = float(ln.get("speed", speed))
            key = hashlib.md5(f"{ln['text']}|{v}|{sp}".encode()).hexdigest()[:10]
            p = work / "lines" / f"{key}.wav"
            if not p.exists():
                if kok is None:
                    from kokoro_onnx import Kokoro
                    kok = Kokoro(*models())
                a, sr = kok.create(ln["text"], voice=v, speed=sp, lang=story.get("lang", "en-us"))
                sf.write(p, a, sr)
            a = trim(sf.read(p, dtype="float32")[0])
            d = len(a) / SR
            env = [float(np.sqrt(np.mean(a[i:i + SR // FPS] ** 2))) for i in range(0, len(a), SR // FPS)]
            pk = np.percentile(env, 95) if env else 1
            timeline.append({"shot": si, "who": who, "text": ln.get("caption", ln["text"]), "start": t, "end": t + d,
                             "env": [round(min(e / (pk + 1e-6), 1.0), 3) for e in env], "anim": who in chars})
            chunks += [a, np.zeros(int(GAP * SR), np.float32)]; t += d + GAP
        dmin = float(sh.get("dur", 0)) + float(sh.get("pause", 0))
        if t - start < dmin:
            chunks.append(np.zeros(int((dmin - (t - start)) * SR), np.float32)); t = start + dmin
        if timeline and timeline[-1]["shot"] == si:
            timeline[-1]["hold"] = t - timeline[-1]["end"]
        sh["_start"], sh["_end"] = start, t
    sf.write(work / "voice.wav", np.concatenate(chunks) if chunks else np.zeros(SR, np.float32), SR)
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
           f"Style: Brand,{font},60,{ass_color(c.get('brand_color', '#FFD447'))},&H00FFFFFF&,&H00000000&,&H90000000&,-1,0,0,0,100,100,2,0,1,6,2,8,0,0,150,1",
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
            if stills:
                pg.evaluate("([s,c,seed])=>ENGINE.setup(s,c,seed)", [spec, chars, i + 1])
                f = int(sh.get("still_at", 0.5) * (n - 1))
                data = pg.evaluate("([t,d,a])=>ENGINE.frame(t,d,a)", [f / FPS, dur, amps_for(timeline, sh, f, chars)])
                pth = work / "stills" / f"shot_{i:02d}.jpg"; pth.parent.mkdir(exist_ok=True)
                pth.write_bytes(base64.b64decode(data.split(",", 1)[1])); sheet.append(pth); continue
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
        cols, FONTFILE = 4, subprocess.run(["fc-match", "-f", "%{file}", "sans:bold"], capture_output=True, text=True).stdout
        run(["ffmpeg", "-y", *sum([["-i", str(s)] for s in sheet], []), "-filter_complex",
             "".join(f"[{k}:v]scale=270:480,drawtext=fontfile='{FONTFILE}':text='{k}':x=12:y=10:fontsize=36:fontcolor=white:borderw=3[s{k}];" for k in range(len(sheet)))
             + "".join(f"[s{k}]" for k in range(len(sheet))) + f"xstack=inputs={len(sheet)}:layout="
             + "|".join(f"{(k % cols) * 270}_{(k // cols) * 480}" for k in range(len(sheet))) + ":fill=black" if len(sheet) > 1 else "[0:v]scale=270:480",
             "-frames:v", "1", str(work / "stills.jpg")])
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
    job = {"W": 1080, "H": 1920, "fps": FPS, "shots": shots, "chars": chars, "post": story.get("post", {}), "out": Path(out).stem + "_frames.mp4"}
    body = js.read_text(encoding="utf-8").replace("</script", "<\\/script")
    html = ("<!doctype html><html><head><meta charset='utf-8'><title>story3d</title></head>"
            "<body style='margin:0;background:#111;color:#eee;font:16px sans-serif'><div id='st' style='padding:8px'>loading</div>"
            f"<script id='job' type='application/json'>{json.dumps(job, separators=(',', ':')).replace('</', '<\\/')}</script>"
            f"<script>{body}</script></body></html>")
    p = work / "job.html"; p.write_text(html, encoding="utf-8")
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
         "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", tmp])
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
