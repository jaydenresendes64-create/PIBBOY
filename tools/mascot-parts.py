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
A part that turns tucks under the one in front of it: the arm and the legs
carry a little more of themselves under the body, the body some collar
under the head, and each upper leg a round knee under its lower leg, so
turning or bending never shows a hole.

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

# The joint each part turns around, in units. css/terminal.css gives them as
# transform-origin percentages (x / 144, y / 204) on the .mp-* rules; this
# script prints them.
JOINTS = {'mp-head': (81, 90), 'mp-arm': (62, 95), 'mp-leg-front': (70, 143), 'mp-leg-back': (94, 143),
          'mp-shin-front': (65.5, 164.3), 'mp-shin-back': (93.3, 164)}

# ---------- where each part is (picture pixels) ----------
# The head: above the collar. The line follows the shoulders, dips under
# the beard and leaves the two collar flaps to the body.
def head_bottom(x):
    points = [(0, 85), (66, 84), (70, 84), (74, 89), (76, 91), (86, 91), (89, 88), (92, 84), (144, 84)]
    return np.interp(x, [p[0] for p in points], [p[1] for p in points])
head = opaque & (xs >= 56) & (xs < 111) & (ys < head_bottom(xs))
# The thumb arm: left of the body's edge (x = 60). Under the armpit (y >= 100)
# the two columns at the edge are the body's own outline.
ARM_EDGE = 60
arm = opaque & ~head & (((xs < ARM_EDGE + 1) & (ys < 100)) | ((xs < ARM_EDGE - 1) & (ys < 112)))
# The legs: below the belt, split along the crease between them.
LEGS_TOP = 145
def split(y):
    return np.interp(y, [146, 158], [83, 81])
legs = opaque & ~head & ~arm & (ys >= LEGS_TOP)
front_leg = legs & (xs < split(ys))          # his right leg, on the left of the picture, a step ahead
back_leg = legs & ~front_leg
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

def extend_up(cell, y_from, y_to, hidden):
    """A leg goes on up under the belt: its top row, repeated."""
    y_from, y_to = int(round(y_from * K)), int(round(y_to * K))
    row = cell[y_from + 1]
    for y in range(y_to, y_from + 1):
        keep = (row[:, 3] > 0) & hidden[y] & (cell[y, :, 3] == 0)
        cell[y, keep] = row[keep]

def knee_cap(cell, shin_name, shin, hidden):
    """The upper leg goes on past the knee as a round end, outlined, under the
    lower leg: when the knee bends, it fills the gap at the front."""
    knee, u = leg_axis(shin_name)
    across = np.array([-u[1], u[0]])            # along the cut, towards his front (left)
    t = np.arange(0, 20, 0.05)
    xy = knee[None, :] + t[:, None] * across[None, :]
    outside = [not opaque[int(y * K), int(x * K)] for x, y in xy]
    r = t[outside.index(True)]                  # to the leg's front edge
    dist = np.hypot(xs - knee[0], ys - knee[1])
    cap = hidden & shin & (dist <= r + 1 / K)
    # its outline, as dark and about as thick as the leg's own; smooth edges
    dark = im[front_leg | back_leg][:, :3]
    dark = np.median(dark[dark.sum(1) < dark.sum(1).min() + 60], axis=0)
    line = np.clip((dist - (r - 0.85)) * K + 0.5, 0, 1)[cap][:, None]
    cell[cap, :3] = (im[cap, :3] * (1 - line) + dark * line).round().astype(np.int32)
    cell[cap, 3] = (255 * np.clip((r - dist) * K + 0.5, 0, 1)[cap]).round().astype(np.int32)
    print('  %s knee: round end of radius %.1f' % (shin_name, r))

def fill_under(cell, region):
    """The collar under the head: the body's colours, spread inwards."""
    todo = region & (cell[:, :, 3] == 0)
    for _ in range(int(40 * K)):
        if not todo.any():
            break
        have = cell[:, :, 3] > 0
        total = np.zeros((H, W, 4)); count = np.zeros((H, W))
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted = np.roll(np.roll(cell, dy, 0), dx, 1)
            ok = np.roll(np.roll(have, dy, 0), dx, 1)
            total[ok] += shifted[ok]; count[ok] += 1
        grow = todo & (count > 0)
        cell[grow] = (total[grow] / count[grow][:, None]).round().astype(np.int32)
        cell[grow, 3] = 255
        todo &= ~grow

solid = im[:, :, 3] == 255
arm_cell = layer(arm)
extend_right(arm_cell, ARM_EDGE + 9, body & solid)
front_cell, back_cell = layer(front_thigh), layer(back_thigh)
for cell in (front_cell, back_cell):
    extend_up(cell, LEGS_TOP, LEGS_TOP - 10, body & solid)
knee_cap(front_cell, 'mp-shin-front', front_shin, solid)
knee_cap(back_cell, 'mp-shin-back', back_shin, solid)
front_shin_cell, back_shin_cell = layer(front_shin), layer(back_shin)
body_cell = layer(body)
fill_under(body_cell, head & solid & (ys >= 76) & (xs >= 62) & (xs < 101))
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
