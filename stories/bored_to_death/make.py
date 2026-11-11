# "Bored to Death" - an In-This-World short. Run: python make.py  -> bored_to_death.json
# Rule of the world: you only age while you're bored. The tag over every head is how old your body is:
# green = clock stopped (having fun), red = clock running (bored).
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
PR = {"skin": "#b9835d", "hair": "long", "hair_color": "#15110f", "shirt_style": "stripes", "shirt": "#12a594", "shirt2": "#ffffff", "pants_style": "jeans", "pants": "#33416b", "shoes": "#f5f5f5", "eyes": "round", "voice": "af_bella"}
CH = {
 "liam": {"skin": "#f1c79f", "hair": "messy", "hair_color": "#5a3a22", "shirt_style": "hoodie", "shirt": "#f08a24", "pants_style": "jeans", "pants": "#2f3f66", "shoes": "#f5f5f5", "voice": "am_puck", "pitch": 3, "scale": 0.92},
 # Priya at 12, 13, 14 and 15: same kid, a little taller (and a slightly lower voice) each time
 "priya12": {**PR, "scale": 0.92, "pitch": 3},
 "priya13": {**PR, "scale": 0.99, "pitch": 2.5},
 "priya14": {**PR, "scale": 1.06, "pitch": 2},
 "priya15": {**PR, "scale": 1.13, "pitch": 1.5},
 "singh": {"skin": "#b9835d", "hair": "short", "hair_color": "#ecebe6", "brow_color": "#cfcec8", "wrinkles": True, "glasses": True, "shirt_style": "button", "shirt": "#7a9a6a", "tie": "#2b3a55", "pants_style": "pants", "pants": "#3a3f4a", "shoes": "#1b1b1b", "voice": "am_santa", "scale": 1.08},
 # Liam's grandma: born 81 years ago, never bored, so she still looks nine
 "nani": {"skin": "#f1c79f", "hair": "bun", "hair_color": "#6b4426", "glasses": "#7a1f3d", "blush": True, "eyes": "round", "shirt_style": "jacket", "shirt": "#be185d", "shirt2": "#fde68a", "pants_style": "pants", "pants": "#4b5563", "shoes": "#8b5a2b", "voice": "af_heart", "pitch": 4, "scale": 0.8},
 "mateo": {"skin": "#d79e72", "hair": "spiky", "hair_color": "#1e1a17", "shirt_style": "jersey", "shirt": "#d94b3d", "number": 7, "pants_style": "sweats", "pants": "#1f2937", "voice": "am_echo", "pitch": 2, "scale": 0.96},
 "waiter": {"skin": "#e9b98f", "hair": "short", "hair_color": "#3b3b3b", "shirt_style": "suit", "shirt": "#5b6270", "tie": "#b3262e", "pants_style": "pants", "pants": "#2b2f36", "shoes": "#1b1b1b", "scale": 1.08},
}
N = lambda t, c=None: dict(text=t, **({"caption": c} if c else {}))
S = lambda w, t, c=None: dict(who=w, text=t, **({"caption": c} if c else {}))
RED, GREEN, GOLD = "#ff4d4d", "#3ddc84", "#ffd46b"
AGE = lambda a, b, at=0.1, dur=0.75: {"from": a, "to": b, "at": at, "dur": dur, "fmt": "AGE {}", "dec": 1}   # a clock that is running
HUD = lambda t, y, col, show=None, h=0.42, w=2.4: {"type": "label", "text": t, "at3": [0, 0, 0], "w": w, "h": h, "color": col, "border": col, "minh": 0.05, "show": show, "hud": [0, y]}
AGES = ["AGE 8", "AGE 11", "AGE 14", "AGE 19", "AGE 23", "AGE 27", "AGE 31", "AGE 16", "AGE 12", "AGE 35"]
TOWN = {"npc_tag": AGES, "npc_tag_color": GREEN}
PLAZA = {"crowd": 130, "gather": [0, 4, 6, 26, 0, 360]}
shots = [
 # 1 HOOK - a man waiting for the bus, his age racing up
 {"set": "street", "crowd": 24, "traffic": 4, **TOWN,
  "props": [{"type": "sign", "pos": [4.6, 6.4], "text": "BUS STOP\nDELAYED", "face": -20}],
  "cast": [{"id": "waiter", "pos": [2, 5.5], "face": -20, "act": "think", "expr": "bored", "tag": AGE(30, 31, 0.2, 0.75), "tag_color": RED}],
  "cam": {"type": "full", "on": "waiter", "move": "descend", "angle": 20, "reveal_dist": 18, "reveal_height": 20}, "sfx": [{"type": "riser", "at": 0.2, "db": -10}],
  "lines": [N("In this world, you only age when you're bored.")]},
 # 2 punchline - the teacher
 {"set": "classroom", "cast": [{"id": "singh", "pos": [0, -2], "face": 0, "expr": "bored", "tag": AGE(89.6, 90, 0.1, 0.5), "tag_color": RED}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "singh", "move": "push", "angle": 12, "punch": [0.52, 1.15]}, "sfx": [{"type": "ding", "at": 0.52, "db": -5}],
  "lines": [N("That's why Mr. Singh looks ninety. He's twenty-six.", "That's why Mr. Singh looks 90. He's 26.")]},
 # 2b
 {"set": "classroom", "cast": [{"id": "singh", "pos": [0, -2], "face": 0, "act": "talk", "expr": "bored", "tag": AGE(90, 90.3), "tag_color": RED}],
  "cam": {"type": "full", "on": "singh", "move": "push", "angle": -22},
  "lines": [S("singh", "Okay, class. Attendance.")]},
 # 3 LARGE - the rules of this world
 {"set": "plaza", "crowd": 90, **TOWN, "cast": [],
  "props": [HUD("Waiting room   +1 week", 0.66, GOLD, show=[1.75]), HUD("Homework   +1 month", 0.52, "#ff9f43", show=[2.85]), HUD("Long meeting   +1 year", 0.38, RED, show=[3.65])],
  "cam": {"pos": [-40, 46, 60], "to_pos": [-14, 20, 30], "look": [0, 0, 0], "to_look": [0, 2, 0]},
  "lines": [N("Fun stops your clock. Boredom starts it again."), N("A waiting room costs you a week. Homework costs a month. One long meeting can cost a whole year.")]},
 # 3b so everybody chases fun
 {"set": "plaza", **PLAZA, "cheer": 0.75, **TOWN, "cast": [],
  "cam": {"pos": [18, 12, 34], "to_pos": [-12, 14, 32], "look": [4, 2, 4], "to_look": [-3, 2, 4]}, "sfx": [{"type": "crowd", "at": 0.1, "db": -8}],
  "lines": [N("So everybody here chases fun. All day, every day.")]},
 # 4 grandma
 {"set": "park", "crowd": 10, "cast": [{"id": "nani", "pos": [0, 3], "face": 0, "act": "dance", "expr": "grin", "tag": "AGE 9", "tag_color": GREEN}],
  "props": [HUD("GRANDMA   born 81 years ago", 0.7, GOLD, show=[0.5], w=2.9)],
  "cam": {"type": "full", "on": "nani", "move": "arc", "angle": 15},
  "lines": [N("Liam's grandma was born eighty-one years ago. She has never been bored once.", "Liam's grandma was born 81 years ago. She has never been bored once.")]},
 # 4b
 {"set": "park", "crowd": 10, "cast": [{"id": "nani", "path": [[0, 0, 3], [6, 0, 3.4], [16, 0, 2.6]], "act": "run", "expr": "grin", "move": [0.15, 1], "tag": "AGE 9", "tag_color": GREEN}],
  "cam": {"type": "track", "on": "nani", "angle": 20, "dist": 11, "height": 1.6},
  "lines": [S("nani", "Last one to the swings is a rotten egg!")]},
 # 5 the heroes
 {"set": "school", "crowd": 20, "cast": [{"id": "liam", "pos": [-1.1, 5.5], "face": 10, "expr": "happy", "act": "wave", "tag": "AGE 12", "tag_color": GREEN}, {"id": "priya12", "pos": [1.1, 5.5], "face": -10, "expr": "happy", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "medium", "on": ["liam", "priya12"], "move": "push", "angle": 12},
  "lines": [N("Liam was twelve. So was his best friend, Priya.", "Liam was 12. So was his best friend, Priya.")]},
 # 5b
 {"set": "park", "crowd": 12, "cast": [{"id": "liam", "pos": [-1.4, 3], "face": 15, "expr": "grin", "act": "jump", "tag": "AGE 12", "tag_color": GREEN}, {"id": "priya12", "pos": [1.4, 3.3], "face": -15, "expr": "grin", "act": "cheer", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "full", "on": ["liam", "priya12"], "move": "arc", "angle": -18},
  "lines": [N("They had both been twelve for three years. That was the plan.", "They had both been 12 for three years. That was the plan.")]},
 # 6 the turn - her clock starts
 {"set": "school", "crowd": 16, "cast": [{"id": "priya12", "pos": [1.1, 5.5], "face": -10, "expr": "bored", "tag": AGE(12, 12.6, 0.3, 0.6), "tag_color": RED}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "priya12", "move": "push", "angle": -15}, "sfx": [{"type": "ding", "at": 0.45, "db": -6}],
  "lines": [N("Then, this fall, Priya's clock started running.")]},
 # 7a
 {"set": "classroom", "cast": [{"id": "priya13", "pos": [0.6, 0.2], "face": 10, "expr": "bored", "tag": AGE(12.8, 13, 0.1, 0.5), "tag_color": RED}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "priya13", "move": "push", "angle": 18},
  "lines": [N("By October, she was thirteen.", "By October, she was 13.")]},
 # 7b taller than him
 {"set": "street", "crowd": 18, **TOWN, "cast": [{"id": "priya14", "pos": [1.0, 5.5], "face": -15, "expr": "worried", "tag": "AGE 14", "tag_color": RED}, {"id": "liam", "pos": [-1.0, 5.5], "face": 70, "expr": "worried", "look": "priya14", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "full", "on": ["priya14", "liam"], "move": "push", "angle": -10},
  "lines": [N("By November, she was fourteen, and a whole head taller than him.", "By November, she was 14, and a whole head taller than him.")]},
 # 8 everyone knows what it means - the crowd steps back
 {"set": "plaza", "crowd": 140, "gather": [0, 4, 7.5, 26, 0, 360], **TOWN, "cast": [{"id": "priya14", "pos": [0, 4], "face": 0, "expr": "sad", "tag": "AGE 14", "tag_color": RED}],
  "cam": {"pos": [10, 30, 30], "to_pos": [6, 22, 20], "look": [0, 0, 3], "to_look": [0, 0, 3]},
  "lines": [N("Everyone knew what that meant. Somebody was boring her.")]},
 # 8b
 {"set": "school", "crowd": 14, "cast": [{"id": "mateo", "pos": [1.2, 5.5], "face": -90, "act": "point", "expr": "smug", "look": "liam"}, {"id": "liam", "pos": [-1.1, 5.5], "face": 90, "expr": "worried", "look": "mateo", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "medium", "on": ["mateo", "liam"], "move": "push", "angle": 14},
  "lines": [S("mateo", "Bro. She hangs out with you every single day.")]},
 # 8c
 {"set": "school", "crowd": 14, "cast": [{"id": "liam", "pos": [-1.1, 5.5], "face": 40, "act": "shock", "expr": "shock", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "liam", "move": "push", "angle": -12, "punch": [0.3, 1.15]},
  "lines": [N("Liam did the math. It was him.")]},
 # 9 he gets interesting
 {"set": "room", "cast": [{"id": "liam", "pos": [0, 0], "face": 0, "expr": "determined", "act": "think", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "liam", "move": "push", "angle": 16},
  "lines": [N("So Liam got interesting. Fast.")]},
 # 9a monday
 {"set": "park", "crowd": 10, "cast": [{"id": "liam", "pos": [-1.3, 3], "face": 50, "act": "dance", "expr": "grin", "look": "priya14"}, {"id": "priya14", "pos": [1.5, 3.2], "face": -50, "expr": "happy", "look": "liam", "tag": "AGE 14", "tag_color": RED}],
  "props": [HUD("MONDAY", 0.72, GOLD, h=0.4, w=1.4)],
  "cam": {"type": "full", "on": ["liam", "priya14"], "move": "arc", "angle": 12},
  "lines": [N("Monday, he learned to dance.")]},
 # 9b wednesday - surprise party
 {"set": "room", "fx": "confetti", "cast": [{"id": "liam", "pos": [-1.6, 0.4], "face": 30, "act": "cheer", "expr": "grin"}, {"id": "priya14", "pos": [1.5, 0.6], "face": -30, "act": "shock", "expr": "happy", "tag": "AGE 14", "tag_color": RED}],
  "props": [HUD("WEDNESDAY", 0.72, GOLD, h=0.4, w=1.7), {"type": "table", "pos": [0, -1.2], "size": [2.2, 1.2]}, {"type": "cake", "pos": [0, -1.2], "candles": 7}],
  "cam": {"type": "full", "on": ["liam", "priya14"], "move": "push", "angle": -14}, "sfx": [{"type": "pop", "at": 0.1, "db": -6}],
  "lines": [N("Wednesday, he threw her a surprise party.")]},
 # 9c LARGE friday - a parade
 {"set": "plaza", **PLAZA, "cheer": 0.9, "fx": "confetti",
  "cast": [{"id": "liam", "pos": [-1.0, 4], "face": 0, "act": "cheer", "expr": "grin"}, {"id": "priya14", "pos": [1.1, 4], "face": 0, "expr": "happy", "act": "wave", "tag": "AGE 14", "tag_color": RED}],
  "props": [HUD("FRIDAY", 0.72, GOLD, h=0.4, w=1.3)],
  "cam": {"type": "medium", "on": ["liam", "priya14"], "move": "reveal", "reveal_dist": 46, "reveal_height": 30, "spin": 40}, "sfx": [{"type": "crowd", "at": 0.15, "db": -6}],
  "lines": [N("And Friday, he threw her an entire parade.")]},
 # 10 she loves it
 {"set": "plaza", **PLAZA, "cheer": 0.6, "fx": "confetti", "cast": [{"id": "priya14", "pos": [1.1, 4], "face": -25, "act": "talk", "expr": "grin", "look": "liam", "tag": "AGE 14", "tag_color": RED}, {"id": "liam", "pos": [-1.0, 4], "face": 25, "expr": "happy", "look": "priya14"}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "priya14", "move": "push", "angle": 18},
  "lines": [S("priya14", "You are so weird."), N("She laughed every single time.")]},
 # 10b and still
 {"set": "street", "time": "sunset", "crowd": 12, "cast": [{"id": "priya15", "pos": [1.0, 5.5], "face": -10, "expr": "sad", "tag": AGE(14.7, 15, 0.1, 0.55), "tag_color": RED}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "priya15", "move": "push", "angle": -16, "roll": -5}, "sfx": [{"type": "sad", "at": 0.2, "db": -9}],
  "lines": [N("And she still turned fifteen.", "And she still turned 15.")]},
 # 11 low point
 {"set": "room", "time": "night", "props": [{"type": "box", "pos": [0, -0.45], "size": [1.7, 0.95, 1.5], "color": "#5b7fd6"}], "cast": [{"id": "liam", "pos": [0, 0], "face": 10, "expr": "sad", "act": "sit", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "full", "on": "liam", "move": "push", "angle": -18},
  "lines": [N("Liam checked his own number. Still twelve.", "Liam checked his own number. Still 12.")]},
 # 11b
 {"set": "room", "time": "night", "props": [{"type": "box", "pos": [0, -0.45], "size": [1.7, 0.95, 1.5], "color": "#5b7fd6"}], "cast": [{"id": "liam", "pos": [0, 0], "face": 10, "expr": "sad", "act": "sit", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "liam", "move": "push", "angle": 14},
  "lines": [S("liam", "I'm having the best year of my life. And I'm boring her to death.")]},
 # 12 grandma's clue
 {"set": "room", "time": "night", "props": [{"type": "box", "pos": [-1.0, -0.45], "size": [1.7, 0.95, 1.5], "color": "#5b7fd6"}], "cast": [{"id": "nani", "pos": [1.1, 0.5], "face": -60, "act": "talk", "expr": "smug", "look": "liam", "tag": "AGE 9", "tag_color": GREEN}, {"id": "liam", "pos": [-1.0, 0], "face": 35, "expr": "sad", "act": "sit"}],
  "cam": {"type": "medium", "on": ["nani", "liam"], "move": "push", "angle": 10},
  "lines": [S("nani", "Boring? Liam. That girl's number has never moved in this house. Not once. I checked.")]},
 # 12b
 {"set": "room", "time": "night", "cast": [{"id": "liam", "pos": [-1.0, 0], "face": 30, "expr": "shock", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "liam", "move": "push", "angle": -14, "punch": [0.45, 1.12]},
  "lines": [N("So where was it moving?")]},
 # 13 he walks her home
 {"set": "street", "time": "sunset", "crowd": 14, "traffic": 2,
  "cast": [{"id": "priya15", "path": [[-3.2, 0, 5.3], [3.2, 0, 5.3]], "act": "walk", "linear": True, "expr": "happy", "tag": "AGE 15", "tag_color": GREEN}, {"id": "liam", "path": [[-4.8, 0, 5.9], [1.6, 0, 5.9]], "act": "walk", "linear": True, "expr": "determined", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "full", "on": ["priya15", "liam"], "angle": 32, "relative": False, "zoom": 1.15, "move": "push"},
  "lines": [N("That evening, Liam walked her home for the first time.")]},
 # 13b the dark house
 {"set": "street", "time": "night", "crowd": 0, "traffic": 0,
  "cast": [{"id": "priya15", "path": [[0, 0, 4.5], [0, 0, -4.5]], "act": "walk", "move": [0, 1], "expr": "sad", "tag": "AGE 15", "tag_color": GREEN}, {"id": "liam", "pos": [2.6, 6.4], "face": 180, "act": "wave", "expr": "worried"}],
  "cam": {"pos": [7, 5.5, 17], "to_pos": [4.5, 5, 14.5], "look": [0, 2.4, 0], "to_look": [0, 2.4, -2]},
  "lines": [N("Her house was dark. Her parents both worked nights.")]},
 # 13c the reveal - through the window
 {"set": "room", "time": "night", "set_text": "#5b6478", "props": [{"type": "box", "pos": [0, -0.45], "size": [1.7, 0.95, 1.5], "color": "#8a6fb0"}], "cast": [{"id": "priya15", "pos": [0, 0], "face": 15, "act": "sit", "expr": "bored", "tag": AGE(15, 15.4, 0.3, 0.7), "tag_color": RED}],
  "cam": {"type": "full", "on": "priya15", "move": "push", "angle": -20, "foreground": "window", "roll": -6}, "sfx": [{"type": "sad", "at": 0.15, "db": -8}],
  "lines": [N("Priya sat down, alone, and her number started to climb.")]},
 # 14 the twist
 {"set": "street", "time": "night", "post": {"exposure": 1.25}, "crowd": 0, "traffic": 0, "cast": [{"id": "liam", "pos": [2.6, 6.4], "face": 170, "expr": "sad", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "liam", "move": "push", "angle": 200, "relative": False},
  "lines": [N("She was never bored with Liam.")]},
 # 14b
 {"set": "room", "time": "night", "set_text": "#5b6478", "props": [{"type": "box", "pos": [0, -0.45], "size": [1.7, 0.95, 1.5], "color": "#8a6fb0"}], "cast": [{"id": "priya15", "pos": [0, 0], "face": 15, "act": "sit", "expr": "sad", "tag": AGE(15.4, 15.6), "tag_color": RED}],
  "cam": {"type": "high", "on": "priya15", "move": "pull", "angle": 25, "punch": [0.35, 1.2]}, "sfx": [{"type": "impact", "at": 0.35, "db": -7}],
  "lines": [N("She was bored without him.")], "pause": 0.25},
 # 15 the long way
 {"set": "park", "crowd": 12, "cast": [{"id": "liam", "path": [[-4.6, 0, 3.7], [3.4, 0, 3.7]], "act": "walk", "linear": True, "expr": "happy", "tag": "AGE 12", "tag_color": GREEN}, {"id": "priya15", "path": [[-6.4, 0, 2.7], [1.6, 0, 2.7]], "act": "walk", "linear": True, "expr": "neutral", "tag": "AGE 15", "tag_color": GREEN}],
  "cam": {"type": "full", "on": ["liam", "priya15"], "angle": 34, "relative": False, "move": "push"},
  "lines": [N("So the next day, Liam walked her home again. The long way.")]},
 # 15b
 {"set": "park", "crowd": 10, "cast": [{"id": "priya15", "pos": [1.1, 3], "face": -70, "act": "talk", "expr": "worried", "look": "liam", "tag": "AGE 15", "tag_color": GREEN}, {"id": "liam", "pos": [-1.1, 3], "face": 70, "expr": "smug", "look": "priya15", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "medium", "on": ["priya15", "liam"], "move": "push", "angle": -12},
  "lines": [S("priya15", "Liam. My house is the other way."), S("liam", "I know.")]},
 # 15c LARGE - the whole town
 {"set": "plaza", "crowd": 90, **TOWN,
  "cast": [{"id": "liam", "path": [[-7, 0, 6], [0, 0, 3.2], [7, 0, 6]], "act": "walk", "linear": True, "expr": "happy"}, {"id": "priya15", "path": [[-8.6, 0, 6.6], [-1.6, 0, 3.9], [5.4, 0, 6.8]], "act": "walk", "linear": True, "expr": "happy", "tag": "AGE 15", "tag_color": GREEN}],
  "cam": {"type": "full", "on": ["liam", "priya15"], "move": "reveal", "reveal_dist": 50, "reveal_height": 34, "spin": -35, "relative": False},
  "lines": [N("Past the park. Around the fountain. Through the whole town. Twice.")]},
 # 15d payoff
 {"set": "street", "time": "sunset", "crowd": 14, "cast": [{"id": "priya15", "pos": [1.1, 5.5], "face": -12, "expr": "grin", "act": "cheer", "tag": "AGE 15", "tag_color": GREEN}, {"id": "liam", "pos": [-1.1, 5.5], "face": 12, "expr": "happy", "tag": "AGE 12", "tag_color": GREEN}],
  "cam": {"type": "full", "on": ["priya15", "liam"], "move": "push", "angle": -10}, "sfx": [{"type": "ding", "at": 0.6, "db": -5}],
  "lines": [N("It took three hours. Her number didn't move once.")]},
 # 16 comedic button
 {"set": "room", "time": "night", "cast": [{"id": "liam", "pos": [0, 0], "face": 5, "act": "hold", "expr": "worried", "tag": AGE(12.7, 13, 0.25, 0.4), "tag_color": RED}],
  "cam": {"type": "medium", "zoom": 1.25, "on": "liam", "move": "push", "angle": 15, "punch": [0.62, 1.18]}, "sfx": [{"type": "ding", "at": 0.62, "db": -4}],
  "lines": [N("Liam's did. He turned thirteen that same night.", "Liam's did. He turned 13 that same night."), N("Waiting for her to text back.")], "pause": 0.25},
 # 17 LARGE finale
 {"set": "plaza", "time": "sunset", **PLAZA, "cheer": 0.5, **TOWN,
  "cast": [{"id": "liam", "pos": [-1.0, 4], "face": 0, "act": "wave", "expr": "happy", "tag": "AGE 13", "tag_color": GREEN}, {"id": "priya15", "pos": [1.1, 4], "face": 0, "act": "cheer", "expr": "grin", "tag": "AGE 15", "tag_color": GREEN}],
  "cam": {"type": "medium", "on": ["liam", "priya15"], "move": "reveal", "reveal_dist": 50, "reveal_height": 34, "spin": 35}, "sfx": [{"type": "crowd", "at": 0.2, "db": -7}, {"type": "riser", "at": 0.4, "db": -11}],
  "lines": [N("In this world, you only age when you're bored. So find the people who stop your clock. And take the long way home.")]},
]
story = {"title": "Bored to Death", "brand": "IN THIS WORLD", "narrator_voice": "af_jessica", "speed": 1.375, "captions": {"style": "word"}, "post": {"look": "golden"}, "characters": CH, "shots": shots}
json.dump(story, open(os.path.join(HERE, "bored_to_death.json"), "w"), indent=1, ensure_ascii=False)
print(len(shots), "shots")
