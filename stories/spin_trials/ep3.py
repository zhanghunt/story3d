from common import *
CR = {"crowd": 100, "gather": [0, 0, 8.5, 23, 0, 130], "cheer": 0.2}
Y = 0.6
def staff(id, x, grip, **kw):
    d = {"type": "staff", "id": id, "pos": [x, 0.9], "grip": grip, "len": 3.6, "y": 2.75}
    if grip == "end": d["face"] = 180  # long end reaches toward stage centre so it stays in frame
    d.update(kw); return d
LEO_SWING = [[0, 34], [1.1, 20], [1.9, 37], [2.9, 14], [3.8, 33], [4.9, 19], [5.9, 36], [7, 22]]
AVA_SPIN = {"w": 0, "alpha": 14, "at": 0.5, "max": 10}
LEO = {"id": "leo", "pos": [3.0, 0], "y": Y, "face": 0, "act": "strain", "expr": "angry"}
LEO_CAM = {"pos": [1.6, 4.0, 15.5], "look": [1.6, 2.3, 0.5], "to_pos": [1.6, 3.8, 14.2]}
AVA_T = {"id": "ava", "pos": [-2.6, 0], "y": Y, "face": 0, "act": "twirl", "rate": 10, "expr": "happy"}
R_LEO = {"type": "arrow", "on": "s2", "from": [0, 0, 0.18], "to": [3.6, 0, 0.18], "color": "#4da3ff", "label": "r = 3 m", "lw": 2.0, "thick": 0.07, "lat": [1.8, 0.5, 0.18], "show": [0.5]}
R_AVA = [{"type": "arrow", "on": "s1", "from": [0, 0, 0.18], "to": [1.8, 0, 0.18], "color": "#4da3ff", "label": "1.5 m", "lw": 1.6, "thick": 0.07, "lat": [0.9, 0.5, 0.18], "show": [0.5]},
         {"type": "arrow", "on": "s1", "from": [0, 0, 0.18], "to": [-1.8, 0, 0.18], "color": "#4da3ff", "thick": 0.07, "show": [0.5]}]
