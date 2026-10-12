"""
Makes the Vault Boy's drawn walk for an outfit, images/vaultboy/walk-lvlXX.png
(16 drawings side by side: Gemini's 8 and one of mine after each, in the
parts' amber, facing right as drawn there: he walks toward the hand on his
hip; each as high as the parts' 308x420 frame and as wide as his fists need:
`left` and `width` in tools/vaultboy-walk.json), from a sheet of walk poses made by an
image generator (images/vaultboy/walk-lvlXX-source.webp: 2 rows of 4 on white,
from the brief and pose guide the owner sent to Gemini). It also measures how
far he goes from one drawing to the next, so that the boot on the ground
stays put (tools/vaultboy-walk.json, read by tools/vaultboy-moves.py).

The 8 drawings make one walk cycle, two steps: contact (the front heel down,
the back boot on its toes), down (the front boot flat, the body low), passing
(one boot under him, the other swinging past), up (pushing on the back toes,
the swinging leg reaching forward); then the same with the other leg. The
near leg is the lighter blue, the far one darker.

Gemini kept the near leg in front in all 8 poses, so the walk is made from the
4 of its bottom row (the top row's hips sit higher): for the other leg's 4,
the same drawings with the two legs' blues exchanged (CYCLES: a minus sign).
Some drawings also had a greyer jacket: made the same blue as the others
(above the belt). Then: the white background made transparent, the outfits' amber (tools/vaultboy-parts.py amber()), scaled to the
outfit's height (the head to the boots as in lvl05.png) and placed with the
boots on the same ground (411 of 420) and the belt over the outfit's belt.

How far he goes: between two drawings, the boot that stays on the ground in
both moves back under him by some pixels; the body would go forward by as
many for that boot to stay put. Which boot that is follows from the cycle:
the near one from contact to the other leg's contact, then the far one; it's
found among the boots on the ground (dark shapes at most 13px above the
lowest: the far boot stands a little higher), the front one, the one under
him or the back one, its toe (his front: the right end) the point that stays.
Gemini's drawings don't space those evenly (its "down" has the boots where
"contact" has them, its "up" where the next contact has them), so a boot
held exactly would make the body lurch: where he is at each drawing is taken
PLANT of the way from an even pace to the boot held exactly (the boot slips
a little, the body goes on a little unevenly). He moves when the drawing
changes, as in a flip book.

The in-betweens (the owner: make them yourself): with 8 drawings a cycle he
moved in jumps. Between each two of Gemini's, a drawing of mine, halfway
(inbetween()): the body and hips as in the first (they hold still from one
drawing to the next); each leg, split from the drawing (legs_of(): the near
leg lighter, the far one darker, each with its outline and boot), bent from
its pose to halfway to its pose in the next drawing, from the joints
measured by hand (TWEEN_JOINTS: hip, knee, ankle, toe), smoothly, each pixel
moved by its bones and a pelvis that holds still (bent()); taken from the
drawing that shows more of that leg; the far leg's thigh, where the near leg
hides it, filled in its own blue. It stands halfway between the two
drawings' places.

After a change: python tools/vaultboy-walk.py (Python 3 with Pillow and numpy),
then python tools/vaultboy-moves.py, then node --test.
"""
import importlib.util
import json
import math
import os
import sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DIR = os.path.join(ROOT, 'images', 'vaultboy')
sys.dont_write_bytecode = True                                      # no tools/__pycache__
spec = importlib.util.spec_from_file_location('vaultboy_parts', os.path.join(ROOT, 'tools', 'vaultboy-parts.py'))
parts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parts)                                      # its amber; it cuts nothing when imported

