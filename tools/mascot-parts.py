"""
Cuts the mascot picture (images/mascot.png) into the parts that
css/terminal.css animates, like Vault Boy in a Fallout 4 Pip-Boy: each part
turns around its own joint. Writes images/mascot-parts.png, one row of cells
of the same size as the picture, in drawing order:

  0 back leg (his left), hip to knee   1 its lower leg and boot
  2 front leg (his right), hip to knee   3 its lower leg and boot
  4 thumb arm   5 body (with the fist on the hip)   6 head
  7 head with the eyes closed

A lower leg is drawn inside its upper leg's layer, so it turns with the hip
and bends again at the knee.

Every cell lines up with the picture, so the CSS stacks them as full-size
layers; laid on top of each other at rest they give back the picture exactly.
A part that turns tucks under the one in front of it: the arm carries a
little more of itself under the body, the body a little shadow under the
chin, and each upper leg a round end at the hip under the body (the seat)
and at the knee under its lower leg, so turning or bending never shows a
hole or a square corner.

The picture can be any whole multiple of 144x204 (it is 288x408: upscaled
2026-09-28, so he stays sharp on a phone); every position below is given in
units of the 144x204 picture and scaled to the real one.

Only for a new picture (same pose): python tools/mascot-parts.py
Needs Python 3 with Pillow and numpy (pip install pillow numpy). The joints
below must match the transform-origin values of the .mp-* rules in the CSS.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'images', 'mascot.png')
OUT = os.path.join(ROOT, 'images', 'mascot-parts.png')

im = np.array(Image.open(SRC).convert('RGBA')).astype(np.int32)
H, W, _ = im.shape
K = W / 144.0                                   # pixels per unit of the 144x204 picture
assert W % 144 == 0 and H == 204 * W // 144, 'the picture must be a whole multiple of 144x204'
ys, xs = np.mgrid[0:H, 0:W] / K                 # every pixel's place, in units
opaque = im[:, :, 3] > 0

def without_slivers(mask, r, below, ys):
    """The mask without its thin bits (narrower than 2r+1 pixels) below y =
    `below`: erosion then dilation. Slivers of the shoulder line caught at
    the edge of the head stay with the body, so a turning head never drags
    a hard cut edge over the background."""
    def spread(m, keep):
        out = m.copy()
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                shifted = np.roll(np.roll(m, dy, 0), dx, 1)
                out = (out & shifted) if keep else (out | shifted)
        return out
    thick = spread(spread(mask, True), False)
    return mask & (thick | (ys < below))

# The joint each part turns around, in units. css/terminal.css gives them as
# transform-origin percentages (x / 144, y / 204) on the .mp-* rules; this
# script prints them.
JOINTS = {'mp-head': (81, 90), 'mp-arm': (62, 95), 'mp-leg-front': (70, 143), 'mp-leg-back': (94, 143),
          'mp-shin-front': (65.5, 164.3), 'mp-shin-back': (93.3, 164)}

# ---------- where each part is (picture pixels) ----------
# The head: above the collar. The line follows the shoulders, dips under
# the beard and leaves the two collar flaps to the body; on the right it
# climbs the beard's outline, so the shoulder's first pixels stay with the
# body when the head turns.
def head_bottom(x):
    points = [(0, 85), (66, 84), (70, 84), (74, 89), (76, 91), (86, 91), (88, 87), (90, 83.5), (92, 80.5), (96, 80), (144, 80)]
    return np.interp(x, [p[0] for p in points], [p[1] for p in points])
head = opaque & (xs >= 56) & (xs < 111) & (ys < head_bottom(xs))
head = without_slivers(head, max(1, int(round(K))), 70, ys)
# The thumb arm: left of the body's edge (x = 60). Under the armpit (y >= 100)
# the two columns at the edge are the body's own outline.
ARM_EDGE = 60
arm = opaque & ~head & (((xs < ARM_EDGE + 1) & (ys < 100)) | ((xs < ARM_EDGE - 1) & (ys < 112)))
# The legs: from just under the belt (and under the fist on the hip) down,
# split along the crease between them; the trousers right under the belt go
# with the legs, so a turning hip shows its round seat, not a fixed band.
LEGS_TOP = [(0, 135.5), (60, 135.5), (62, 135), (68, 138), (74, 139.5), (82, 139.5), (90, 138), (96, 136),
            (100, 134), (102, 132.5), (104, 135), (144, 136)]
def split(y):
    return np.interp(y, [146, 158], [83, 81])
legs = opaque & ~head & ~arm & (ys >= np.interp(xs, *zip(*LEGS_TOP)))
# The belt's bottom outline stays with the body: a thin dark run at the top
# of a leg's column (not a leg's own outline, which runs on down).
lum = 0.299 * im[:, :, 0] + 0.587 * im[:, :, 1] + 0.114 * im[:, :, 2]
for x in range(W):
    rows = np.nonzero(legs[:, x])[0]
    if len(rows):
        run = 0
        while run < 5 and rows[0] + run < H and lum[rows[0] + run, x] < 60:
            run += 1
        if 0 < run < 5:
            legs[rows[0]:rows[0] + run, x] = False
front_leg = legs & (xs < split(ys))          # his right leg, on the left of the picture
back_leg = legs & ~front_leg
# Above the hip joint, what a leg has outside the circle it turns in (round
# the joint, out to the leg's edge on each side) stays with the body: the
# hip's outline holds still and the leg turns under it, its top never poking
# out as a corner.
def hip_slivers(leg, name):
    hip, knee = np.array(JOINTS[name], float), np.array(JOINTS[name.replace('leg', 'shin')], float)
    u = (knee - hip) / np.hypot(*(knee - hip))
    across = np.array([-u[1], u[0]])
    along, side = (xs - hip[0]) * u[0] + (ys - hip[1]) * u[1], (xs - hip[0]) * across[0] + (ys - hip[1]) * across[1]
    band = leg & (along >= 0) & (along < 1.5)
    edge = lambda v: v.max() if v.size else np.inf             # none there: the leg starts lower on that side
    far = np.where(side > 0, edge(side[band & (side > 0)]), edge(-side[band & (side < 0)]))
    return leg & (along < 0) & (np.hypot(along, side) > far)
front_leg &= ~hip_slivers(front_leg, 'mp-leg-front')
back_leg &= ~hip_slivers(back_leg, 'mp-leg-back')
legs = front_leg | back_leg
body = opaque & ~head & ~arm & ~legs
# The knees: halfway down, each leg is cut across, square to the line from
# the hip; the knee joint is the middle of that cut.
def leg_axis(shin):
    hip, knee = np.array(JOINTS[shin.replace('shin', 'leg')], float), np.array(JOINTS[shin], float)
    return knee, (knee - hip) / np.hypot(*(knee - hip))
def below_knee(shin):
    knee, u = leg_axis(shin)
    return (xs - knee[0]) * u[0] + (ys - knee[1]) * u[1] > 0
front_shin = front_leg & below_knee('mp-shin-front')
back_shin = back_leg & below_knee('mp-shin-back')
front_thigh, back_thigh = front_leg & ~front_shin, back_leg & ~back_shin

def layer(mask):
    out = np.zeros_like(im)
    out[mask] = im[mask]
    return out

# ---------- what each part carries under the one in front ----------
# Only where the part in front is fully opaque, so nothing shows at rest.
def extend_right(cell, x_to, hidden):
    """The arm goes on under the body: each row's last pixel, repeated."""
    x_to = int(round(x_to * K))
    for y in range(H):
        filled = np.nonzero(cell[y, :x_to, 3])[0]
        if not len(filled):
            continue
        last = filled[-1]
        for x in range(last + 1, x_to + 1):
            if hidden[y, x] and cell[y, x, 3] == 0:
                cell[y, x] = cell[y, last]

