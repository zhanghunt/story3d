# "Nine Hundred" - an In-This-World short. Run: python make.py  -> nine_hundred.json
# Rule of the world: everyone is born with 1,000 luck, and every lucky break costs one. The tag over each head is what is left.
# Movement is part of the casting: every character has a gait, and the mood on their face sets their posture.
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
CH = {
 # the hero: bouncy when he is carefree, tiptoeing once he has three luck left
 "mateo": {"skin": "#b97a4f", "hair": "curly", "hair_color": "#1e1a17", "shirt_style": "hoodie", "shirt": "#0f9d8a", "pants_style": "jeans", "pants": "#2f3f66", "shoes": "#f5f5f5", "voice": "am_liam", "speed": 1.1, "scale": 0.92, "gait": "bouncy"},
 # his mom: unhurried, graceful, careful
 "mama": {"skin": "#b97a4f", "hair": "bun", "hair_color": "#1b1410", "shirt_style": "jacket", "shirt": "#e2725b", "shirt2": "#fff4e0", "pants_style": "pants", "pants": "#3b4252", "shoes": "#6b4a2f", "eyes": "round", "voice": "af_heart", "speed": 1.08, "scale": 1.08, "gait": "glide"},
 # the kid with luck to burn
 "kai": {"skin": "#f1c79f", "hair": "spiky", "hair_color": "#c9a24a", "shirt_style": "jersey", "shirt": "#d94b3d", "number": 9, "pants_style": "sweats", "pants": "#1f2937", "shoes": "#f5f5f5", "voice": "am_echo", "speed": 1.15, "scale": 0.98, "gait": "swagger"},
 "doctor": {"skin": "#e9b98f", "hair": "side", "hair_color": "#6b6b6b", "glasses": True, "shirt_style": "jacket", "shirt": "#f8fafc", "shirt2": "#93c5fd", "pants_style": "pants", "pants": "#334155", "shoes": "#1b1b1b", "voice": "am_michael", "speed": 1.1, "scale": 1.1, "gait": "stride"},
 # two passers-by who show the rule
 "ines": {"skin": "#d79e72", "hair": "long", "hair_color": "#3a2618", "shirt_style": "stripes", "shirt": "#7d4fb3", "shirt2": "#ffffff", "pants_style": "jeans", "pants": "#3f5f8f", "shoes": "#f2f2f2", "eyes": "round", "scale": 1.04, "gait": "stride"},
 "abuelo": {"skin": "#d79e72", "hair": "short", "hair_color": "#ecebe6", "brow_color": "#cfcec8", "wrinkles": True, "glasses": True, "shirt_style": "button", "shirt": "#8aa37b", "pants_style": "pants", "pants": "#5b5246", "shoes": "#3b2a1c", "scale": 1.04, "gait": "shuffle"},
}
N = lambda t, c=None: dict(text=t, **({"caption": c} if c else {}))
S = lambda w, t, c=None: dict(who=w, text=t, **({"caption": c} if c else {}))
RED, GREEN, GOLD = "#ff4d4d", "#3ddc84", "#ffd46b"
LK = lambda a, b, at=0.15, dur=0.6: {"from": a, "to": b, "at": at, "dur": dur, "fmt": "LUCK {}", "dec": 0}   # a counter that runs during the shot
HUD = lambda t, y, col, show=None, h=0.42, w=2.5: {"type": "label", "text": t, "at3": [0, 0, 0], "w": w, "h": h, "color": col, "border": col, "minh": 0.05, "show": show, "hud": [0, y]}
TOWN = {"npc_tag": ["LUCK 412", "LUCK 688", "LUCK 251", "LUCK 907", "LUCK 533", "LUCK 76", "LUCK 344", "LUCK 819", "LUCK 590", "LUCK 127"], "npc_tag_color": GOLD}
M3 = {"tag": "LUCK 3", "tag_color": RED}
HOSP = {"set": "room", "set_text": "#dfe9ee", "post": {"look": "flashback"}}
shots = [
 # 1 HOOK - the whole market from above, coming down on one worried kid
 {"set": "plaza", "crowd": 80, **TOWN, "cast": [{"id": "mateo", "pos": [0, 4], "face": 0, "act": "look_up", "expr": "worried", **M3}],
  "cam": {"type": "full", "on": "mateo", "move": "descend", "angle": 14, "reveal_dist": 30, "reveal_height": 30}, "sfx": [{"type": "riser", "at": 0.15, "db": -11}],
  "lines": [N("In this world, everyone is born with exactly one thousand luck.", "In this world, everyone is born with exactly 1,000 luck.")]},
 # 1b
 {"set": "plaza", "crowd": 60, "cast": [{"id": "mateo", "pos": [0, 4], "face": 0, "act": "look_up", "expr": "worried", **M3}],
  "cam": {"type": "medium", "zoom": 1.2, "on": "mateo", "move": "push", "angle": -16, "punch": [0.5, 1.14]}, "sfx": [{"type": "ding", "at": 0.5, "db": -6}],
  "lines": [N("Mateo is twelve. He has three left.", "Mateo is 12. He has 3 left.")]},
 # 2 the rule
 {"set": "park", "crowd": 8, "cast": [{"id": "ines", "pos": [0, 3], "face": 20, "act": "pick", "expr": "happy", "tag": LK(412, 411, 0.45, 0.12), "tag_color": GOLD}],
  "props": [{"type": "box", "pos": [0.42, 3.95], "size": [0.24, 0.05, 0.24], "color": "#ffd24a"}],
  "cam": {"type": "full", "on": "ines", "move": "push", "angle": 22}, "sfx": [{"type": "ding", "at": 0.5, "db": -7}],
  "lines": [N("Every lucky break costs one.")]},
 # 2b LARGE - the rule, written over the town
 {"set": "plaza", "crowd": 90, **TOWN, "cast": [],
  "props": [HUD("Green light   -1", 0.66, GREEN, show=[0.1]), HUD("Coin on the sidewalk   -1", 0.52, GOLD, show=[1.0], w=2.9), HUD("Last seat on the bus   -1", 0.38, "#ff9f43", show=[2.1], w=2.9)],
  "cam": {"pos": [-34, 30, 52], "to_pos": [-12, 15, 30], "look": [0, 2, -6], "to_look": [0, 3, -10]},
  "lines": [N("A green light. A coin on the sidewalk. The last seat on the bus.")]},
 # 2c spend it slowly
 {"set": "park", "crowd": 8, "cast": [{"id": "abuelo", "path": [[-3.0, 0, 2.6], [2.0, 0, 3.6]], "act": "walk", "linear": True, "expr": "happy", "tag": "LUCK 212", "tag_color": GOLD}],
  "cam": {"type": "full", "on": "abuelo", "angle": 52, "relative": False, "zoom": 1.1, "move": "push"},
  "lines": [N("Spend it slowly, and it lasts a lifetime.")]},
 # 3 Mateo did not
 {"set": "plaza", "crowd": 50, "cast": [{"id": "mateo", "pos": [-17.2, 2.4], "face": 95, "act": "spin", "spin_dur": 1.0, "expr": "grin", "tag": "LUCK 1,000", "tag_color": GOLD}],
  "cam": {"type": "full", "on": "mateo", "move": "push", "angle": 12}, "sfx": [{"type": "swoosh_long", "at": 0.05, "db": -12}],
  "lines": [N("Mateo did not spend it slowly.")]},
 # 3a tests
 {"set": "classroom", "cast": [{"id": "mateo", "pos": [0.6, 0.2], "face": 8, "act": "think", "expr": "smug", "tag": LK(1000, 742, 0.1, 0.8), "tag_color": GOLD}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "mateo", "move": "push", "angle": 18},
  "lines": [N("He guessed on every single test.")]},
 # 3b crossing
 {"set": "street", "crowd": 14, "traffic": 5, **TOWN, "cast": [{"id": "mateo", "path": [[-3.5, 0, 5.1], [3.2, 0, 6.0]], "act": "walk", "linear": True, "expr": "happy", "gait": "skip", "tag": LK(742, 431, 0.05, 0.9), "tag_color": GOLD}],
  "cam": {"type": "full", "on": "mateo", "angle": 50, "relative": False, "zoom": 1.15, "move": "push"},
  "lines": [N("He never looked before crossing.")]},
 # 3c ring toss
 {"set": "plaza", "crowd": 60, "fx": "confetti", "cast": [{"id": "mateo", "pos": [-17.2, 2.4], "face": 95, "act": "cheer", "expr": "grin", "tag": LK(431, 3, 0.05, 0.85), "tag_color": GOLD}],
  "props": [HUD("RING TOSS   428 wins in a row", 0.7, GOLD, show=[0.3], w=3.0)],
  "cam": {"type": "full", "on": "mateo", "move": "arc", "angle": -14}, "sfx": [{"type": "crowd", "at": 0.1, "db": -9}],
  "lines": [N("Then he won the ring toss four hundred times in a row.", "Then he won the ring toss 400 times in a row.")]},
 # 4 now
 {"set": "plaza", "crowd": 60, **TOWN, "cast": [{"id": "mateo", "path": [[-2.6, 0, 3.4], [2.0, 0, 4.6]], "act": "walk", "linear": True, "expr": "worried", "gait": "tiptoe", **M3}],
  "cam": {"type": "full", "on": "mateo", "angle": 52, "relative": False, "move": "push"},
  "lines": [N("Now he had three left, and a whole life to go.", "Now he had 3 left, and a whole life to go.")]},
 # 4b things just happen to you
 {"set": "street", "crowd": 10, "cast": [{"id": "mateo", "pos": [1, 5.5], "face": 25, "act": "stumble", "expr": "shock", **M3}],
  "cam": {"type": "full", "on": "mateo", "move": "push", "angle": -20}, "sfx": [{"type": "thud", "at": 0.3, "db": -6}],
  "lines": [N("Without luck, things just happen to you.")]},
 # 5 Kai
 {"set": "plaza", "crowd": 50, "cast": [{"id": "kai", "pos": [0.6, 4], "face": -10, "act": "coin", "expr": "smug", "tag": "LUCK 871", "tag_color": GOLD}],
  "cam": {"type": "low", "on": "kai", "move": "push", "angle": 22, "zoom": 1.35},
  "lines": [N("Kai still had eight hundred and seventy-one.", "Kai still had 871.")]},
 # 5b
 {"set": "plaza", "crowd": 50, "cast": [{"id": "kai", "pos": [0.6, 4], "face": -10, "act": "coin", "expr": "smug", "tag": LK(871, 870, 0.55, 0.1), "tag_color": GOLD}, {"id": "mateo", "pos": [-1.9, 4.3], "face": 60, "expr": "sad", "look": "kai", **M3}],
  "cam": {"type": "medium", "on": ["kai", "mateo"], "move": "push", "angle": 12}, "sfx": [{"type": "ding", "at": 0.6, "db": -8}],
  "lines": [S("kai", "Heads. Again.")]},
 # 5c the insult
 {"set": "plaza", "crowd": 50, "cast": [{"id": "kai", "pos": [0.6, 4], "face": -70, "act": "point", "expr": "smug", "look": "mateo", "tag": "LUCK 870", "tag_color": GOLD}, {"id": "mateo", "pos": [-1.9, 4.3], "face": 70, "expr": "angry", "look": "kai", **M3}],
  "cam": {"type": "medium", "on": ["kai", "mateo"], "move": "push", "angle": -14},
  "lines": [S("kai", "Your mom's a ninety-seven. Wasting it runs in the family.", "Your mom's a 97. Wasting it runs in the family.")]},
 # 6 mom
 {"set": "street", "crowd": 12, "traffic": 3, "cast": [{"id": "mama", "path": [[-3, 0, 5.1], [2.4, 0, 6.0]], "act": "walk", "linear": True, "expr": "neutral", "tag": "LUCK 97", "tag_color": RED}],
  "cam": {"type": "full", "on": "mama", "angle": 50, "relative": False, "zoom": 1.1, "move": "push"},
  "lines": [N("It was true. His mom had ninety-seven.", "It was true. His mom had 97.")]},
 # 6b careful
 {"set": "street", "crowd": 10, "traffic": 0, "cast": [{"id": "mama", "pos": [1, 5.5], "face": -15, "expr": "neutral", "tag": "LUCK 97", "tag_color": RED}],
  "props": [{"type": "sign", "pos": [3.8, 6.5], "text": "WAIT", "face": -25, "size": [1.8, 1.3]}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "mama", "move": "push", "angle": -18},
  "lines": [N("She waited at every red light, even on empty streets.")]},
 # 6c
 {"set": "room", "time": "sunset", "cast": [{"id": "mama", "pos": [1.4, 0.2], "face": -20, "expr": "happy", "act": "talk", "tag": "LUCK 97", "tag_color": RED}, {"id": "mateo", "pos": [-1.3, 0.3], "face": 25, "expr": "bored", **M3}],
  "cam": {"type": "full", "on": ["mama", "mateo"], "move": "push", "angle": 10},
  "lines": [N("In twelve years, his mom had not spent a single one.", "In 12 years, his mom had not spent a single one.")]},
 # 6d what he assumed
 {"set": "room", "time": "sunset", "cast": [{"id": "mateo", "pos": [-1.3, 0.3], "face": 25, "act": "think", "expr": "bored", **M3}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "mateo", "move": "push", "angle": -15},
  "lines": [N("Mateo figured she had wasted her luck long ago. Just like him.")]},
 # 7 he asks
 {"set": "room", "time": "night", "cast": [{"id": "mateo", "pos": [-1.2, 0.3], "face": 70, "act": "talk", "expr": "sad", "look": "mama", **M3}, {"id": "mama", "pos": [1.3, 0.2], "face": -70, "expr": "neutral", "look": "mateo", "tag": "LUCK 97", "tag_color": RED}],
  "cam": {"type": "medium", "on": ["mateo", "mama"], "move": "push", "angle": 12},
  "lines": [S("mateo", "Mom. How did you waste yours?")]},
 # 7b
 {"set": "room", "time": "night", "cast": [{"id": "mama", "pos": [1.3, 0.2], "face": -30, "act": "talk", "expr": "happy", "tag": "LUCK 97", "tag_color": RED}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "mama", "move": "push", "angle": 16},
  "lines": [S("mama", "Waste it? I never wasted any.")]},
 # 8 flashback - the hospital
 {**HOSP, "cast": [{"id": "mama", "pos": [-3.45, -3.0], "face": 62, "act": "sit", "expr": "worried", "tag": "LUCK 997", "tag_color": GOLD}, {"id": "doctor", "pos": [-0.7, -2.2], "face": -55, "act": "shake", "expr": "sad"}],
  "cam": {"type": "full", "on": ["mama", "doctor"], "move": "push", "angle": 6, "relative": False},
  "lines": [N("The night Mateo was born, something went wrong.")]},
 # 8b
 {**HOSP, "cast": [{"id": "doctor", "pos": [-0.9, -2.4], "face": -60, "act": "talk", "expr": "sad"}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "doctor", "move": "push", "angle": 20},
  "lines": [S("doctor", "I'm sorry. It would take a miracle.")]},
 # 8c the price
 {**HOSP, "fx": "sparkles", "cast": [{"id": "mama", "pos": [-3.45, -3.0], "face": 50, "act": "hope", "expr": "determined", "tag": LK(997, 97, 0.12, 0.72), "tag_color": GOLD}],
  "cam": {"type": "medium", "zoom": 1.3, "on": "mama", "move": "push", "angle": 14, "punch": [0.86, 1.14]}, "sfx": [{"type": "riser", "at": 0.05, "db": -8}, {"type": "boom", "at": 0.86, "db": -7}],
  "lines": [N("A miracle costs nine hundred. She paid it without blinking.", "A miracle costs 900. She paid it without blinking.")]},
 # 9 back home
 {"set": "room", "time": "night", "cast": [{"id": "mateo", "pos": [-1.2, 0.3], "face": 55, "act": "look_up", "expr": "shock", "look": "mama", **M3}, {"id": "mama", "pos": [1.3, 0.2], "face": -55, "expr": "happy", "look": "mateo", "tag": "LUCK 97", "tag_color": GOLD}],
  "cam": {"type": "full", "on": ["mateo", "mama"], "move": "push", "angle": -10},
  "lines": [N("Mateo looked at the three above his own head. Then at the ninety-seven above hers.", "Mateo looked at the 3 above his own head. Then at the 97 above hers.")]},
 # 9b
 {"set": "room", "time": "night", "cast": [{"id": "mateo", "pos": [-1.2, 0.3], "face": 40, "act": "talk", "expr": "cry", **M3}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "mateo", "move": "push", "angle": -14},
  "lines": [S("mateo", "You should have kept it.")]},
 # 9c the line
 {"set": "room", "time": "night", "cast": [{"id": "mama", "pos": [0.55, 0.25], "face": -70, "act": "hug", "expr": "happy", "look": "mateo", "tag": "LUCK 97", "tag_color": GOLD}, {"id": "mateo", "pos": [-0.55, 0.3], "face": 70, "act": "hug", "expr": "cry", "look": "mama"}],
  "cam": {"type": "medium", "zoom": 1.1, "on": ["mama", "mateo"], "move": "push", "angle": 14}, "sfx": [{"type": "sad", "at": 0.1, "db": -11}],
  "lines": [S("mama", "I did keep it. I'm looking at it right now.")], "pause": 0.25},
 # 10 the bet
 {"set": "plaza", "crowd": 50, "cast": [{"id": "kai", "pos": [0.8, 4], "face": -65, "act": "coin", "expr": "smug", "look": "mateo", "tag": "LUCK 866", "tag_color": GOLD}, {"id": "mateo", "pos": [-1.7, 4.2], "face": 65, "expr": "determined", "look": "kai", **M3}],
  "cam": {"type": "medium", "on": ["kai", "mateo"], "move": "push", "angle": 12},
  "lines": [N("The next morning, Kai wanted a bet."), S("kai", "Hey, Three. Double or nothing.")]},
 # 10b
 {"set": "plaza", "crowd": 50, "cast": [{"id": "mateo", "path": [[-1.7, 0, 4.2], [3.4, 0, 6.2]], "act": "walk", "move": [0.3, 1], "expr": "determined", "gait": "stride", **M3}, {"id": "kai", "pos": [0.8, 3.4], "face": 30, "act": "shrug", "expr": "shock", "tag": "LUCK 866", "tag_color": GOLD}],
  "cam": {"type": "full", "on": "mateo", "angle": 55, "relative": False, "move": "push"},
  "lines": [S("mateo", "No. I'm saving them.")]},
 # 11 he spends them
 {"set": "street", "crowd": 10, "traffic": 2, "fx": "sparkles", "cast": [{"id": "mateo", "pos": [1, 5.5], "face": 10, "act": "hope", "expr": "happy", "tag": LK(3, 0, 0.3, 0.4), "tag_color": RED}],
  "cam": {"type": "medium", "zoom": 1.2, "on": "mateo", "move": "push", "angle": -16}, "sfx": [{"type": "ding", "at": 0.7, "db": -5}],
  "lines": [N("That afternoon he spent all three. On her.", "That afternoon he spent all 3. On her.")]},
 # 11b LARGE every green light
 {"set": "plaza", "crowd": 90, **TOWN, "cast": [{"id": "mama", "path": [[-6, 0, 6], [0, 0, 3.6], [6, 0, 5.6]], "act": "walk", "linear": True, "expr": "grin", "gait": "bouncy", "tag": "LUCK 97", "tag_color": GREEN}],
  "props": [HUD("GREEN   GREEN   GREEN", 0.7, GREEN, show=[0.4], w=2.8)],
  "cam": {"type": "full", "on": "mama", "move": "reveal", "reveal_dist": 44, "reveal_height": 28, "spin": -30, "relative": False},
  "lines": [N("His mom hit every green light in town. First time in twelve years.", "His mom hit every green light in town. First time in 12 years.")]},
 # 12 zero
 {"set": "street", "time": "overcast", "fx": "rain", "crowd": 6, "traffic": 2, "cast": [{"id": "mateo", "path": [[-2.6, 0, 5.1], [2.4, 0, 6.0]], "act": "walk", "linear": True, "expr": "happy", "gait": "shuffle", "tag": "LUCK 0", "tag_color": RED}],
  "cam": {"type": "full", "on": "mateo", "angle": 50, "relative": False, "move": "push"},
  "lines": [N("Mateo walked home with zero.", "Mateo walked home with 0.")]},
 # 12b
 {"set": "street", "time": "overcast", "fx": "rain", "crowd": 6, "traffic": 0, "cast": [{"id": "mateo", "pos": [1, 5.5], "face": 10, "act": "shiver", "expr": "grin", "tag": "LUCK 0", "tag_color": RED}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "mateo", "move": "push", "angle": 14, "punch": [0.62, 1.12]},
  "lines": [N("It rained on him the whole way. Worth it.")], "pause": 0.2},
 # 13 LARGE finale
 {"set": "plaza", "time": "sunset", "crowd": 120, "gather": [0, 4, 6, 24, 0, 360], "cheer": 0.35, **TOWN,
  "cast": [{"id": "mateo", "pos": [-0.9, 4], "face": 8, "act": "wave", "expr": "grin", "tag": "LUCK 0", "tag_color": RED}, {"id": "mama", "pos": [1.0, 4], "face": -8, "expr": "happy", "tag": "LUCK 97", "tag_color": GOLD}],
  "cam": {"type": "medium", "on": ["mateo", "mama"], "move": "reveal", "reveal_dist": 50, "reveal_height": 34, "spin": 35}, "sfx": [{"type": "riser", "at": 0.3, "db": -12}],
  "lines": [N("In this world, everyone is born with a thousand luck. The luckiest ones are the people somebody spent theirs on.")]},
]
story = {"title": "Nine Hundred", "narrator_voice": "bm_george", "speed": 1.25, "captions": {"style": "word"}, "post": {"look": "golden"}, "characters": CH, "shots": shots}
json.dump(story, open(os.path.join(HERE, "nine_hundred.json"), "w"), indent=1, ensure_ascii=False)
print(len(shots), "shots")