FW, FH = 308, 420                    # a frame, as the parts sheets
GROUND = 411                         # where his boots stand in it (the front sole in tools/vaultboy-moves.py RIGS)
# Each outfit with a drawn walk: the source sheet's 8 cells (row by row), in
# the cycle's order; a minus sign: that drawing with the legs' blues exchanged.
CYCLES = {'05': [5, 6, -7, -8, -5, -6, 7, 8]}
# For each step from a drawing to the next, the boot that stays on the ground:
# where it is in the first drawing and in the second (front, under him, back).
PLANTED = [('front', 'front'), ('front', 'under'), ('under', 'back'), ('back', 'back')] * 2
PLANT = 0.5                          # 0: an even pace (the boots slip), 1: the boot held exactly (the body lurches)

def belt_rows(a):
    """The belt: the widest band of yellow (the collar and the stripe are narrower)."""
    yellow = (a[..., 0] > 200) & (a[..., 1] > 180) & (a[..., 2] < 170)
    width = yellow.sum(axis=1)
    rows = [y for y in range(a.shape[0]) if width[y] > 0.6 * width.max()]
    return rows[0], rows[-1], yellow

def blues(a, where):
    sat = a[..., 2] - a[..., 0]
    blueish = where & (sat > 12) & (a.max(axis=2) > 60) & (a.min(axis=2) < 200)
    return blueish & (sat > 60), blueish & (sat <= 60)          # the near leg's blue, the far leg's (and a grey jacket)

def drawing(cell, swap):
    a = cell.astype(float)
    h, w = a.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    b0, b1, yellow = belt_rows(a)
    bx = np.nonzero(yellow[b0:b1 + 1].any(axis=0))[0]
    blue = a[blues(a, ys >= 0)[0]].mean(axis=0)                    # the near leg's and sleeves' blue
    jacket_grey = blues(a, ys < b0)[1]
    if jacket_grey.sum() > 2000:
        a[jacket_grey] += blue - a[jacket_grey].mean(axis=0)
    if swap:
        legs = (ys > b1 + 2) & ~((ys < b1 + 60) & ((xs < bx[0] - 10) | (xs > bx[-1] + 10)))   # not the hands
        near, far = blues(a, legs)
        mn, mf = a[near].mean(axis=0), a[far].mean(axis=0)
        a[near] += mf - mn
        a[far] += mn - mf
    return np.clip(a, 0, 255), (bx[0] + bx[-1]) / 2.0

def transparent(rgb):
    """The white around him (reached from the edges) made transparent."""
    h, w = rgb.shape[:2]
    white = rgb.min(axis=2) > 215
    bg = np.zeros((h, w), bool)
    todo = deque((y, x) for y in range(h) for x in (0, w - 1) if white[y, x])
    todo.extend((y, x) for x in range(w) for y in (0, h - 1) if white[y, x])
    for y, x in todo: bg[y, x] = True
    while todo:
        y, x = todo.popleft()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < w and white[yy, xx] and not bg[yy, xx]:
                bg[yy, xx] = True; todo.append((yy, xx))
    return np.dstack([rgb, np.where(bg, 0, 255)])

def components(mask):
    """Each 4-connected piece of the mask: (labels, how many)."""
    lab, n = np.zeros(mask.shape, int), 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]: continue
        n += 1; lab[y0, x0] = n
        todo = deque([(y0, x0)])
        while todo:
            y, x = todo.popleft()
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < mask.shape[0] and 0 <= xx < mask.shape[1] and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n; todo.append((yy, xx))
    return lab, n

def boots(rgba):
    """The boots on the ground, left to right: (left end, right end) of each
    dark shape near the bottom at most 13px above the lowest one."""
    dark = (rgba[..., 3] > 128) & (rgba[..., :3].max(axis=2) < 70)
    bottom = np.nonzero(rgba[..., 3] > 128)[0].max()
    dark[:bottom - 75] = False
    lab, n = components(dark)
    found = []
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(ys) > 400 and bottom - ys.max() <= 13:
            found.append((int(xs.min()), int(xs.max())))
    return sorted(found)

def toe(found, where, middle):
    if where == 'front': b = found[-1]
    elif where == 'back': b = found[0]
    else: b = min(found, key=lambda g: abs((g[0] + g[1]) / 2.0 - middle))
    return b[1]

