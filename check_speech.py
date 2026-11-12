#!/usr/bin/env python3
"""check_speech.py - is every narrated line understandable?

  python check_speech.py STORY.json WORKDIR [--model small.en]

Transcribes each spoken line with a speech recogniser (Whisper, run locally through sherpa-onnx) and compares it with the
script. Prints the lines that were misheard, the overall word error rate and the speaking pace. Run it after --voice-only.
A line that a recogniser mishears is a line a viewer on a phone speaker will probably mishear too: reword it or slow it.

Needs: pip install sherpa-onnx jiwer scipy soundfile. The recogniser (about 250 MB for small.en) is downloaded once into
~/.cache/rbx_story from https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
"""
import json, os, re, sys, tarfile, urllib.request
from pathlib import Path
import numpy as np

CACHE = Path.home() / ".cache" / "rbx_story"
URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-{m}.tar.bz2"
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "x x twenty thirty forty fifty sixty seventy eighty ninety".split()


def words(n):
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    if n < 1000: return ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " and " + words(n % 100))
    return words(n // 1000) + " thousand" + ("" if n % 1000 == 0 else " " + words(n % 1000))


def norm(s):
    s = s.lower().replace("-", " ").replace("'", "")
    s = re.sub(r"\d[\d,]*", lambda m: words(int(m.group(0).replace(",", ""))), s)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z ]", " ", s)).replace(" and ", " ").strip()


def recogniser(m):
    import sherpa_onnx
    d = CACHE / f"sherpa-onnx-whisper-{m}"
    if not d.exists():
        CACHE.mkdir(parents=True, exist_ok=True); t = CACHE / f"whisper-{m}.tar.bz2"; print("downloading recogniser", m, flush=True)
        urllib.request.urlretrieve(URL.format(m=m), t); tarfile.open(t).extractall(CACHE); t.unlink()
    return sherpa_onnx.OfflineRecognizer.from_whisper(encoder=str(d / f"{m}-encoder.int8.onnx"), decoder=str(d / f"{m}-decoder.int8.onnx"), tokens=str(d / f"{m}-tokens.txt"), num_threads=os.cpu_count() or 2)


def main():
    a = sys.argv
    if len(a) < 3: sys.exit(__doc__)
    import jiwer, soundfile as sf
    from scipy.signal import resample_poly
    sys.path.insert(0, str(Path(__file__).resolve().parent)); import story3d
    story = json.loads(Path(a[1]).read_text(encoding="utf-8")); work = Path(a[2]); work.mkdir(parents=True, exist_ok=True)
    story3d.FPS = int(story.get("fps", 60)); tl, total = story3d.synth(story, work)
    au, sr = sf.read(work / "voice.wav", dtype="float32"); rec = recogniser(a[a.index("--model") + 1] if "--model" in a else "small.en")
    lines = [l for sh in story["shots"] for l in sh.get("lines", [])]; errs = tot = bad = 0
    for ln, t in zip(lines, tl):
        seg = resample_poly(au[int(t["start"] * sr):int(t["end"] * sr)], 16000, sr).astype(np.float32)
        st = rec.create_stream(); st.accept_waveform(16000, seg); rec.decode_stream(st); hyp = st.result.text.strip()
        ref = norm(ln["text"]); m = jiwer.process_words(ref, norm(hyp) or "x"); e = m.substitutions + m.deletions + m.insertions; n = len(ref.split())
        errs += e; tot += n
        if e:
            bad += 1; print(f"MISHEARD {e}/{n} words, {n / (t['end'] - t['start']):.1f} words/s [{ln.get('who') or 'narrator'}] {ln['text']!r} -> {hyp!r}")
    pace = tot / max(sum(t["end"] - t["start"] for t in tl), 0.01)
    print(f"{len(lines)} lines, {bad} misheard; word error rate {100 * errs / max(tot, 1):.1f}% over {tot} words; pace {pace:.2f} words/s; {total:.1f} s")


if __name__ == "__main__":
    main()
