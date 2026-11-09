from common import *
CR = {"crowd": 110, "gather": [0, 2, 8.5, 25, 0, 150], "cheer": 0.2}
def door(swing=None, wob=0, **kw):
    d = {"type": "door", "id": "door", "pos": [-3, 2], "w": 6, "h": 7.5}
    if swing: d["swing"] = swing
    if wob: d["wobble"] = wob
    d.update(kw); return d
R_HINGE = {"type": "arrow", "on": "door", "from": [0, 2.3, 0.45], "to": [0.6, 2.3, 0.45], "color": "#4da3ff", "label": "r = 0.5 m", "lw": 2.2, "show": [0.4]}
F_HINGE = {"type": "arrow", "on": "door", "from": [0.6, 4.4, 2.8], "to": [0.6, 4.4, 0.5], "color": "#ff4d4d", "label": "F = 900 N", "lw": 2.4, "show": [0.8]}
R_FULL = {"type": "arrow", "on": "door", "from": [0, 2.3, 0.45], "to": [5.4, 2.3, 0.45], "color": "#4da3ff", "label": "r = 6 m", "lw": 2.0, "show": [0.4]}
F_ALONG = {"type": "arrow", "on": "door", "from": [10.0, 4.3, 0.0], "to": [6.4, 4.3, 0.0], "color": "#ff4d4d", "label": "F", "show": [0.6]}
F_PERP = {"type": "arrow", "on": "door", "from": [5.4, 4.4, 2.8], "to": [5.4, 4.4, 0.5], "color": "#ff4d4d", "label": "F = 300 N", "lw": 2.4, "show": [0.8]}
LEO_HINGE = {"id": "leo", "pos": [-2.4, 3.65], "face": 180, "act": "strain", "expr": "angry"}
LEO_EDGE = {"id": "leo", "pos": [4.6, 2.0], "face": -90, "act": "strain", "expr": "angry"}
shots = [
 {"set": "plaza", **CR, "props": [door()], "cast": [],
  "cam": {"pos": [44, 34, 58], "to_pos": [12, 9, 24], "look": [0, 2, 2], "to_look": [0, 4, 2]}, "sfx": [{"type": "crowd", "at": 0.2, "db": -12}],
  "lines": [N("In this world, everyone can see physics. And after the Great Wheel, everyone was watching Ava.")]},
 {"set": "plaza", **CR, "props": [door(), label("τ needed: 1500 N·m", [0, 10.6, 2.6], 5, 1.0, color="#ffd46b", border="#ffd46b", show=[1.2])],
  "cast": [{"id": "host", "pos": [1.5, 6.5], "act": "talk", "face": 10}],
  "cam": {"type": "full", "on": "host", "scale": 1.4, "angle": 15, "move": "push"},
  "lines": [S("host", "Trial two: the Vault Door! It takes fifteen hundred newton meters of torque to swing it open.", "Trial two: the Vault Door! It takes 1500 N·m of torque to swing it open.")]},
 {"set": "plaza", **CR, "props": [door()], "cast": [{"id": "leo", "pos": [-4, 9.5], "face": 160, "expr": "smug"}],
  "cam": {"type": "close", "on": "leo", "move": "push", "angle": 10},
  "lines": [S("leo", "Torque? I'll just push really hard.")]},
 {"set": "plaza", **CR, "props": [door([[0, 0]], 0.35), F_HINGE], "cast": [LEO_HINGE], "sfx": [{"type": "creak", "at": 0.3, "db": -14}],
  "cam": {"type": "full", "on": "leo", "angle": 135, "move": "push"},
  "lines": [N("Leo pushed with nine hundred newtons. But he pushed right next to the hinge.")]},
 {"set": "plaza", **CR, "props": [door([[0, 0]], 0.35), R_HINGE, F_HINGE, label("τ = rF = 0.5 × 900 = 450 N·m", [0, 0, 0], 2.6, 0.4, color="#ffffff", minh=0.045, show=[1.0], hud=[0, 0.62])], "cast": [LEO_HINGE],
  "cam": {"pos": [-1.5, 21, 11], "look": [-1.5, 0.5, 2.8], "to_pos": [-1.5, 19, 10]},
  "lines": [N("Torque is the force times how far from the pivot you push. Half a meter out, his torque was only four hundred fifty.", "Torque is the force × how far from the pivot you push. Half a meter out: only 450 N·m.")]},
 {"set": "plaza", **CR, "props": [door()], "cast": [{"id": "leo", "pos": [-1.6, 4.4], "face": 30, "expr": "angry"}],
  "cam": {"type": "close", "on": "leo", "angle": -15, "move": "push"},
  "lines": [S("leo", "Fine! I'll push it from the side!")]},
 {"set": "plaza", **CR, "props": [door([[0, 0]], 0.3), R_FULL, F_ALONG, label("θ = 0°", [7.5, 4.3, 2], 2.4, 0.9, color="#ff4d4d", border="#ff4d4d", show=[1.2])], "cast": [LEO_EDGE],
  "cam": {"pos": [10.5, 6.5, 13], "look": [3.5, 2.6, 2], "to_pos": [9.6, 6, 11.8]},
  "lines": [N("So he shoved along the door, straight toward the hinge.")]},
 {"set": "plaza", **CR, "props": [door([[0, 0]], 0.3), R_FULL, F_ALONG, label("τ = rF sin θ", [0, 0, 0], 2.0, 0.5, color="#ffd46b", border="#ffd46b", minh=0.06, show=[0.3], hud=[0, 0.64]), label("sin 0° = 0  →  τ = 0", [0, 0, 0], 2.4, 0.42, color="#ff4d4d", border="#ff4d4d", minh=0.045, show=[3.6], hud=[0, 0.46])], "cast": [LEO_EDGE],
  "cam": {"pos": [1, 24, 12], "look": [1, 0.5, 2.6], "to_pos": [1, 22, 11]},
  "lines": [N("But only the part of the force that's perpendicular to the door can turn it.", "Only the part of the force perpendicular to the door can turn it."), N("Push straight at the hinge, and the angle is zero. Sine of zero is zero. Zero torque.", "Push straight at the hinge: θ = 0. sin 0 = 0. Zero torque.")]},
 {"set": "plaza", **CR, "props": [door()], "cast": [{"id": "ava", "path": [[5.5, 0, 9.5], [3.6, 0, 6.2], [2.4, 0, 3.75]], "act": "walk", "move": [0.05, 0.8]}],
  "cam": {"type": "full", "on": "ava", "angle": 100, "relative": False, "move": "push"},
  "lines": [N("Then Ava walked to the very edge of the door. Six meters from the hinge.")]},
 {"set": "plaza", **CR, "props": [door([[0, 0], [5.2, 0], [6.5, 6]]), R_FULL, F_PERP, label("τ = 6 × 300 = 1800 N·m", [0, 0, 0], 2.6, 0.42, color="#5ef2c2", border="#5ef2c2", minh=0.05, show=[2.6], hud=[0, 0.62])],
  "cast": [{"id": "ava", "ride": {"on": "door", "at": [5.4, 1.65]}, "face": 180, "act": "push", "expr": "determined"}], "sfx": [{"type": "creak", "at": 0.85, "db": -10}],
  "cam": {"pos": [0.5, 24, 12], "look": [0.5, 0.5, 2.6], "to_pos": [0.5, 22, 11]},
  "lines": [N("She pushed with just three hundred newtons, straight into the door.", "She pushed with just 300 N, straight into the door."), N("Six times three hundred. Eighteen hundred newton meters.", "6 × 300 = 1800 N·m.")]},
 {"set": "plaza", **CR, "cheer": 0.5, "props": [door([[0, 6], [3.2, 82]])], "cast": [{"id": "ava", "ride": {"on": "door", "at": [5.4, 1.65]}, "face": 180, "act": "push"}],
  "cam": {"type": "wide", "on": "door", "angle": -20, "scale": 0.9, "move": "pull"}, "dur": 3.6, "sfx": [{"type": "creak", "at": 0.0, "db": -6}, {"type": "crowd", "at": 0.55, "db": -6}],
  "lines": [N("The vault door swung wide open.")]},
 {"set": "plaza", **CR, "props": [door([[0, 82]])], "cast": [{"id": "milo", "pos": [3.5, 10.6], "face": 200, "act": "cheer"}],
  "cam": {"type": "medium", "on": "milo", "move": "push", "angle": 10},
  "lines": [S("milo", "That's why door handles are never next to the hinge!")]},
 {"set": "plaza", **CR, "props": [door([[0, 82]])], "cast": [{"id": "leo", "pos": [-4, 9.5], "face": 170, "act": "shock"}],
  "cam": {"type": "close", "on": "leo", "move": "push", "angle": 15},
  "lines": [S("leo", "Two in a row?!")]},
 {"set": "plaza", **CR, "props": [door([[0, 82]])], "cast": [{"id": "host", "pos": [1.5, 6.5], "act": "point", "face": 20}],
  "cam": {"type": "medium", "on": "host", "angle": -65, "punch": [0.5, 1.25]}, "flash": True,
  "lines": [S("host", "Trial three... the Spin Staff!")]},
 {"set": "plaza", **CR, "props": [door([[0, 82]]), label("PART 3 ▸ THE SPIN STAFF", [0, 0, 0], 2.4, 0.42, color="#ffd46b", border="#ffd46b", minh=0.05, show=[1.8], hud=[0, 0.55])],
  "cast": [{"id": "leo", "pos": [-4, 9.5], "face": 160, "expr": "smug"}], "dur": 3.6, "sfx": [{"type": "riser", "at": 0.2, "db": -10}],
  "cam": {"type": "close", "on": "leo", "move": "pull", "angle": -10},
  "lines": [N("Leo smiled. This time, he'd grab it by the long end. Bigger is better. Right?")]},
]
save('ep2', story("Spin Trials 2: The Vault Door", shots))