# ---------- in-betweens: a drawing of mine between each two of Gemini's ----------
# Each source drawing's legs, measured by hand (pixels of its 500x558 cell):
# the near leg (drawn lighter) and the far one, hip, knee, ankle and the tip
# of the boot. The body holds still from one drawing to the next (same
# height, same place in the cell); only the legs move.
TWEEN_JOINTS = {'05': {
    5: {'near': dict(hip=(252, 352), knee=(287, 425), ankle=(322, 497), toe=(383, 486)),
        'far': dict(hip=(246, 354), knee=(212, 415), ankle=(178, 476), toe=(217, 512))},
    6: {'near': dict(hip=(252, 352), knee=(300, 411), ankle=(330, 496), toe=(392, 510)),
        'far': dict(hip=(246, 354), knee=(203, 410), ankle=(160, 466), toe=(183, 512))},
    7: {'near': dict(hip=(252, 352), knee=(288, 410), ankle=(230, 463), toe=(233, 520)),
        'far': dict(hip=(246, 354), knee=(253, 425), ankle=(260, 497), toe=(298, 517))},
    8: {'near': dict(hip=(252, 352), knee=(280, 426), ankle=(307, 501), toe=(362, 515)),
        'far': dict(hip=(246, 354), knee=(211, 415), ankle=(177, 477), toe=(218, 512))},
}}
BONES = (('hip', 'knee'), ('knee', 'ankle'), ('ankle', 'toe'))
PELVIS = 372                         # cell rows above: the hips as drawn, under the turning legs

def grown(mask, n=1):
    for _ in range(n):
        mask = mask | np.roll(mask, 1, 0) | np.roll(mask, -1, 0) | np.roll(mask, 1, 1) | np.roll(mask, -1, 1)
    return mask

def shrunk(mask, n=1):
    for _ in range(n):
        mask = mask & np.roll(mask, 1, 0) & np.roll(mask, -1, 0) & np.roll(mask, 1, 1) & np.roll(mask, -1, 1)
    return mask

def legs_of(rgb):
    """A drawing's legs below the belt (the fists aside), each with its outline
    and boot: {'near', 'far'}, and its upper body (with the fists). The near
    leg is the lighter blue; its trousers and the far one's (their thick
    parts: not the soft edges of the outlines) and each boot's grey inside
    (the black outline parts two boots that touch; each goes to the leg whose
    trousers are nearest its top), then the outlines, to the leg they join."""
    a = rgb.astype(float)
    h, w = a.shape[:2]
    ys = np.mgrid[0:h, 0:w][0]
    ink = a.min(axis=2) < 215
    b0, b1, yellow = belt_rows(a)
    sat = a[..., 2] - a[..., 0]
    blue = ink & (sat > 12) & (a.max(axis=2) > 60) & (a.min(axis=2) < 200)
    skin = ink & (a[..., 0] > 150) & (a[..., 0] > a[..., 2] + 30) & ~yellow
    below = ys > b1
    fist = grown(skin, 5) & ink
    zone = below & ink & ~fist
    def thick(mask, least):
        lab, n = components(shrunk(mask, 2))
        keep = np.isin(lab, [k for k in range(1, n + 1) if (lab == k).sum() >= least])
        for _ in range(2):
            keep = keep | (grown(keep) & mask)
        return keep
    lab = np.zeros((h, w), int)
    lab[thick(zone & blue & (sat > 60), 800)] = 1
    lab[thick(zone & blue & (sat <= 60), 400)] = 2
    trousers = {1: np.argwhere(lab == 1), 2: np.argwhere(lab == 2)}
    fill = zone & ~blue & (a.max(axis=2) >= 35) & (a.max(axis=2) < 90) & (ys > b1 + 60)
    pieces, n = components(fill)
    for k in range(1, n + 1):
        m = pieces == k
        if m.sum() < 300: continue
        pts = np.argwhere(m)
        top = pts[pts[:, 0] <= pts[:, 0].min() + 10][::7]
        near = {leg: min(np.min(np.sum((tp - q) ** 2, axis=1)) for q in top) for leg, tp in trousers.items()}
        lab[m] = 1 if near[1] < near[2] else 2
    for _ in range(200):                                            # the outlines: grown from the trousers and boots
        todo = zone & (lab == 0)
        if not todo.any(): break
        nb = np.zeros_like(lab)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(lab, dy, 0), dx, 1)
            nb = np.where((nb == 0) & (sh > 0), sh, nb)
        lab = np.where(todo & (nb > 0), nb, lab)
    return {'near': lab == 1, 'far': lab == 2}, ink & ~(below & ~fist)

