"""
Makes the Vault Boy's drawn walk for an outfit, images/vaultboy/walk-lvlXX.png
(8 drawings side by side, in the parts' amber, facing left as drawn there,
each as high as the parts' 308x420 frame and as wide as his back fist needs:
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
(above the belt). Then: the white background made transparent, turned to face
left, the outfits' amber (tools/vaultboy-parts.py amber()), scaled to the
outfit's height (the head to the boots as in lvl05.png) and placed with the
boots on the same ground (411 of 420) and the belt over the outfit's belt.

How far he goes: between two drawings, the boot that stays on the ground in
both moves back under him by some pixels; the body would go forward by as
many for that boot to stay put. Which boot that is follows from the cycle:
the near one from contact to the other leg's contact, then the far one; it's
found among the boots on the ground (dark shapes at most 13px above the
lowest: the far boot stands a little higher), the front one, the one under
him or the back one, its toe (his front: the left end) the point that stays.
Gemini's drawings don't space those evenly (its "down" has the boots where
"contact" has them, its "up" where the next contact has them), so a boot
held exactly would make the body lurch: where he is at each drawing is taken
PLANT of the way from an even pace to the boot held exactly (the boot slips
a little, the body goes on a little unevenly). He moves when the drawing
changes, as in a flip book.

After a change: python tools/vaultboy-walk.py (Python 3 with Pillow and numpy),
then python tools/vaultboy-moves.py, then node --test.
"""
import importlib.util
import json
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

def boots(rgba):
    """The boots on the ground, left to right: (left end, right end) of each
    dark shape near the bottom at most 13px above the lowest one."""
    dark = (rgba[..., 3] > 128) & (rgba[..., :3].max(axis=2) < 70)
    bottom = np.nonzero(rgba[..., 3] > 128)[0].max()
    dark[:bottom - 75] = False
    seen, found = np.zeros_like(dark), []
    for y0, x0 in zip(*np.nonzero(dark)):
        if seen[y0, x0]: continue
        todo, pts = deque([(y0, x0)]), []
        seen[y0, x0] = True
        while todo:
            y, x = todo.popleft(); pts.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < dark.shape[0] and 0 <= xx < dark.shape[1] and dark[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; todo.append((yy, xx))
        p = np.array(pts)
        if len(p) > 400 and bottom - p[:, 0].max() <= 13:
            found.append((int(p[:, 1].min()), int(p[:, 1].max())))
    return sorted(found)

def toe(found, where, middle):
    if where == 'front': b = found[0]
    elif where == 'back': b = found[-1]
    else: b = min(found, key=lambda g: abs((g[0] + g[1]) / 2.0 - middle))
    return b[0]

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
    for n in CYCLES[tier]:
        r, c = divmod(abs(n) - 1, 4)
        rgb, belt = drawing(sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw], n < 0)
        rgba = transparent(rgb)[:, ::-1]                             # facing left, like the parts
        frames.append(rgba); belts.append(cw - 1 - belt)
        ys = np.nonzero(rgba[..., 3] > 128)[0]
        tops.append(ys.min()); grounds.append(ys.max())
    top, ground, belt = np.median(tops), np.median(grounds), np.median(belts)
    s = (GROUND - rys.min()) / float(ground - top)                    # as tall as the outfit
    ox, oy = ref_belt - belt * s, GROUND - ground * s
    scaled = []
    for rgba in frames:
        lit = parts.amber(rgba.astype(float))
        im = Image.fromarray(lit.astype(np.uint8), 'RGBA').convert('RGBa')
        scaled.append(im.resize((round(cw * s), round(ch * s)), Image.LANCZOS).convert('RGBA'))
    # Walking, he's wider than the parts' frame (his back fist): his own frame,
    # from `left` (px of the 308 frame) and `width` wide, as high.
    cols = np.nonzero(np.any([np.asarray(im)[..., 3].max(axis=0) > 0 for im in scaled], axis=0))[0]
    left = min(0, int(np.floor(ox + cols[0])) - 2)
    width = max(FW, int(np.ceil(ox + cols[-1])) + 3) - left
    strip = Image.new('RGBA', (width * len(frames), FH), (0, 0, 0, 0))
    for i, im in enumerate(scaled):
        strip.alpha_composite(im, (i * width + int(round(ox - left)), int(round(oy))))
    out = os.path.join(DIR, 'walk-lvl%s.png' % tier)
    strip.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(out, optimize=True)   # amber: 256 colours are plenty
    # How far between drawings (measured in the drawings, then in px of the 420 frame).
    on_ground = [boots(rgba) for rgba in frames]
    advance = [s * (toe(on_ground[(i + 1) % len(frames)], there, belt) - toe(on_ground[i], here, belt))
               for i, (here, there) in enumerate(PLANTED)]
    cycle, n = sum(advance), len(advance)
    held = np.concatenate([[0], np.cumsum(advance)])
    even = np.arange(n + 1) * cycle / n
    position = even + PLANT * (held - even)
    slip = np.abs(position - held).max()
    print('wrote %s (%d drawings, x%.3f, each %dx%d from x %d of the parts\' frame)' % (os.path.relpath(out, ROOT), n, s, width, FH, left))
    print('  the boot on the ground moves back (px of 420):', [round(float(a), 1) for a in advance], '= %.1f for two steps' % cycle)
    print('  where he is at each drawing:', [round(float(p), 1) for p in position], '| the boot slips at most %.1f px of 420' % slip)
    assert cycle > 0 and all(b > a for a, b in zip(position, position[1:])), 'always forward'
    return dict(frames=n, left=left, width=width, advance=[round(float(a), 2) for a in advance], position=[round(float(p), 2) for p in position])

if __name__ == '__main__':
    data = {tier: make(tier) for tier in sorted(CYCLES)}
    with open(os.path.join(ROOT, 'tools', 'vaultboy-walk.json'), 'w') as f:
        json.dump(data, f, indent=1)
        f.write('\n')
    print('wrote tools/vaultboy-walk.json')