def round_end(cell, part, joint, u, end, hidden):
    """A round end where a leg's part turns, so that turning shows a curve
    (the seat, the knee), never a square corner: past the line across the
    leg at the joint (end -1: towards the hip, +1: towards the boot), the
    part's own cross-section just inside it, swept round the joint, each
    side as far as its edge (outline and shading included); where the part
    stops short of that line, straight on up to it first. Only where the
    part in front hides it at rest."""
    across = np.array([-u[1], u[0]])
    vx, vy = xs - joint[0], ys - joint[1]
    along, side = vx * u[0] + vy * u[1], vx * across[0] + vy * across[1]
    gap = max(0.0, (-end * along[part & (np.abs(side) < 3)]).min())   # how far short of the line it stops
    todo = hidden & (cell[:, :, 3] == 0) & (end * along > -gap)
    rho = np.hypot(side[todo], np.maximum(end * along[todo], 0))
    sign = np.where(side[todo] < 0, -1.0, 1.0)
    depth = gap + 3.0 / K                                         # 3 pixels inside the part
    sx = (joint[0] + sign * rho * across[0] - end * depth * u[0]) * K
    sy = (joint[1] + sign * rho * across[1] - end * depth * u[1]) * K
    src = layer(part).astype(float)
    src[:, :, :3] *= src[:, :, 3:4] / 255.0                         # premultiplied, to blend neighbours
    x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
    fx, fy = (sx - x0)[:, None], (sy - y0)[:, None]
    at = lambda y, x: src[np.clip(y, 0, H - 1), np.clip(x, 0, W - 1)]
    px = (at(y0, x0) * (1 - fx) * (1 - fy) + at(y0, x0 + 1) * fx * (1 - fy)
          + at(y0 + 1, x0) * (1 - fx) * fy + at(y0 + 1, x0 + 1) * fx * fy)
    a = px[:, 3:4]
    px[:, :3] = np.where(a > 0, px[:, :3] * 255.0 / np.maximum(a, 1e-9), 0)
    cell[todo] = px.round().astype(np.int32)