def to_segment(xs, ys, a, b):
    ab = b - a
    u = np.clip(((xs - a[0]) * ab[0] + (ys - a[1]) * ab[1]) / (ab @ ab), 0, 1)
    return np.hypot(xs - (a[0] + u * ab[0]), ys - (a[1] + u * ab[1]))

def angle(a, b):
    return math.atan2(b[1] - a[1], b[0] - a[0])

def layers(tier, sheet, n):
    """Cycle entry n's picture (the legs' blues exchanged for a minus) and,
    for each leg as seen (light, dark): its pixels, joints and whether it is
    in front; with a hidden far leg's thigh filled in its own blue (a tube
    round its bones, under the near leg), for when the near leg moves off it."""
    H, W = sheet.shape[:2]
    ch, cw = H // 2, W // 4
    r, c = divmod(abs(n) - 1, 4)
    cell = sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
    legs, upper = legs_of(drawing(cell, False)[0])
    rgb = drawing(cell, n < 0)[0]
    h, w = rgb.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    seen = {'light': 'near', 'dark': 'far'} if n > 0 else {'light': 'far', 'dark': 'near'}
    out = dict(rgb=rgb, upper=upper, legs=legs['near'] | legs['far'])
    for look, leg in seen.items():
        joints = {k: np.array(v, float) for k, v in TWEEN_JOINTS[tier][abs(n)][leg].items()}
        mask, img = legs[leg], rgb.copy()
        if leg == 'far':
            tube = (np.min([to_segment(xs, ys, joints[a], joints[b]) for a, b in BONES[:2]], axis=0) < 24) & legs['near']
            img[tube] = np.median(rgb[mask & (rgb.min(axis=2) > 60)], axis=0)
            mask = mask | tube
        out[look] = dict(rgb=img, mask=mask, joints=joints, front=(leg == 'near'))
    return out

def halfway(ja, jb):
    """The skeleton halfway: each bone's direction halfway, from the hip down."""
    out = {'hip': (ja['hip'] + jb['hip']) / 2}
    for a, b in BONES:
        aa = angle(ja[a], ja[b])
        th = aa + ((angle(jb[a], jb[b]) - aa + math.pi) % (2 * math.pi) - math.pi) / 2
        L = (np.linalg.norm(ja[b] - ja[a]) + np.linalg.norm(jb[b] - jb[a])) / 2
        out[b] = out[a] + L * np.array([math.cos(th), math.sin(th)])
    return out

