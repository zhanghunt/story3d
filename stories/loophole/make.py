# "The Loophole" - an In-This-World short. Run: python make.py  -> loophole.json
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
CH = {
 "liam": {"skin": "#f1c79f", "hair": "messy", "hair_color": "#5a3a22", "shirt_style": "hoodie", "shirt": "#2f7fd1", "pants_style": "jeans", "pants": "#2f3f66", "shoes": "#f5f5f5", "voice": "am_puck", "pitch": 3},
 "noah": {"skin": "#e2b48e", "hair": "spiky", "hair_color": "#1e1a17", "shirt_style": "jersey", "shirt": "#e1574c", "number": 9, "pants_style": "sweats", "pants": "#1f2937", "voice": "am_echo", "pitch": 2, "scale": 1.08},
 "tremblay": {"skin": "#f0cfae", "hair": "cap", "hat_color": "#1b2a4a", "hair_color": "#6b6258", "shirt_style": "button", "shirt": "#2a4f8f", "shirt_text": "POLICE", "tie": "#111827", "pants_style": "pants", "pants": "#1b2433", "shoes": "#111111", "voice": "am_onyx", "scale": 1.12},
 "young": {"skin": "#f0cfae", "hair": "messy", "hair_color": "#6b4a2a", "shirt_style": "stripes", "shirt": "#e0a63a", "shirt2": "#ffffff", "pants_style": "shorts", "pants": "#3a4f73", "scale": 0.9},
 "officer": {"skin": "#c98f68", "hair": "cap", "hat_color": "#1b2a4a", "shirt_style": "button", "shirt": "#2a4f8f", "shirt_text": "POLICE", "pants_style": "pants", "pants": "#1b2433", "shoes": "#111111", "scale": 1.05},
 "officer2": {"skin": "#f3d2b3", "hair": "cap", "hat_color": "#1b2a4a", "shirt_style": "button", "shirt": "#2a4f8f", "shirt_text": "POLICE", "pants_style": "pants", "pants": "#1b2433", "shoes": "#111111", "scale": 1.05},
 "emma": {"skin": "#f3d2b3", "hair": "long", "hair_color": "#8a3b1f", "shirt_style": "stripes", "shirt": "#e85d8a", "shirt2": "#ffffff", "pants_style": "jeans", "pants": "#33416b", "voice": "af_bella", "pitch": 2, "eyes": "round"},
 "singh": {"skin": "#b9835d", "hair": "short", "hair_color": "#1b1b1b", "shirt_style": "button", "shirt": "#7a9a6a", "tie": "#2b3a55", "pants_style": "pants", "pants": "#3a3f4a", "glasses": True, "voice": "am_michael", "scale": 1.1},
 "busman": {"skin": "#e9b98f", "hair": "short", "hair_color": "#3b3b3b", "shirt_style": "suit", "shirt": "#5b6270", "tie": "#b3262e", "pants_style": "pants", "pants": "#2b2f36", "shoes": "#1b1b1b", "voice": "am_adam", "scale": 1.1},
}
N = lambda t, c=None: dict(text=t, **({"caption": c} if c else {}))
S = lambda w, t, c=None: dict(who=w, text=t, **({"caption": c} if c else {}))
RED, GREEN = "#ff4d4d", "#3ddc84"
HUD = lambda t, y, col, show=None, h=0.42: {"type": "label", "text": t, "at3": [0, 0, 0], "w": 2.4, "h": h, "color": col, "border": col, "minh": 0.05, "show": show, "hud": [0, y]}
PLAZA = {"crowd": 140, "gather": [0, 4, 6, 26, 0, 360]}
shots = [
 # 1 HOOK - big street, the fine lands
 {"set": "street", "crowd": 24, "traffic": 4, "cast": [{"id": "busman", "pos": [2, 5.5], "face": -20, "act": "flip", "expr": "angry", "tag": "−$1,000", "tag_color": RED}],
  "cam": {"type": "full", "on": "busman", "move": "descend", "angle": 20, "reveal_dist": 24, "reveal_height": 34}, "sfx": [{"type": "ding", "at": 0.7, "db": -4}],
  "lines": [N("In this world, flipping someone off costs a thousand dollars.")]},
 # 2 punchline reaction
 {"set": "street", "crowd": 24, "traffic": 4, "cast": [{"id": "busman", "pos": [2, 5.5], "face": -20, "expr": "shock", "tag": "−$1,000", "tag_color": RED}],
  "cam": {"type": "medium", "on": "busman", "move": "push", "angle": 10, "punch": [0.2, 1.15]}, "sfx": [{"type": "impact", "at": 0.15, "db": -6}],
  "lines": [N("Instantly. Straight out of your bank account.")]},
 # 3 LARGE - the rules of this world
 {"set": "plaza", "crowd": 90, "cast": [],
  "props": [HUD("Eye roll   −$5", 0.66, "#ffd46b", show=[1.0]), HUD("Thumbs down   −$50", 0.52, "#ff9f43", show=[2.2]), HUD("Middle finger   −$1,000", 0.38, RED, show=[3.6])],
  "cam": {"pos": [-40, 46, 60], "to_pos": [-14, 20, 30], "look": [0, 0, 0], "to_look": [0, 2, 0]}, "dur": 10.5,
  "lines": [N("Ever since the Gesture Act, the sky keeps score."), N("Eye roll: five bucks. Thumbs down: fifty. The middle finger: a thousand.", "Eye roll: $5. Thumbs down: $50. The middle finger: $1,000."), N("Nobody broke the rules. Nobody could afford to.")], "pause": 0.3},
 # 4 stakes - Liam's savings
 {"set": "room", "cast": [{"id": "liam", "pos": [0, 0], "face": 0, "expr": "happy", "act": "hold", "tag": "$340", "tag_color": GREEN}],
  "cam": {"type": "medium", "on": "liam", "move": "push", "angle": 15},
  "lines": [N("Liam had three hundred and forty dollars. Two years of saving, for one bike.", "Liam had $340. Two years of saving, for one bike.")]},
 # 4b how expensive small things are
 {"set": "room", "cast": [{"id": "liam", "pos": [0, 0], "face": 15, "expr": "smug", "tag": "−$5", "tag_color": RED}],
  "cam": {"type": "medium", "on": "liam", "move": "push", "angle": -20}, "sfx": [{"type": "ding", "at": 0.5, "db": -8}],
  "lines": [N("Last week, one eye roll at his sister cost him five of it.")]},
 # 5 the rich bully
 {"set": "school", "crowd": 22, "cast": [{"id": "noah", "pos": [1.0, 5.5], "face": -30, "act": "flip", "expr": "grin", "tag": "−$1,000", "tag_color": RED}],
  "cam": {"type": "medium", "on": "noah", "move": "push", "angle": -20}, "sfx": [{"type": "ding", "at": 0.3, "db": -6}],
  "lines": [N("Noah had a dad who paid his fines."), S("noah", "Put it on my tab."), N("His total this year: forty-two thousand dollars.", "His total this year: $42,000.")]},
 # 6 inciting moment
 {"set": "school", "crowd": 20, "cast": [{"id": "noah", "pos": [1.0, 5.5], "face": -100, "act": "talk", "expr": "smug", "look": "liam"}, {"id": "liam", "pos": [-1.1, 5.5], "face": 90, "expr": "angry", "look": "noah"}],
  "cam": {"type": "medium", "on": ["noah", "liam"], "move": "push", "angle": 15},
  "lines": [S("noah", "Watch it, Liam.")]},
 # 7 temptation
 {"set": "school", "crowd": 20, "cast": [{"id": "liam", "pos": [-1.1, 5.5], "face": 60, "act": "raise", "expr": "angry", "tag": "−$1,000?", "tag_color": RED}],
  "cam": {"type": "close", "on": "liam", "move": "push", "angle": -15},
  "lines": [N("Liam had never wanted to spend a thousand dollars so badly. But he only had three-forty.", "Liam had never wanted to spend $1,000 so badly. But he only had $340.")]},
 # 8 the loophole
 {"set": "school", "crowd": 20, "cast": [{"id": "liam", "pos": [-1.1, 5.5], "face": 60, "act": "pinky", "expr": "smug", "tag": "$0", "tag_color": GREEN}],
  "cam": {"type": "medium", "on": "liam", "move": "push", "angle": 10}, "sfx": [{"type": "ding", "at": 0.35, "db": -4}],
  "lines": [N("So he tried something else."), N("Zero dollars. It wasn't on the list.", "$0. It wasn't on the list.")], "pause": 0.5},
 # 9 reaction
 {"set": "school", "crowd": 20, "cast": [{"id": "noah", "pos": [1.0, 5.5], "face": -100, "expr": "shock", "act": "shock"}],
  "cam": {"type": "close", "on": "noah", "move": "push", "angle": 15},
  "lines": [S("noah", "Did he just...?")]},
 # 10 it spreads - Emma
 {"set": "classroom", "cast": [{"id": "emma", "pos": [0.9, 0], "face": -30, "act": "pinky", "expr": "happy", "tag": "$0", "tag_color": GREEN}, {"id": "liam", "pos": [-1.2, 0.4], "face": 40, "expr": "happy"}],
  "cam": {"type": "medium", "on": ["emma", "liam"], "move": "push", "angle": -10},
  "lines": [S("emma", "Wait. It's free?"), S("liam", "Totally free."), N("And free things spread fast.")]},
 # 11 LARGE - the whole town
 {"set": "plaza", **PLAZA, "cheer": 0.85, "crowd_act": "pinky", "crowd_at": 0.6, "npc_tag": "$0", "npc_tag_color": GREEN,
  "cast": [{"id": "liam", "pos": [0, 4], "face": 0, "act": "pinky", "expr": "happy"}],
  "cam": {"type": "medium", "on": "liam", "move": "reveal", "reveal_dist": 46, "reveal_height": 30, "spin": 40}, "sfx": [{"type": "crowd", "at": 0.3, "db": -7}], "dur": 5.5,
  "lines": [N("By lunch, the whole school knew. By dinner, the whole town.")]},
 # 12 LARGE - montage on main street
 {"set": "street", "crowd": 46, "gather": [0, 3.5, 3, 16, 0, 200], "cheer": 0.9, "crowd_act": "pinky", "crowd_at": 0.2, "npc_tag": "$0", "npc_tag_color": GREEN, "traffic": 3, "cast": [],
  "cam": {"pos": [-22, 7, 20], "to_pos": [10, 9, 18], "look": [-6, 1.5, 3], "to_look": [6, 1.5, 3]}, "dur": 7.0,
  "lines": [N("Drivers used it in traffic. Refs used it on coaches. Somebody's grandma used it at bingo.")]},
 # 12a even the teacher
 {"set": "classroom", "cast": [{"id": "singh", "pos": [0, -2], "face": 0, "act": "pinky", "expr": "smug", "tag": "$0", "tag_color": GREEN}],
  "cam": {"type": "medium", "on": "singh", "move": "push", "angle": 20},
  "lines": [N("Even Mr. Singh used it during attendance.")]},
 # 12b the news
 {"set": "studio", "cast": [{"id": "busman", "pos": [0, 0], "face": 0, "act": "talk", "expr": "worried"}],
  "props": [HUD("BREAKING: THE PINKY PANIC", 0.62, RED)],
  "cam": {"type": "medium", "on": "busman", "move": "push", "angle": 10},
  "lines": [N("The news called it the Pinky Panic."), S("busman", "Experts say the gesture is, quote, technically legal.")]},
 # 12c Noah snitches
 {"set": "school", "crowd": 14, "cast": [{"id": "noah", "pos": [1.0, 5.5], "face": -20, "act": "talk", "expr": "angry"}],
  "cam": {"type": "close", "on": "noah", "move": "push", "angle": -15},
  "lines": [N("Noah wasn't laughing anymore."), S("noah", "Gesture Police? I want to report a kid. Liam.")]},
 # 13 LARGE - the Gesture Police arrive through the crowd
 {"set": "plaza", "crowd": 120, "gather": [0, 6, 7, 26, 0, 260],
  "cast": [{"id": "tremblay", "path": [[-16, 0, -14], [-6, 0, -5], [-1.5, 0, -1]], "act": "walk", "move": [0, 0.9]},
           {"id": "officer", "path": [[-18, 0, -12], [-8, 0, -3.5], [-3.6, 0, 0.4]], "act": "walk", "move": [0, 0.9]},
           {"id": "officer2", "path": [[-15, 0, -16.5], [-5, 0, -7.2], [0.6, 0, -2.6]], "act": "walk", "move": [0, 0.9]}],
  "cam": {"type": "wide", "on": "tremblay", "angle": 35, "relative": False, "scale": 0.8, "height": -2.5, "move": "push"}, "sfx": [{"type": "boom", "at": 0.1, "db": -8}],
  "lines": [N("Then the Gesture Police showed up. Led by Chief Tremblay, the man who wrote the Gesture Act himself.")]},
 # 14
 {"set": "plaza", **PLAZA, "cast": [{"id": "tremblay", "pos": [-1.5, -1], "face": 20, "act": "point", "expr": "angry"}],
  "cam": {"type": "medium", "on": "tremblay", "move": "push", "angle": -25},
  "lines": [S("tremblay", "Whoever started the pinky thing. Step forward.")]},
 # 14b the ban
 {"set": "plaza", **PLAZA, "cast": [{"id": "tremblay", "pos": [-1.5, -1], "face": 10, "act": "talk", "expr": "angry"}],
  "cam": {"type": "full", "on": "tremblay", "move": "push", "angle": 20}, "sfx": [{"type": "ooh", "at": 0.6, "db": -6}],
  "lines": [S("tremblay", "Starting tomorrow, the pinky costs a thousand dollars.")]},
 # 15 LARGE - the crowd steps back, Liam alone
 {"set": "plaza", "crowd": 140, "gather": [0, 4, 7.5, 26, 0, 360], "cast": [{"id": "liam", "pos": [0, 4], "face": 180, "expr": "worried"}, {"id": "tremblay", "pos": [0, -1.2], "face": 0}],
  "cam": {"pos": [10, 30, 30], "to_pos": [6, 22, 20], "look": [0, 0, 3], "to_look": [0, 0, 3]}, "dur": 6.5,
  "lines": [N("Nobody had ever been fined for something that wasn't a crime. Liam was about to be the first.")], "pause": 0.5},
 # 16 Liam stands up for himself
 {"set": "plaza", **PLAZA, "cast": [{"id": "liam", "pos": [0, 4.6], "face": 180, "expr": "determined", "look": "tremblay"}, {"id": "tremblay", "pos": [0, 2.3], "face": 0}],
  "cam": {"type": "close", "on": "liam", "move": "push", "angle": 15},
  "lines": [S("liam", "It's not on the list. You can't fine me for it.")]},
 # 17
 {"set": "plaza", **PLAZA, "cast": [{"id": "tremblay", "pos": [0, 2.3], "face": 0, "expr": "smug", "look": "liam"}, {"id": "liam", "pos": [0, 4.6], "face": 180}],
  "cam": {"type": "close", "on": "tremblay", "move": "push", "angle": 20},
  "lines": [S("tremblay", "You think you invented that?")], "pause": 0.6},
 # 18a young Tremblay being fined
 {"set": "street", "crowd": 16, "post": {"look": "flashback"}, "cast": [{"id": "young", "pos": [0, 5.5], "face": 10, "expr": "sad", "tag": "−$50", "tag_color": RED}],
  "props": [HUD("1989", 0.8, "#f3e3c0", h=0.5)],
  "cam": {"type": "medium", "on": "young", "move": "push", "angle": -15}, "sfx": [{"type": "sad", "at": 0.2, "db": -10}],
  "lines": [N("He hadn't."), N("Back in 1989, a kid named Marc Tremblay got fined for everything. His family nearly lost their house.")]},
 # 18 FLASHBACK - the twist
 {"set": "plaza", "crowd": 30, "post": {"look": "flashback"}, "cast": [{"id": "young", "pos": [0, 4], "face": 10, "act": "pinky", "expr": "grin", "tag": "$0", "tag_color": GREEN}],
  "props": [HUD("1989", 0.8, "#f3e3c0", h=0.5)],
  "cam": {"type": "medium", "on": "young", "move": "push", "angle": 15}, "sfx": [{"type": "magic", "at": 0.05, "db": -8}],
  "lines": [N("So he found a way around it.")]},
 # 19 payoff
 {"set": "plaza", **PLAZA, "cast": [{"id": "tremblay", "pos": [0, 2.3], "face": 0, "act": "pinky", "expr": "happy", "tag": "$0", "tag_color": GREEN}],
  "cam": {"type": "medium", "on": "tremblay", "move": "push", "angle": -15},
  "lines": [S("tremblay", "When I wrote the Gesture Act, I left this off the list. On purpose."), S("tremblay", "Every kid deserves one way to say what they feel.")]},
 # 19b the ban is off, Liam keeps his savings
 {"set": "plaza", **PLAZA, "cheer": 0.6, "cast": [{"id": "tremblay", "pos": [-1.1, 2.3], "face": 20, "act": "wave", "expr": "happy"}, {"id": "liam", "pos": [0.9, 3.4], "face": -20, "act": "cheer", "expr": "happy", "tag": "$340", "tag_color": GREEN}],
  "cam": {"type": "medium", "on": ["tremblay", "liam"], "move": "push", "angle": 10}, "sfx": [{"type": "crowd", "at": 0.3, "db": -8}],
  "lines": [S("tremblay", "Ban's cancelled."), N("Liam kept his three-forty. He bought the bike that weekend.", "Liam kept his $340. He bought the bike that weekend.")]},
 # 20 comedic button
 {"set": "plaza", **PLAZA, "cast": [{"id": "noah", "pos": [2.5, 5.5], "face": -30, "act": "flip", "expr": "grin", "tag": "−$1,000", "tag_color": RED}],
  "cam": {"type": "medium", "on": "noah", "move": "push", "angle": 15, "punch": [0.55, 1.2]}, "sfx": [{"type": "ding", "at": 0.55, "db": -4}],
  "lines": [N("Noah tried it too."), N("Wrong fingers.")], "pause": 0.7},
 # 21 LARGE finale
 {"set": "plaza", **PLAZA, "cheer": 0.9, "crowd_act": "pinky", "crowd_at": 0.0, "npc_tag": "$0", "npc_tag_color": GREEN,
  "cast": [{"id": "liam", "pos": [0.9, 4], "face": 0, "act": "pinky", "expr": "happy"}, {"id": "tremblay", "pos": [-1.1, 3.6], "face": 0, "act": "pinky", "expr": "happy"}],
  "props": [HUD("PART 2?", 0.55, "#ffd46b", show=[2.6])],
  "cam": {"type": "medium", "on": ["liam", "tremblay"], "move": "reveal", "reveal_dist": 50, "reveal_height": 34, "spin": -35}, "dur": 6.0, "sfx": [{"type": "crowd", "at": 0.2, "db": -6}, {"type": "riser", "at": 0.4, "db": -10}],
  "lines": [N("In this world, every rule has a loophole. You just have to find it. And use the right fingers.")]},
]
story = {"title": "The Loophole", "brand": "IN THIS WORLD", "narrator_voice": "af_jessica", "speed": 1.375, "captions": {"style": "word"}, "post": {"look": "golden"}, "characters": CH, "shots": shots}
json.dump(story, open(os.path.join(HERE, "loophole.json"), "w"), indent=1, ensure_ascii=False)