def shadow_under(cell, region):
    """Under the bottom of the head, between the collar flaps: a plain dark
    shadow, hidden at rest; when the head turns a little, that's what a
    sliver of it shows (never a patch above the shoulders)."""
    dark = im[body][:, :3]
    dark = np.median(dark[dark.sum(1) < dark.sum(1).min() + 60], axis=0)
    todo = region & (cell[:, :, 3] == 0)
    cell[todo, :3] = dark.round().astype(np.int32)
    cell[todo, 3] = 255

solid = im[:, :, 3] == 255
arm_cell = layer(arm)
extend_right(arm_cell, ARM_EDGE + 9, body & solid)
front_cell, back_cell = layer(front_thigh), layer(back_thigh)
for cell, thigh, shin, name in ((front_cell, front_thigh, front_shin, 'mp-shin-front'), (back_cell, back_thigh, back_shin, 'mp-shin-back')):
    knee, u = leg_axis(name)
    round_end(cell, thigh, np.array(JOINTS[name.replace('shin', 'leg')], float), u, -1, body & solid)   # the seat, under the body
    round_end(cell, thigh, knee, u, 1, shin & solid)                                                    # the knee, under the shin
front_shin_cell, back_shin_cell = layer(front_shin), layer(back_shin)
body_cell = layer(body)
shadow_under(body_cell, head & solid & (ys >= head_bottom(xs) - 3) & (xs >= 66) & (xs < 92))
head_cell = layer(head)

# ---------- the blink: the same head, eyes shut ----------
def shut_eye(cell, x0, x1, y0, y1, lid_y, skin_at):
    px = lambda v: int(round(v * K))
    skin = cell[px(skin_at[1]), px(skin_at[0])].copy()
    line = np.array([58, 30, 10, 255])
    thick = max(1, int(round(K)))
    for x in range(px(x0), px(x1 + 1)):
        for y in range(px(y0), px(y1 + 1)):
            cell[y, x] = skin
        t = (x - px(x0)) / max(1, px(x1 + 1) - 1 - px(x0))
        y = int(round((lid_y + 1.2 * (1 - (2 * t - 1) ** 2)) * K))   # a small curve, like a closed lid
        cell[y:y + thick, x] = line
blink_cell = head_cell.copy()
shut_eye(blink_cell, 64, 72, 55, 60, 57, (68, 62))
shut_eye(blink_cell, 80, 90, 55, 61, 58, (85, 63))

cells = [back_cell, back_shin_cell, front_cell, front_shin_cell, arm_cell, body_cell, head_cell, blink_cell]
sheet = np.concatenate(cells, axis=1).clip(0, 255).astype(np.uint8)
Image.fromarray(sheet, 'RGBA').save(OUT, optimize=True)

# At rest the layers must give back the picture exactly.
canvas = np.zeros((H, W, 4))
for cell in cells[:7]:
    a = cell[:, :, 3:4] / 255.0
    canvas[:, :, :3] = cell[:, :, :3] * a + canvas[:, :, :3] * (1 - a)
    canvas[:, :, 3:4] = a * 255 + canvas[:, :, 3:4] * (1 - a)
picture = np.dstack([im[:, :, :3] * (im[:, :, 3:4] / 255.0), im[:, :, 3]])   # colours weighted by opacity, like canvas
diff = np.abs(canvas - picture).max()
print('wrote', os.path.relpath(OUT, ROOT), sheet.shape[1], 'x', sheet.shape[0],
      '| largest difference from the picture at rest:', round(float(diff), 1), '(of 255)')
for name, (x, y) in JOINTS.items():
    print('  .%s transform-origin: %s%% %s%%' % (name, round(100 * x / 144, 2), round(100 * y / 204, 2)))
for i in range(len(cells)):
    print('  cell %d background-position: %s%% 0' % (i, round(100 * i / (len(cells) - 1), 4)))