def bent(rgb, mask, js, jd):
    """The leg (rgb where mask) bent from skeleton js to jd, smoothly (each
    pixel moved by its bones, the nearer ones weighing more: a cartoon
    knee, no cut); the pelvis just above the hips holds still, so the
    thigh's top stays under the belt. Premultiplied rgb and alpha; the
    outline's soft edge round the leg as opaque as it is dark."""
    h, w = mask.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    weights, src = [], []
    for a, b in BONES:
        weights.append(1.0 / (to_segment(xs, ys, jd[a], jd[b]) + 4.0) ** 4)
        th = angle(js[a], js[b]) - angle(jd[a], jd[b])
        c, s = math.cos(th), math.sin(th)
        dx, dy = xs - jd[a][0], ys - jd[a][1]
        src.append((js[a][0] + c * dx - s * dy, js[a][1] + s * dx + c * dy))
    weights.append(1.0 / (to_segment(xs, ys, js['hip'] + (-45.0, -10.0), js['hip'] + (45.0, -10.0)) + 4.0) ** 4)
    src.append((xs, ys))
    total = np.sum(weights, axis=0)
    sx = sum(k * p[0] for k, p in zip(weights, src)) / total
    sy = sum(k * p[1] for k, p in zip(weights, src)) / total
    ring = grown(mask, 2) & ~mask
    alpha = np.where(mask, 1.0, np.where(ring, 1 - rgb.min(axis=2) / 255.0, 0.0))
    layer = np.dstack([rgb * mask[..., None], alpha])
    x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
    fx, fy = (sx - x0)[..., None], (sy - y0)[..., None]
    at = lambda y, x: layer[np.clip(y, 0, h - 1), np.clip(x, 0, w - 1)]
    return (at(y0, x0) * (1 - fx) * (1 - fy) + at(y0, x0 + 1) * fx * (1 - fy)
            + at(y0 + 1, x0) * (1 - fx) * fy + at(y0 + 1, x0 + 1) * fx * fy)

def inbetween(tier, sheet, na, nb):
    """The drawing halfway between cycle entries na and nb: A's body and hips
    as drawn, each leg bent halfway to its pose in B, taken from the
    drawing that shows more of it; the leg in front as in both, or where
    they cross, as in B (the swinging leg comes in front)."""
    la, lb = layers(tier, sheet, na), layers(tier, sheet, nb)
    h, w = la['rgb'].shape[:2]
    ys = np.mgrid[0:h, 0:w][0]
    out = np.full((h, w, 3), 255.0)
    pelvis = la['legs'] & (ys <= PELVIS)
    out[pelvis] = la['rgb'][pelvis]
    front = 'light' if (lb if la['light']['front'] != lb['light']['front'] else la)['light']['front'] else 'dark'
    for look in [v for v in ('light', 'dark') if v != front] + [front]:
        other = 'dark' if look == 'light' else 'light'
        shown = lambda l: (l[look]['mask'] & ~(l[other]['mask'] if not l[look]['front'] else False)).sum()
        src = la if shown(la) >= shown(lb) else lb
        leg = bent(src[look]['rgb'], src[look]['mask'], src[look]['joints'], halfway(la[look]['joints'], lb[look]['joints']))
        out = leg[..., :3] + out * (1 - leg[..., 3:4])
    out[la['upper']] = la['rgb'][la['upper']]
    return out