shots = [
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "props": [], "cast": [{"id": "host", "pos": [0, -1], "y": Y, "act": "wave"}],
  "cam": {"pos": [3, 7, 34], "to_pos": [1, 4.2, 15], "look": [0, 3.2, 0], "to_look": [0, 3, -1]}, "sfx": [{"type": "crowd", "at": 0.2, "db": -12}],
  "lines": [N("In this world, everyone can see physics. Trial three was held on the main stage.")]},
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "props": [staff("hs", 0, "center", spin=0)], "cast": [{"id": "host", "pos": [0, 0], "y": Y, "act": "hold"}],
  "cam": {"type": "medium", "on": "host", "move": "push", "angle": 12},
  "lines": [S("host", "Spin the staff ten times. Same staff for both of you. Eight kilograms. Three meters long.", "Spin the staff 10 times. Same staff for both of you. 8 kg. 3 m long.")]},
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "props": [], "cast": [{"id": "leo", "pos": [2.4, 0], "y": Y, "face": -15, "expr": "smug"}],
  "cam": {"type": "close", "on": "leo", "move": "push", "angle": 15},
  "lines": [S("leo", "I'm grabbing it by the end. More reach, more power.")]},
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "clear_fg": True, "props": [staff("s2", 3.0, "end", swing=LEO_SWING, wobble=1.5)], "cast": [LEO],
  "cam": LEO_CAM, "sfx": [{"type": "thud", "at": 0.45, "db": -10}],
  "lines": [N("Leo grabbed it by the end... and it barely moved.")]},
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "clear_fg": True, "props": [staff("s2", 3.0, "end", swing=LEO_SWING, wobble=1.5), R_LEO, label("I = Σ mr²", [0, 0, 0], 1.8, 0.5, color="#ffd46b", border="#ffd46b", minh=0.06, show=[0.3], hud=[0, 0.62])], "cast": [LEO],
  "cam": dict(LEO_CAM, pos=[1.0, 4.4, 16], to_pos=[1.2, 4.1, 14.8]),
  "lines": [N("Here's why. Moment of inertia adds up every bit of mass, times its distance from the axis, squared.", "Moment of inertia adds up every bit of mass × its distance from the axis, squared. I = Σ mr².")]},
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "clear_fg": True, "props": [staff("s2", 3.0, "end", swing=LEO_SWING, wobble=1.5), R_LEO, label("I = [1|3]ML² = 24 kg·m²", [0, 0, 0], 2.4, 0.62, color="#ff6b6b", border="#ff6b6b", minh=0.075, show=[0.3], hud=[0, 0.6])], "cast": [LEO],
  "cam": dict(LEO_CAM, pos=[3.4, 4.5, 14.5], to_pos=[2.2, 4.1, 13.5]),
  "lines": [N("Grab the end, and most of the staff is far from your hands. Twice as far counts four times as much. For Leo, twenty four.", "Grab the end, and most of the staff is far from your hands. Twice as far → 4× as much. Leo: I = 24 kg·m².")]},
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "props": [staff("s1", -2.6, "center", spin=0)], "cast": [{"id": "ava", "pos": [-2.6, 0], "y": Y, "face": 0, "act": "hold", "expr": "determined"}],
  "cam": {"type": "medium", "on": "ava", "angle": 20, "move": "push"},
  "lines": [N("Ava grabbed it right in the middle.")]},
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "props": [staff("s1", -2.6, "center", spin=AVA_SPIN), *R_AVA, label("I = [1|12]ML² = 6 kg·m²", [0, 0, 0], 2.4, 0.62, color="#5ef2c2", border="#5ef2c2", minh=0.075, show=[1.2], hud=[0, 0.6])], "cast": [AVA_T],
  "cam": {"type": "full", "on": "ava", "scale": 1.2, "angle": -12, "move": "push"}, "sfx": [{"type": "whoosh", "at": 0.15, "db": -8}],
  "lines": [N("Now no part of the staff is more than one and a half meters from her hands. Her moment of inertia: six. Four times smaller.", "No part of the staff is more than 1.5 m from her hands. I = 6 kg·m². Four times smaller.")]},
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "props": [staff("s1", -2.6, "center", spin=10), label("{} spins", [0, 0, 0], 1.6, 0.5, color="#ffffff", bind={"prop": "s1", "q": "rev"}, dec=0, minh=0.06, hud=[0, 0.62])], "cast": [AVA_T],
  "cam": {"type": "medium", "on": "ava", "angle": 25, "move": "orbit"}, "dur": 5.5,
  "lines": [N("Same staff. Same arms. Four times easier.")]},
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "props": [], "cast": [{"id": "milo", "pos": [3.5, 9.4], "face": 195, "act": "cheer"}],
  "cam": {"type": "medium", "on": "milo", "angle": 195, "move": "push", "relative": False},
  "lines": [S("milo", "It's the same staff! She just moved the axis!")]},
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "props": [], "cast": [{"id": "host", "pos": [0, -1.5], "y": Y, "act": "point", "face": -35}],
  "cam": {"type": "medium", "on": "host", "angle": -20, "punch": [0.5, 1.25]}, "flash": True,
  "lines": [S("host", "Ava takes trial three!")]},
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "cheer": 0.6, "props": [], "cast": [{"id": "ava", "pos": [-1, 0], "y": Y, "face": 0, "act": "cheer"}],
  "cam": {"type": "medium", "on": "ava", "move": "reveal", "reveal_dist": 36, "reveal_height": 20, "spin": -25}, "dur": 3.4, "sfx": [{"type": "crowd", "at": 0.05, "db": -6}],
  "lines": [N("Three trials. Three wins. And the crowd was starting to chant her name.")]},
 {"set": "stage", "set_text": "SPIN TRIALS", **CR, "props": [], "cast": [{"id": "leo", "pos": [3, 0.5], "y": Y, "face": -20, "expr": "angry"}],
  "cam": {"type": "close", "on": "leo", "move": "push", "angle": -12},
  "lines": [S("leo", "Okay. No more tricks. Trial four is pure power.")]},
 {"set": "plaza", "crowd": 25, "props": [{"type": "flywheel", "id": "fl", "pos": [3.2, 4], "kind": "hoop", "r": 2.0, "spin": 0.4}, {"type": "flywheel", "id": "fa", "pos": [-3.2, 4], "kind": "disk", "r": 2.0, "spin": 0},
   label("PART 4 ▸ THE FLYWHEEL", [0, 0, 0], 2.4, 0.42, color="#ffd46b", border="#ffd46b", minh=0.05, show=[1.8], hud=[0, 0.55])],
  "cast": [], "cam": {"type": "medium", "on": "fl", "move": "push", "angle": 15}, "dur": 3.6, "sfx": [{"type": "riser", "at": 0.2, "db": -10}],
  "lines": [N("Trial four was the Flywheel. And Leo had already picked the shiniest one.")]},
]
save('ep3', story("Spin Trials 3: The Spin Staff", shots))
