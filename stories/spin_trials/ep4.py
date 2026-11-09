from common import *
CR = {"crowd": 110, "gather": [0, 3, 9, 25, 0, 160], "cheer": 0.2}
def fw(disk=0, hoop=0, wob=0):
    d = {"type": "flywheel", "id": "fa", "pos": [-3.5, 3], "kind": "disk", "r": 2.0, "weight": True, "spin": disk}
    h = {"type": "flywheel", "id": "fl", "pos": [3.5, 3], "kind": "hoop", "r": 2.0, "weight": True, "spin": hoop}
    if wob: d["swing"] = None
    return [d, h]
WA = lambda s=None, y=0.64: label("Disk  ω = {} rad/s", [0, 0, 0], 2.4, 0.42, bind={"prop": "fa", "q": "w"}, color="#5ef2c2", border="#5ef2c2", minh=0.045, show=s, hud=[0, y])
WL = lambda s=None, y=0.5: label("Hoop  ω = {} rad/s", [0, 0, 0], 2.4, 0.42, bind={"prop": "fl", "q": "w"}, color="#ff6b6b", border="#ff6b6b", minh=0.045, show=s, hud=[0, y])
HD = lambda txt, y, col, show=None: label(txt, [0, 0, 0], 2.6, 0.5, color=col, border=col, minh=0.05, show=show, hud=[0, y])
AVA = {"id": "ava", "pos": [-5.6, 5.6], "face": 30}
LEO = {"id": "leo", "pos": [5.6, 5.6], "face": -30}
shots = [
 {"set": "plaza", **CR, "props": fw(), "cast": [],
  "cam": {"pos": [-40, 30, 52], "to_pos": [-9, 8, 21], "look": [0, 2, 3], "to_look": [0, 3, 3]}, "sfx": [{"type": "crowd", "at": 0.2, "db": -12}],
  "lines": [N("In this world, everyone can see physics. Trial four: the Flywheel.")]},
 {"set": "plaza", **CR, "props": fw(), "cast": [{"id": "host", "pos": [0, 6.5], "act": "talk"}],
  "cam": {"type": "full", "on": "host", "scale": 1.3, "angle": 10, "move": "push"},
  "lines": [S("host", "Two wheels. Same mass, same size. A falling weight gives each one the same torque: eighty newton meters.", "Two wheels. Same mass, same size. A falling weight gives each the same torque: τ = 80 N·m."), S("host", "First to ten radians per second wins!", "First to ω = 10 rad/s wins!")]},
 {"set": "plaza", **CR, "props": fw(), "cast": [{"id": "leo", "path": [[7, 0, 10], [5.6, 0, 5.6]], "act": "walk", "move": [0, 0.5], "face": -30}],
  "cam": {"type": "full", "on": "leo", "angle": 20, "relative": False, "move": "push"},
  "lines": [S("leo", "I'll take the gold one."), N("Leo picked the golden hoop. Almost all of its mass sits out on the rim.")]},
 {"set": "plaza", **CR, "props": fw(), "cast": [{"id": "ava", "path": [[-7, 0, 10], [-5.6, 0, 5.6]], "act": "walk", "move": [0, 0.6], "face": 30}],
  "cam": {"type": "full", "on": "ava", "angle": -100, "relative": False, "move": "push"},
  "lines": [N("Ava picked the plain solid disk.")]},
 {"set": "plaza", **CR, "props": fw() + [HD("Hoop:  I = MR² = 40 kg·m²", 0.64, "#ff6b6b", [0.4]), HD("Disk:  I = [1|2]MR² = 20 kg·m²", 0.47, "#5ef2c2", [2.2])], "cast": [AVA, LEO],
  "clear_fg": True, "cam": {"type": "wide", "on": ["fa", "fl"], "scale": 0.62, "angle": 0, "move": "push"},
  "lines": [N("Same mass. But the hoop keeps all of it far from the axle. Its moment of inertia is forty. The disk's is only twenty.", "Same mass. But the hoop keeps it all far from the axle. Hoop: I = 40 kg·m². Disk: only 20.")]},
 {"set": "plaza", **CR, "props": fw() + [label("τ = Iα", [0, 0, 0], 1.6, 0.5, color="#ffd46b", border="#ffd46b", minh=0.065, show=[0.4], hud=[0, 0.62])], "cast": [AVA, LEO],
  "clear_fg": True, "cam": {"type": "wide", "on": ["fa", "fl"], "scale": 0.7, "angle": -18, "move": "orbit"},
  "lines": [N("Torque equals moment of inertia times angular acceleration. It's Newton's second law, for spinning.", "Torque = moment of inertia × angular acceleration. τ = Iα. Newton's second law, for spinning.")]},
 {"set": "plaza", **CR, "props": fw() + [HD("Disk:  α = [80|20] = 4 rad/s²", 0.64, "#5ef2c2", [0.4]), HD("Hoop:  α = [80|40] = 2 rad/s²", 0.47, "#ff6b6b", [1.6])], "cast": [AVA, LEO],
  "clear_fg": True, "cam": {"type": "wide", "on": ["fa", "fl"], "scale": 0.62, "angle": 12, "move": "push"},
  "lines": [N("Same torque, half the inertia: twice the angular acceleration. Ava's disk should gain four radians per second, every second. Leo's, only two.", "Same torque, half the inertia: twice the α. Disk: +4 rad/s every second. Hoop: only +2.")]},
 {"set": "plaza", **CR, "props": fw() + [label("ω = ω₀ + αt", [0, 0, 0], 2.0, 0.5, color="#ffd46b", border="#ffd46b", minh=0.065, show=[0.3], hud=[0, 0.62])], "cast": [AVA, LEO],
  "clear_fg": True, "cam": {"type": "wide", "on": ["fa", "fl"], "scale": 0.7, "angle": 20, "move": "orbit", "dir": -1},
  "lines": [N("Starting from zero, omega equals alpha times t. Ava should hit ten in two and a half seconds. Leo would need five.", "Starting from 0: ω = αt. Disk hits 10 in 2.5 s. Hoop needs 5 s.")]},
 {"set": "plaza", **CR, "props": fw(), "cast": [{"id": "host", "pos": [0, 6.5], "act": "point", "face": 0}],
  "cam": {"type": "medium", "on": "host", "angle": 60, "punch": [0.4, 1.25]}, "flash": True,
  "lines": [S("host", "Drop the weights!")]},
 {"set": "plaza", **CR, "props": fw({"w": 0, "alpha": 4, "at": 0.3}, {"w": 0, "alpha": 2, "at": 0.3}) + [WA(), WL()], "cast": [dict(AVA, act="cheer"), dict(LEO, act="strain")],
  "clear_fg": True, "cam": {"type": "wide", "on": ["fa", "fl"], "scale": 0.62, "angle": 0, "move": "push"}, "dur": 3.0, "sfx": [{"type": "hum", "at": 0.25, "db": -9}],
  "lines": []},
 {"set": "plaza", **CR, "cheer": 0.5, "props": fw(10.5, 5.6), "cast": [{"id": "host", "pos": [0, 6.5], "act": "point", "face": -40}],
  "cam": {"type": "medium", "on": "host", "angle": -15, "punch": [0.35, 1.2]}, "flash": True, "sfx": [{"type": "ding", "at": 0.1, "db": -6}, {"type": "crowd", "at": 0.2, "db": -8}],
  "lines": [S("host", "Ten! Ava wins!")]},
 {"set": "plaza", **CR, "props": fw(13, {"w": 6, "alpha": 2}) + [WL(y=0.62)], "cast": [{"id": "leo", "pos": [5.8, 6.4], "face": -20, "expr": "shock"}],
  "cam": {"type": "medium", "on": "leo", "angle": 30, "move": "push"},
  "lines": [S("leo", "No way...")]},
 {"set": "plaza", **CR, "props": [{"type": "flywheel", "id": "fa", "pos": [-3.5, 3], "kind": "disk", "r": 2.0, "weight": True, "spin": {"w": 12, "alpha": 6}}, WA(y=0.62)], "cast": [dict(AVA, expr="worried")],
  "cam": {"type": "medium", "on": "fa", "angle": -15, "move": "push"}, "sfx": [{"type": "hum", "at": 0.0, "db": -8}, {"type": "riser", "at": 0.3, "db": -8}],
  "lines": [N("But nobody stopped Ava's wheel. The weight kept falling, and the disk kept speeding up. Twenty. Thirty...")]},
 {"set": "plaza", **CR, "props": [{"type": "roller", "id": "w", "pos": [-3.5, 3], "dir": 180, "r": 2.0, "v": 8, "at": 0.15, "idle": True}],
  "cast": [], "cam": {"type": "full", "on": "w", "angle": 200, "relative": False, "scale": 0.9}, "flash": True, "dur": 2.6,
  "sfx": [{"type": "crack", "at": 0.05, "db": -2}, {"type": "ooh", "at": 0.3, "db": -6}],
  "lines": [N("Then the axle snapped.")]},
 {"set": "street", "traffic": 0, "crowd": 14, "props": [{"type": "roller", "id": "w", "pos": [-26, 1.8], "dir": 0, "r": 2.0, "v": 10},
   label("PART 5 ▸ THE RUNAWAY WHEEL", [0, 0, 0], 2.6, 0.42, color="#ffd46b", border="#ffd46b", minh=0.05, show=[1.6], hud=[0, 0.55])],
  "cast": [], "cam": {"type": "full", "on": "w", "angle": 40, "relative": False, "scale": 1.0}, "dur": 3.6, "sfx": [{"type": "riser", "at": 0.2, "db": -10}],
  "lines": [N("And it went rolling straight toward town.")]},
]
save('ep4', story("Spin Trials 4: The Flywheel", shots))