def make(tier):
    sheet = np.asarray(Image.open(os.path.join(DIR, 'walk-lvl%s-source.webp' % tier)).convert('RGB'))
    H, W = sheet.shape[:2]
    ch, cw = H // 2, W // 4
    ref = np.asarray(Image.open(os.path.join(DIR, 'lvl%s.png' % tier)).convert('RGBA')).astype(int)
    rys, rxs = np.nonzero(ref[..., 3] > 128)
    rb0, rb1, ryellow = belt_rows(ref[..., :3] * (ref[..., 3:] > 128))
    rbx = np.nonzero(ryellow[rb0:rb1 + 1].any(axis=0))[0]
    ref_belt = (rbx[0] + rbx[-1]) / 2.0
    frames, belts, tops, grounds = [], [], [], []
    entries = CYCLES[tier]
    for i, n in enumerate(entries):
        r, c = divmod(abs(n) - 1, 4)
        rgb, belt = drawing(sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw], n < 0)
        rgba = transparent(rgb)
        frames.append(rgba); belts.append(belt)
        ys = np.nonzero(rgba[..., 3] > 128)[0]
        tops.append(ys.min()); grounds.append(ys.max())
    drawn = list(frames)
    if tier in TWEEN_JOINTS:                                        # and one of mine after each
        frames = []
        for i, n in enumerate(entries):
            frames += [drawn[i], transparent(inbetween(tier, sheet, n, entries[(i + 1) % len(entries)]))]
    top, ground, belt = np.median(tops), np.median(grounds), np.median(belts)
    s = (GROUND - rys.min()) / float(ground - top)                    # as tall as the outfit
    ox, oy = ref_belt - belt * s, GROUND - ground * s
    scaled = []
    for rgba in frames:
        lit = parts.amber(rgba.astype(float))
        im = Image.fromarray(lit.astype(np.uint8), 'RGBA').convert('RGBa')
        scaled.append(im.resize((round(cw * s), round(ch * s)), Image.LANCZOS).convert('RGBA'))
    # Walking, he's wider than the parts' frame (his fists): his own frame,
    # from `left` (px of the 308 frame) and `width` wide, as high.
    cols = np.nonzero(np.any([np.asarray(im)[..., 3].max(axis=0) > 0 for im in scaled], axis=0))[0]
    left = min(0, int(np.floor(ox + cols[0])) - 2)
    width = max(FW, int(np.ceil(ox + cols[-1])) + 3) - left
    strip = Image.new('RGBA', (width * len(frames), FH), (0, 0, 0, 0))
    for i, im in enumerate(scaled):
        strip.alpha_composite(im, (i * width + int(round(ox - left)), int(round(oy))))
    out = os.path.join(DIR, 'walk-lvl%s.png' % tier)
    strip.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(out, optimize=True)   # amber: 256 colours are plenty
    # Where the belt's middle lands (px of the parts' frame), for a frame that
    # borrows these drawings (tools/vaultboy-moves.py BORROW): the widest band
    # of the bright amber between the chest and the hips.
    lit = np.asarray(strip).astype(int)
    middles = []
    for i in range(len(frames)):
        f = lit[:, i * width:(i + 1) * width]
        bright = (f[..., 3] > 200) & (f[..., 0] > 200) & (f[..., 1] > 120)
        row = max(range(200, 300), key=lambda y: bright[y].sum())
        xs = np.nonzero(bright[row])[0]
        middles.append(left + (xs.min() + xs.max()) / 2.0)
    belt_x = float(np.median(middles))
    # How far between drawings (measured in the drawings, then in px of the 420 frame).
    # Measured on Gemini's drawings (the boot that stays down); an
    # in-between is halfway.
    on_ground = [boots(rgba) for rgba in drawn]
    advance = [s * (toe(on_ground[i], here, belt) - toe(on_ground[(i + 1) % len(drawn)], there, belt))
               for i, (here, there) in enumerate(PLANTED)]
    cycle, n = sum(advance), len(advance)
    held = np.concatenate([[0], np.cumsum(advance)])
    even = np.arange(n + 1) * cycle / n
    at = even + PLANT * (held - even)
    slip = np.abs(at - held).max()
    position = np.interp(np.arange(len(frames) + 1) * n / len(frames), np.arange(n + 1), at)
    print('wrote %s (%d frames, x%.3f, each %dx%d from x %d of the parts\' frame)' % (os.path.relpath(out, ROOT), len(frames), s, width, FH, left))
    print('  the boot on the ground moves back (px of 420):', [round(float(a), 1) for a in advance], '= %.1f for two steps' % cycle)
    print('  where he is at each frame:', [round(float(p), 1) for p in position], '| the boot slips at most %.1f px of 420' % slip)
    assert cycle > 0 and all(b > a for a, b in zip(position, position[1:])), 'always forward'
    return dict(frames=len(frames), left=left, width=width, belt=round(belt_x, 1), advance=[round(float(a), 2) for a in np.diff(position)],
                position=[round(float(p), 2) for p in position])

if __name__ == '__main__':
    data = {tier: make(tier) for tier in sorted(CYCLES)}
    with open(os.path.join(ROOT, 'tools', 'vaultboy-walk.json'), 'w') as f:
        json.dump(data, f, indent=1)
        f.write('\n')
    print('wrote tools/vaultboy-walk.json')
