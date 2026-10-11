"""
Makes the Vault Boy's walking parts for an outfit (images/vaultboy/walk-lvlXX.png)
from one side-view walking drawing, so the walk can be animated smoothly, his
boots exactly planted (tools/vaultboy-moves.py), the way the standing parts are
(tools/vaultboy-parts.py), but turned the way he walks.

The drawing: one cell of a sheet of walk poses the owner made with Gemini
(images/vaultboy/walk-lvlXX-source.webp, 2 rows of 4 on white, facing right):
a contact pose, legs apart and arms away from the body (SOURCE). Turned to
face left (as the standing parts), the jacket's colour evened (some cells
came greyer), the white made transparent, and cut into 7 parts, back to
front: the far arm, the far boot, the far leg, the near boot, the near leg,
the torso (head, jacket, belt and the hips, which cover the legs' tops), the
near arm. The legs stay straight (a knee cut shows); each turns at its hip
and is shortened a little while it swings, its boot turns at the ankle so it
stays flat on the gauge, the arms at the shoulders. Where a part would show
what the drawing hides when it turns, it carries a fill that the parts above
cover when he stands as drawn (so put back together they are the drawing,
checked): the legs' tops as balls under the hips, the far leg under the near
one, the jacket and belt under the near arm, the far arm's shoulder under the
torso, the boots' tops under the trousers, and every part's edge a few pixels
under its neighbours (no seam when they turn).

Then the outfits' amber (tools/vaultboy-parts.py amber()), scaled to the
outfit's height (the head to the boots as in lvl05.png) with the boots on the
ground (411 of 420) and the belt over the outfit's belt, so the walking parts
and the standing ones match; each part a cell as high as the 420 frame and as
wide as he needs. tools/vaultboy-walk.json: the frame, the joints, each
boot's shape (laid flat), the lanes, for tools/vaultboy-moves.py.

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
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DIR = os.path.join(ROOT, 'images', 'vaultboy')
sys.dont_write_bytecode = True                                      # no tools/__pycache__
spec = importlib.util.spec_from_file_location('vaultboy_parts', os.path.join(ROOT, 'tools', 'vaultboy-parts.py'))
parts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parts)                                      # its amber; it cuts nothing when imported

FH = 420                             # the frame's height, as the parts sheets
GROUND = 411                         # where his front boot stands in it (tools/vaultboy-moves.py RIGS)
SOURCE = {'05': 8}                   # the sheet's cell (row by row) to cut, for each outfit with a walk
PARTS = ['armF', 'bootF', 'legF', 'bootN', 'legN', 'torso', 'armN']   # back to front
# In the drawing (facing left, 500x558 cells): the joints, and the cut.
JOINTS = dict(hipN=(240, 366), ankleN=(197, 494), hipF=(266, 368), ankleF=(322, 481), shoulderN=(196, 226), shoulderF=(296, 226))
ARM_N = [(55, 262), (55, 365), (140, 365), (172, 318), (186, 300), (194, 298), (194, 232), (186, 212), (168, 214), (140, 232), (100, 262)]
ARM_F = ([184, 252, 285, 292, 600], [295, 305, 305, 322, 322])     # the far arm: right of this line (x at those y; not the belt's end)
HIPS = [(190, 336), (204, 384), (228, 393), (258, 396), (284, 389), (300, 372), (306, 338), (306, 300), (190, 300)]
SEEDS = dict(legN=(215, 450), legF=(300, 450), bootN=(180, 512), bootF=(318, 498))
UNDER_ARM = [(172, 200), (204, 196), (204, 318), (194, 334), (184, 304)]   # the jacket hidden by the near arm
BRIGHT, SLATE, BOOT, JACKET, BELT, INK = [74, 116, 166], [72, 90, 106], [52, 52, 52], [74, 116, 166], [241, 221, 130], [10, 10, 10]

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

def drawing(cell):
    """The drawing with a greyer jacket made the same blue as the rest (Gemini's slip)."""
    a = cell.astype(float)
    ys = np.mgrid[0:a.shape[0], 0:a.shape[1]][0]
    b0, b1, yellow = belt_rows(a)
    blue = a[blues(a, ys >= 0)[0]].mean(axis=0)
    jacket_grey = blues(a, ys < b0)[1]
    if jacket_grey.sum() > 2000:
        a[jacket_grey] += blue - a[jacket_grey].mean(axis=0)
    bx = np.nonzero(yellow[b0:b1 + 1].any(axis=0))[0]
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

def cut(src):
    """The 7 parts (RGBA, the drawing's size), back to front, and how each was cut."""
    H, W = src.shape[:2]
    ys, xs = np.mgrid[0:H, 0:W]
    solid = src[..., 3] > 0
    poly = lambda pts: np.asarray(_polygon(pts, W, H)) > 0
    disc = lambda c, r: (xs - c[0]) ** 2 + (ys - c[1]) ** 2 <= r * r
    ring = lambda c, r, w=3: disc(c, r) & ~disc(c, r - w)
    def line(p, q, width):
        m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).line([p, q], fill=255, width=width); return np.asarray(m) > 0
    def component(mask, seed):
        seen = np.zeros_like(mask); todo = deque([seed]); seen[seed[1], seed[0]] = True
        while todo:
            x, y = todo.popleft()
            for xx, yy in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= xx < W and 0 <= yy < H and mask[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; todo.append((xx, yy))
        return seen
    def grow(lab, into, order, steps):
        for _ in range(steps):
            for l in order:
                m = lab == l
                nb = np.zeros_like(m)
                nb[1:] |= m[:-1]; nb[:-1] |= m[1:]; nb[:, 1:] |= m[:, :-1]; nb[:, :-1] |= m[:, 1:]
                lab[(lab == 0) & into & nb] = l
        return lab
    rgbmax = src[..., :3].max(axis=2)
    gray = solid & (rgbmax >= 40) & (rgbmax <= 75) & (np.abs(src[..., 0] - src[..., 2]) < 10)
    armN = poly(ARM_N) & solid
    armF = solid & (xs > np.interp(ys, *ARM_F)) & (ys < 372) & (ys > 175)
    legs = solid & ~armN & ~armF & (ys > 330) & ~poly(HIPS)
    lab = np.zeros((H, W), np.int32)                               # 1 near leg, 2 far leg, 3 near boot, 4 far boot
    inside = legs & (rgbmax > 75)                                  # the legs' areas between their outlines
    lab[component(inside, SEEDS['legN'])] = 1; lab[component(inside, SEEDS['legF'])] = 2
    lab[component(gray, SEEDS['bootN'])] = 3; lab[component(gray, SEEDS['bootF'])] = 4
    lab = grow(lab, legs, [3, 4], 4)                               # the boots' outlines, then the legs'
    lab = grow(lab, legs, [1, 2], 40)
    lab = grow(lab, legs, [3, 4, 1, 2], 40)
    masks = dict(armF=armF, bootF=lab == 4, legF=lab == 2, bootN=lab == 3, legN=lab == 1,
                 torso=solid & ~armN & ~armF & (lab == 0), armN=armN)
    def above(name):
        m = np.zeros((H, W), bool)
        for n in PARTS[PARTS.index(name) + 1:]: m |= masks[n]
        return m
    def part(name, fills=(), seam=4):
        out = np.zeros((H, W, 4), np.uint8)
        hidden = above(name) & ~masks[name]
        out[masks[name]] = src[masks[name]].astype(np.uint8)
        for _ in range(seam):                                      # its edge, under the parts above
            a = out[..., 3] > 0
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                take = hidden & ~a & np.roll(np.roll(a, dy, 0), dx, 1) & (out[..., 3] == 0)
                out[take] = np.roll(np.roll(out, dy, 0), dx, 1)[take]
        for region, rgb in fills:
            out[region & hidden & (out[..., 3] == 0)] = rgb + [255]
        return out
    J = JOINTS
    ax = np.array(J['ankleF'], float) - J['hipF']; ax /= np.linalg.norm(ax); n = np.array([-ax[1], ax[0]])
    top, bot = np.array(J['hipF'], float), np.array(J['hipF'], float) + ax * 60
    edge = lambda sgn: line(tuple(top + sgn * 25 * n), tuple(bot + sgn * 25 * n), 4)
    tube = poly([tuple(top + 25 * n), tuple(bot + 25 * n), tuple(bot - 25 * n), tuple(top - 25 * n)])
    under = poly(UNDER_ARM); belt = poly([(150, 298), (210, 298), (210, 340), (150, 340)])
    out = dict(
        armF=part('armF', [(ring(J['shoulderF'], 30), INK), (disc(J['shoulderF'], 30), JACKET)]),
        bootF=part('bootF', [(disc(J['ankleF'], 16), BOOT)]),
        legF=part('legF', [(ring(J['hipF'], 26), INK), (disc(J['hipF'], 26), SLATE), (edge(1), INK), (edge(-1), INK), (tube, SLATE)]),
        bootN=part('bootN', [(disc(J['ankleN'], 18), BOOT)]),
        legN=part('legN', [(ring(J['hipN'], 36), INK), (disc(J['hipN'], 36), BRIGHT)]),
        torso=part('torso', [(line((176, 205), (184, 305), 4), INK), (line((184, 305), (196, 334), 4), INK),
                             (line((184, 300), (204, 300), 3), INK), (under & belt, BELT), (under, JACKET)]),
        armN=part('armN'))
    return [out[nm] for nm in PARTS], masks

def _polygon(pts, W, H):
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(pts, fill=255); return m

def rotp(p, c, deg):                     # CSS rotate: clockwise on screen
    a = math.radians(deg); d = np.asarray(p, float) - c
    return c + np.stack([d[..., 0] * math.cos(a) - d[..., 1] * math.sin(a), d[..., 0] * math.sin(a) + d[..., 1] * math.cos(a)], -1)

def tilt(mask):
    """The angle of a boot's sole (positive: heel up, its toe on the left lower):
    a line through its lowest point in each column, over the sole's middle
    (not the rounded toe and heel)."""
    ys, xs = np.nonzero(mask)
    cols = np.arange(xs.min(), xs.max() + 1)
    bottom = np.array([ys[xs == x].max() for x in cols], float)
    keep = slice(int(len(cols) * 0.2), int(len(cols) * 0.8))
    slope = np.polyfit(cols[keep], bottom[keep], 1)[0]             # y down: heel up = y falling to the right
    return math.degrees(math.atan(-slope))

def make(tier):
    sheet = np.asarray(Image.open(os.path.join(DIR, 'walk-lvl%s-source.webp' % tier)).convert('RGB'))
    H, W = sheet.shape[:2]
    ch, cw = H // 2, W // 4
    r, c = divmod(SOURCE[tier] - 1, 4)
    rgb, belt = drawing(sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw])
    src = transparent(rgb)[:, ::-1].astype(np.int32)                # facing left, like the standing parts
    belt = cw - 1 - belt
    cells, masks = cut(src)
    rest = np.zeros_like(cells[0]).astype(np.float64)
    whole = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    for cell in cells: whole.alpha_composite(Image.fromarray(cell, 'RGBA'))
    whole = np.asarray(whole).astype(int)
    off = np.where((whole[..., 3] == 0) & (src[..., 3] == 0), 0, np.abs(whole - src).max(axis=2))
    assert off.max() == 0, 'put back together, the parts are the drawing'
    # scale and place: as tall as the outfit, boots on the ground, belt over its belt
    ref = np.asarray(Image.open(os.path.join(DIR, 'lvl%s.png' % tier)).convert('RGBA')).astype(int)
    rys = np.nonzero(ref[..., 3] > 128)[0]
    rb0, rb1, ryellow = belt_rows(ref[..., :3] * (ref[..., 3:] > 128))
    rbx = np.nonzero(ryellow[rb0:rb1 + 1].any(axis=0))[0]
    ys = np.nonzero(src[..., 3] > 0)[0]
    s = (GROUND - rys.min()) / float(ys.max() - ys.min())
    ox, oy = (rbx[0] + rbx[-1]) / 2.0 - belt * s, GROUND - ys.max() * s
    scaled = []
    for cell in cells:
        lit = parts.amber(cell.astype(float))
        im = Image.fromarray(lit.astype(np.uint8), 'RGBA').convert('RGBa')
        scaled.append(im.resize((round(cw * s), round(ch * s)), Image.LANCZOS).convert('RGBA'))
    cols = np.nonzero(np.any([np.asarray(im)[..., 3].max(axis=0) > 0 for im in scaled], axis=0))[0]
    left = min(0, int(np.floor(ox + cols[0])) - 2)
    width = max(308, int(np.ceil(ox + cols[-1])) + 3) - left
    dx, dy = int(round(ox - left)), int(round(oy))
    strip = Image.new('RGBA', (width * len(cells), FH), (0, 0, 0, 0))
    for i, im in enumerate(scaled):
        strip.alpha_composite(im, (i * width + dx, dy))
    out = os.path.join(DIR, 'walk-lvl%s.png' % tier)
    strip.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(out, optimize=True)   # amber: 256 colours are plenty
    at = lambda p: [round(p[0] * s + dx, 2), round(p[1] * s + dy, 2)]   # drawing -> frame
    # each boot laid flat: how high its ankle stands, how far ahead its toe (the point it rolls on) is
    tau = {'N': 0.0, 'F': tilt(masks['bootF']) - tilt(masks['bootN'])}  # how far heel-up each is drawn
    foot, lane = {}, {}
    for side in 'NF':
        yy, xx = np.nonzero(masks['boot' + side]); pts = np.stack([xx, yy], 1).astype(float)
        flat = rotp(pts, np.array(JOINTS['ankle' + side], float), tau[side])
        sole = flat[:, 1].max(); low = flat[flat[:, 1] > sole - 3]
        foot[side] = dict(up=round((sole - JOINTS['ankle' + side][1]) * s, 2),
                          toe=round((JOINTS['ankle' + side][0] - (low[:, 0].min() + 12)) * s, 2))
        lane[side] = round(float(yy.max()) * s + dy, 2)
    print('wrote %s (%d parts, x%.3f, %dx%d from x %d of the standing frame) | boots %s, far one drawn %.1f deg heel-up'
          % (os.path.relpath(out, ROOT), len(cells), s, width, FH, left, foot, tau['F']))
    return dict(left=left, width=width, parts=PARTS, joints={k: at(v) for k, v in JOINTS.items()},
                foot=foot, lane=lane, tau={k: round(v, 2) for k, v in tau.items()})

if __name__ == '__main__':
    data = {tier: make(tier) for tier in sorted(SOURCE)}
    with open(os.path.join(ROOT, 'tools', 'vaultboy-walk.json'), 'w') as f:
        json.dump(data, f, indent=1)
        f.write('\n')
    print('wrote tools/vaultboy-walk.json')
