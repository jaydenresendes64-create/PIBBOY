"""
The Vault Boy on the level bar, one outfit per level tier: colours each
picture (images/vaultboy/lvl05.png, lvl10, lvl20, lvl30, lvl50, in colour)
in the amber of the original mascot (images/mascot.png), then cuts it into
the parts that css/terminal.css animates, like tools/mascot-parts.py does
for the old one: each part turns around its own joint. Writes
images/vaultboy/parts-lvlXX.png, one row of cells the size of the picture,
in drawing order:

  0 back leg (his left), hip to knee   1 its lower leg and boot
  2 front leg (his right), hip to knee   3 its lower leg and boot
  4 thumb arm   5 body (with the hand on the hip)   6 head
  7 head with the eyes closed (the same head when sunglasses hide them)

The five pictures share the pose and the frame (308x420, or any whole
multiple), so the joints are the same for all and the CSS rig is one;
only where the legs start changes (the bag at 20, the jacket at 50 hang
over the hips and stay with the body).

Each thigh carries round ends under the parts in front of it (round_end():
the seat under the body, the knee under the shin), and what a leg has above
its hip joint outside the circle it turns in stays with the body
(hip_slivers()), so a turning leg shows curves, never a square corner; the
belt's bottom outline stays with the body too. The shin's own corner at a
bent knee is hidden by its .vb-knee box (tools/vaultboy-moves.py knee_css()).

The amber: each picture's brightness goes through one tone curve (matching
lvl05's brightness spread to the old mascot's), then takes the old
mascot's colour for that brightness. Laid on top of each other at rest,
the cells give back the amber picture exactly (the script checks).

Only for new pictures (same pose): python tools/vaultboy-parts.py
Needs Python 3 with Pillow and numpy. The joints below must match the
transform-origin values of the .vb-* rules in the CSS (the script prints them).
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DIR = os.path.join(ROOT, 'images', 'vaultboy')
TIERS = ['05', '10', '20', '30', '50']
UW, UH = 308, 420                               # positions below are in pixels of a 308x420 picture

# The joint each part turns around.
JOINTS = {'vb-head': (180, 142), 'vb-arm': (146, 162), 'vb-leg-front': (160, 277), 'vb-leg-back': (215, 277),
          'vb-shin-front': (145, 326), 'vb-shin-back': (211, 326)}
# Where the legs start, along x: under the belt, and lower under the hand on
# the hip; under the bag (20), and under the jacket's two flaps (50).
LEGS_TOP = {
    'base': [(0, 266), (135, 266), (150, 269), (170, 273), (210, 272), (213, 272), (214, 285), (256, 285), (257, 272), (308, 272)],
    '20': [(0, 283), (210, 283), (213, 278), (230, 278), (232, 286), (258, 286), (259, 275), (308, 275)],
    '50': [(0, 308), (149, 308), (154, 273), (221, 273), (226, 308), (308, 308)],
}
# Eyes to shut for the blink (x0, x1, y0, y1, lid y, a skin pixel), or none
# behind sunglasses.
EYES = [(141, 162, 73, 87, 79.5, (151, 92)), (179, 201, 73, 88, 80, (190, 93))]
SHADES = {'10', '20'}
# Background left white inside the outline (the arm's crook at 50): cleared
# from a point inside it.
HOLES = {'50': [(243, 215)]}

Y = lambda a: 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]

# ---------- the amber: the old mascot's colour for each brightness ----------
old = np.array(Image.open(os.path.join(ROOT, 'images', 'mascot.png')).convert('RGBA')).astype(float)
solid_old = old[..., 3] > 250
oy, orgb = Y(old)[solid_old], old[..., :3][solid_old]
PALETTE = np.zeros((256, 3)); have = np.zeros(256, bool)
for v in range(256):
    near = np.abs(oy - v) < 3
    if near.sum() > 5:
        PALETTE[v] = orgb[near].mean(0); have[v] = True
for c in range(3):
    PALETTE[:, c] = np.interp(np.arange(256), np.arange(256)[have], PALETTE[have, c])
ref = np.array(Image.open(os.path.join(DIR, 'lvl05.png')).convert('RGBA')).astype(float)
q = np.linspace(0, 100, 21)
src_q = np.percentile(Y(ref)[ref[..., 3] > 250], q)
src_q = np.maximum.accumulate(src_q + np.arange(len(q)) * 1e-3)
CURVE = np.interp(np.arange(256), src_q, np.percentile(oy, q))

def amber(rgba):
    out = rgba.copy()
    out[..., :3] = PALETTE[np.interp(Y(rgba), np.arange(256), CURVE).round().clip(0, 255).astype(int)]
    return out

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

def clear_holes(rgba, seeds, K):
    """The near-white pixels joined to each seed become see-through; the
    greyish ones around them (the soft edge) partly."""
    H, W, _ = rgba.shape
    light = rgba[:, :, :3].min(2)
    for sx, sy in seeds:
        todo, hole = [(int(round(sy * K)), int(round(sx * K)))], np.zeros((H, W), bool)
        while todo:
            y, x = todo.pop()
            if 0 <= y < H and 0 <= x < W and not hole[y, x] and light[y, x] > 200 and rgba[y, x, 3] > 0:
                hole[y, x] = True
                todo += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
        edge = np.zeros_like(hole)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            edge |= np.roll(np.roll(hole, dy, 0), dx, 1)
        edge &= ~hole & (light > 90)
        rgba[hole, 3] = 0
        rgba[edge, 3] = (rgba[edge, 3] * np.clip((255 - light[edge]) / 165.0, 0, 1)).round()
        print('  cleared %d px of background inside the outline' % hole.sum())
    return rgba

def cut(tier):
    src = np.array(Image.open(os.path.join(DIR, 'lvl%s.png' % tier)).convert('RGBA')).astype(float)
    src = clear_holes(src, HOLES.get(tier, []), src.shape[1] / float(UW))
    im = amber(src).round().astype(np.int32)
    H, W, _ = im.shape
    K = W / float(UW)
    assert W % UW == 0 and H == UH * W // UW, 'the picture must be a whole multiple of 308x420'
    ys, xs = np.mgrid[0:H, 0:W] / K
    opaque = im[:, :, 3] > 0
    solid = im[:, :, 3] == 255

    # The head: above the collar; the line follows the beard's outline down
    # to where the shoulders start on each side (x 150 and 208), dips under
    # the beard, and leaves the shoulders' first pixels and the collar to the
    # body, so nothing of them turns with the head.
    pts = [(0, 136), (140, 136), (146, 139), (150, 141), (160, 146), (175, 151), (190, 151), (196, 148), (200, 145),
           (205, 136), (208, 130), (212, 129), (216, 131), (308, 131)]
    neck = lambda x: np.interp(x, *zip(*pts))
    head = opaque & (xs >= 118) & (xs < 262) & (ys < neck(xs))
    head = without_slivers(head, max(1, int(round(2 * K))), 112, ys)
    # The thumb arm: left of the body's edge (x = 141); under the armpit
    # (y >= 182) the columns at the edge are the body's own outline.
    ARM_EDGE = 141
    arm = opaque & ~head & (((xs < ARM_EDGE) & (ys < 182)) | ((xs < ARM_EDGE - 9) & (ys < 200)))
    # The legs: from LEGS_TOP down, split along the crease between them.
    top = LEGS_TOP.get(tier, LEGS_TOP['base'])
    legs = opaque & ~head & ~arm & (ys >= np.interp(xs, *zip(*top)))
    # The belt's bottom outline stays with the body: a thin dark run at the
    # top of a leg's column (not a leg's own outline, which runs on down).
    lum = Y(im)
    for x in range(W):
        rows = np.nonzero(legs[:, x])[0]
        if len(rows):
            run = 0
            while run < 5 and rows[0] + run < H and lum[rows[0] + run, x] < 60:
                run += 1
            if 0 < run < 5:
                legs[rows[0]:rows[0] + run, x] = False
    split = np.interp(ys, [272, 288, 300, 312, 330, 360], [193, 190, 186, 180, 176, 174])
    front_leg = legs & (xs < split)
    back_leg = legs & ~front_leg
    # Above the hip joint, what a leg has outside the circle it turns in (round
    # the joint, out to the leg's edge on each side) stays with the body: the
    # hip's outline holds still and the leg turns under it, its top never
    # poking out as a corner.
    def hip_slivers(leg, name):
        hip, knee = np.array(JOINTS[name], float), np.array(JOINTS[name.replace('leg', 'shin')], float)
        u = (knee - hip) / np.hypot(*(knee - hip))
        across = np.array([-u[1], u[0]])
        along, side = (xs - hip[0]) * u[0] + (ys - hip[1]) * u[1], (xs - hip[0]) * across[0] + (ys - hip[1]) * across[1]
        band = leg & (along >= 0) & (along < 3)
        edge = lambda v: v.max() if v.size else np.inf             # none there: the leg starts lower on that side
        far = np.where(side > 0, edge(side[band & (side > 0)]), edge(-side[band & (side < 0)]))
        return leg & (along < 0) & (np.hypot(along, side) > far)
    front_leg &= ~hip_slivers(front_leg, 'vb-leg-front')
    back_leg &= ~hip_slivers(back_leg, 'vb-leg-back')
    legs = front_leg | back_leg
    body = opaque & ~head & ~arm & ~legs

    def leg_axis(shin):
        hip, knee = np.array(JOINTS[shin.replace('shin', 'leg')], float), np.array(JOINTS[shin], float)
        return knee, (knee - hip) / np.hypot(*(knee - hip))
    def below_knee(shin):
        knee, u = leg_axis(shin)
        return (xs - knee[0]) * u[0] + (ys - knee[1]) * u[1] > 0
    front_shin = front_leg & below_knee('vb-shin-front')
    back_shin = back_leg & below_knee('vb-shin-back')
    front_thigh, back_thigh = front_leg & ~front_shin, back_leg & ~back_shin

    def layer(mask):
        out = np.zeros_like(im)
        out[mask] = im[mask]
        return out

    # ---------- what each part carries under the one in front ----------
    def extend_right(cell, x_to, hidden):
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
        src[:, :, :3] *= src[:, :, 3:4] / 255.0                     # premultiplied, to blend neighbours
        x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
        fx, fy = (sx - x0)[:, None], (sy - y0)[:, None]
        at = lambda y, x: src[np.clip(y, 0, H - 1), np.clip(x, 0, W - 1)]
        px = (at(y0, x0) * (1 - fx) * (1 - fy) + at(y0, x0 + 1) * fx * (1 - fy)
              + at(y0 + 1, x0) * (1 - fx) * fy + at(y0 + 1, x0 + 1) * fx * fy)
        a = px[:, 3:4]
        px[:, :3] = np.where(a > 0, px[:, :3] * 255.0 / np.maximum(a, 1e-9), 0)
        cell[todo] = px.round().astype(np.int32)

    def shadow_under(cell, region):
        """Under the bottom of the head, between the shoulders: a plain dark
        shadow, hidden at rest; when the head turns a little, that's what a
        sliver of it shows (never a patch above the shoulders)."""
        dark = im[body][:, :3]
        dark = np.median(dark[dark.sum(1) < dark.sum(1).min() + 60], axis=0)
        todo = region & (cell[:, :, 3] == 0)
        cell[todo, :3] = dark.round().astype(np.int32)
        cell[todo, 3] = 255

    arm_cell = layer(arm)
    extend_right(arm_cell, ARM_EDGE + 18, body & solid)
    front_cell, back_cell = layer(front_thigh), layer(back_thigh)
    for cell, thigh, shin, name in ((front_cell, front_thigh, front_shin, 'vb-shin-front'), (back_cell, back_thigh, back_shin, 'vb-shin-back')):
        knee, u = leg_axis(name)
        round_end(cell, thigh, np.array(JOINTS[name.replace('shin', 'leg')], float), u, -1, body & solid)   # the seat, under the body
        round_end(cell, thigh, knee, u, 1, shin & solid)                                                    # the knee, under the shin
    front_shin_cell, back_shin_cell = layer(front_shin), layer(back_shin)
    body_cell = layer(body)
    shadow_under(body_cell, head & solid & (ys >= neck(xs) - 6) & (xs >= 146) & (xs < 210))
    head_cell = layer(head)

    # ---------- the blink: the same head, eyes shut ----------
    blink_cell = head_cell.copy()
    if tier not in SHADES:
        px = lambda v: int(round(v * K))
        line = np.array([58, 30, 10, 255])
        thick = max(1, int(round(1.6 * K)))
        for x0, x1, y0, y1, lid_y, skin_at in EYES:
            skin = blink_cell[px(skin_at[1]), px(skin_at[0])].copy()
            blink_cell[px(y0):px(y1) + 1, px(x0):px(x1) + 1] = skin
            for x in range(px(x0), px(x1) + 1):
                t = (x - px(x0)) / max(1, px(x1) - px(x0))
                y = int(round((lid_y + 2.2 * (1 - (2 * t - 1) ** 2)) * K))
                blink_cell[y:y + thick, x] = line

    cells = [back_cell, back_shin_cell, front_cell, front_shin_cell, arm_cell, body_cell, head_cell, blink_cell]
    sheet = np.concatenate(cells, axis=1).clip(0, 255).astype(np.uint8)
    out = os.path.join(DIR, 'parts-lvl%s.png' % tier)
    Image.fromarray(sheet, 'RGBA').save(out, optimize=True)

    canvas = np.zeros((H, W, 4))
    for cell in cells[:7]:
        a = cell[:, :, 3:4] / 255.0
        canvas[:, :, :3] = cell[:, :, :3] * a + canvas[:, :, :3] * (1 - a)
        canvas[:, :, 3:4] = a * 255 + canvas[:, :, 3:4] * (1 - a)
    picture = np.dstack([im[:, :, :3] * (im[:, :, 3:4] / 255.0), im[:, :, 3]])
    diff = np.abs(canvas - picture).max()
    print('wrote %s %dx%d | largest difference from the picture at rest: %.1f (of 255)'
          % (os.path.relpath(out, ROOT), sheet.shape[1], sheet.shape[0], diff))
    return cells, (front_thigh, front_shin, back_thigh, back_shin, arm, body, head)

if __name__ == '__main__':
    for tier in TIERS:
        cut(tier)
    for name, (x, y) in JOINTS.items():
        print('  .%s transform-origin: %s%% %s%%' % (name, round(100 * x / UW, 2), round(100 * y / UH, 2)))
    for i in range(8):
        print('  cell %d background-position: %s%% 0' % (i, round(100 * i / 7, 4)))
