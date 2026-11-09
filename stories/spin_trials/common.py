import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
CH = json.load(open(os.path.join(HERE, 'chars.json')))
CROWD_TT = {"crowd": 120, "gather": [0, 6, 11.5, 25, 0, 360], "cheer": 0.25}
def story(title, shots, **kw):
    d = {"title": title, "brand": "SPIN TRIALS", "narrator_voice": "af_jessica", "speed": 1.3, "captions": {"style": "word"}, "post": {"look": "golden"}, "characters": CH, "shots": shots}
    d.update(kw); return d
def N(text, caption=None):
    l = {"text": text}
    if caption: l["caption"] = caption
    return l
def S(who, text, caption=None):
    l = {"who": who, "text": text}
    if caption: l["caption"] = caption
    return l
def label(text, at3, w=3.6, h=1.0, **kw):
    d = {"type": "label", "text": text, "at3": at3, "w": w, "h": h}; d.update(kw); return d
def save(name, st):
    json.dump(st, open(os.path.join(HERE, f'{name}.json'), 'w'), indent=1, ensure_ascii=False)
