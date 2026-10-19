"""
Writes the Vault Boy's walk on the 3D level gauge into css/terminal.css: one
loop that never stops, in the cartoon style of the old mascot's moves
(tools/mascot-moves.py): a wind-up, six quick steps, a brake, a look around,
a thumbs-up, a spin like a flat card to turn round, the same back, another
look and thumbs-up, a spin.

He really walks: his boots don't slide. The walk is worked out the way it is
animated by hand, from where the boots go: one boot stands still on the
gauge while the other swings forward in an arc, lifted off it, and lands a
step ahead; each step as long as the last, both legs alike (but the first
and last ones: he gets going and stops), the body going on at an even speed
(it gets going and slows down evenly at the ends) and bobbing
a little (lowest when both boots are down). The legs' angles come from that
(each leg a thigh and a shin reaching the boot, the knee to his front:
reach()). He walks toward the hand on his hip, the thumb behind (the owner's
choice): at each end of the gauge, his thumbs-up is for the screen, not the
edge. Then what the page will draw is checked back from the legs alone,
for the outfits that walk in parts (levels 10 and up: levels 1-9 walk with
drawings, drawn_css()),
from the joints and soles of his boots (RIGS): where he is along the gauge
(.vb-track) so that the boot with the weight stays put, and how high his
body is (.vb-body) so that the lower boot is on its lane of the gauge's top
(the back foot stands a little further back, so a little higher).

Every element of the rig gets one animation of the same length, so they stay
together: .vb-track, .vb-move (which way he goes, squash and stretch, the
lean), .vb-body, and each part (degrees, as CSS turns them: clockwise). As
drawn he goes right, toward the hand on his hip; scale(-1,1) turns him to
go left. The legs are named for how near they are: the front one (his right,
on top, under the thumb) and the back one (his left, its boot a little
higher on the gauge's top). Lengths are shares of his frame's
height (--vb-h); --vb-swing (js/render.js, 1 unless the gauge's free stretch
is short) shortens his steps, legs and distance together.

After a change: python tools/vaultboy-moves.py (plain Python 3), then
node --test. It replaces the part of css/terminal.css between
"/* The Vault Boy's walk on the level bar" and
"/* End of the Vault Boy's walk made by tools/vaultboy-moves.py. */".
"""
import json
import math
import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CSS = os.path.join(ROOT, 'css', 'terminal.css')

IO, OUT, IN, BACK, LIN = ('cubic-bezier(.45,0,.55,1)', 'cubic-bezier(.2,.7,.3,1)',
                          'cubic-bezier(.55,0,.85,.35)', 'cubic-bezier(.34,1.56,.64,1)', 'linear')
PARTS = [('LegF', 'vb-leg-front'), ('ShinF', 'vb-shin-front'), ('LegB', 'vb-leg-back'), ('ShinB', 'vb-shin-back'),
         ('Arm', 'vb-arm'), ('Head', 'vb-head')]
LEGS = ('LegF', 'ShinF', 'LegB', 'ShinB')
LOOP = 11                   # seconds
STEPS, STEP = 6, 0.28      # each way: quick steps (the old mascot's took 0.25 s); even: the boot ahead lands last
SPAN = 69                   # page pixels he goes each way (frame 100px high): a 390px-wide screen's room
LIFT = 3.8                  # page pixels: how high the swinging boot goes
BOB = (0.95, 0.36)          # page pixels his body is lower than standing: both boots down, one boot under him
HOVER = 0.002               # at most this share of his height between the boot with the weight and the gauge
DRAWN_STEPS = 2             # each way, for an outfit with a drawn walk: its steps are longer (2 fit a 390px-wide screen)
WALK_DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vaultboy-walk.json')
WALKS = json.load(open(WALK_DATA)) if os.path.exists(WALK_DATA) else {}   # tools/vaultboy-walk.py: the outfits with one
PER_STEP = 8                # drawings a step: Gemini's 4 and an in-between after each (tools/vaultboy-walk.py)
assert all(w['frames'] == 2 * PER_STEP for w in WALKS.values()), 'a drawn walk: two steps of PER_STEP drawings'
FRAME = STEP / PER_STEP     # seconds a drawing shows: the parts' pace
DRAWN_FRAMES = PER_STEP * DRAWN_STEPS + 1   # the steps' drawings, and the first one again: he lands
TURN_FRAMES = max([w.get('turn', 0) for w in WALKS.values()] or [0])   # the drawn turn after them (tools/vaultboy-walk.py)
TURN_FRAME = 2.5 * FRAME    # seconds each of the turn's drawings shows: 8 drawings in 0.7 s (the owner: 4 in 0.28 s was too fast, in 0.56 s not smooth)
TURN_TIME = TURN_FRAMES * TURN_FRAME   # facing us to the side before a drawn walk, the other way after it
RATE = 250                  # samples a second (STEP and 0.12 s fall on it)
RIGHT, LEFT = 1, -1         # scale x to go that way
AHEAD = 1                   # his front along the picture's x: right, the hand on his hip
LEAD, TRAIL = 'B', 'F'      # standing: the boot ahead (the back leg's), the one behind
LEAN = AHEAD                # degrees: he leans into the walk

# Each rig, in pixels of its picture: the hips and knees (the joints the
# cutting tools use: tools/vaultboy-parts.py JOINTS, tools/mascot-parts.py
# JOINTS doubled), the middle of each boot's sole, the picture's height, and
# the point .vb-move turns and squashes him around (css/terminal.css: 55%
# 97.9% of the 308px-wide frame, 52% 96.3% of the original's 288px), and
# how tall his frame is on the page (--vb-h: the original's is taller, so
# that he stands as tall). Each rig gets its own legs' angles. thighF/B: how
# far each thigh reaches across at the knee line, behind (his back, to the
# left as drawn) and in front, a pixel inside its outline (measured in the
# pictures, the narrowest of the outfits): where a bent shin is hidden
# (knee_css()).
RIGS = [
    ('', dict(H=420, W=308, hipF=(160, 277), kneeF=(145, 326), soleF=(117.5, 411),
              hipB=(215, 277), kneeB=(211, 326), soleB=(230.5, 401), origin=(0.55 * 308, 0.979 * 420), tall=100,
              thighF=(25.75, 28), thighB=(28.75, 22.75))),
]
# The tiers that walk with another outfit's drawings: the original Vault Boy
# (levels 1-4) is the same man in the same suit, drawn a little differently,
# so he walks with level 5's drawings, at their size on the page, in his own
# frame (288x408 picture px, --vb-h 117px): its front sole (393) on the
# gauge, the drawings' belt over his (its middle at x 163.5, measured on
# images/mascot.png: the belt from 120 to 207, the fist after it).
BORROW = {'00': dict(of='05', W=288, H=408, tall=117, sole=393, belt=163.5)}

def turned(p, c, deg):
    """Point p turned around c by deg, the way CSS's rotate() turns (clockwise on screen)."""
    a = math.radians(deg)
    dx, dy = p[0] - c[0], p[1] - c[1]
    return (c[0] + dx * math.cos(a) - dy * math.sin(a), c[1] + dx * math.sin(a) + dy * math.cos(a))

def boot(rig, side, leg, shin):
    """Where a boot's sole is: turned at the knee, then the whole leg at the hip."""
    return turned(turned(rig['sole' + side], rig['knee' + side], shin), rig['hip' + side], leg)

def reach(rig, side, foot):
    """(leg, shin): the angles that put that boot's sole on foot (picture
    pixels), the knee to his front; a leg can't reach further than straight."""
    hip, knee, sole = rig['hip' + side], rig['knee' + side], rig['sole' + side]
    l1, l2 = math.dist(hip, knee), math.dist(knee, sole)
    ahead, down = AHEAD * (foot[0] - hip[0]), foot[1] - hip[1]
    d = min(math.hypot(ahead, down), l1 + l2 - 1e-9)
    line = math.atan2(ahead, down)                                  # from the hip to the boot, from straight down, to his front
    thigh = line + math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))
    shin = line - math.acos((l2 * l2 + d * d - l1 * l1) / (2 * l2 * d))
    drawn = lambda a, b: math.atan2(AHEAD * (b[0] - a[0]), b[1] - a[1])   # as drawn, from straight down
    leg = math.degrees(thigh - drawn(hip, knee))
    return -AHEAD * leg, -AHEAD * (math.degrees(shin - drawn(knee, sole)) - leg)   # as CSS turns them

# One timeline at a time (timeline()): the keys it collects.
ch = legs = mover = steps = walks = None   # the arm and head; each rig's legs; .vb-move; who has the weight; (from, to, facing) of each walk
def key(part, t, v, ease=IO): ch[part].append((t, v, ease))
def at(t, ease=IO, **state): mover.append((t, state, ease))

def one_per_time(keys, rest):
    """Sorted keys, one per time (the last given wins), at rest at 0 and at the end;
    a key is dropped only in the middle of a hold."""
    by_t = {}
    for k in keys:
        by_t[round(k[0], 4)] = k[1:]
    by_t.setdefault(0.0, (rest, IO))
    by_t[round(LOOP, 4)] = (rest, IO)
    ks = sorted((t,) + v for t, v in by_t.items())
    return [k for i, k in enumerate(ks) if not (0 < i < len(ks) - 1 and ks[i - 1][1] == k[1] == ks[i + 1][1])]

_curves = {}
def eased(ease, u):
    """CSS's cubic-bezier(x1,y1,x2,y2) (or linear) at progress u."""
    if ease == LIN or u <= 0 or u >= 1:
        return min(max(u, 0.0), 1.0)
    if ease not in _curves:
        _curves[ease] = [float(n) for n in ease[len('cubic-bezier('):-1].split(',')]
    x1, y1, x2, y2 = _curves[ease]
    lo, hi = 0.0, 1.0
    for _ in range(40):
        s = (lo + hi) / 2
        if 3 * (1 - s) ** 2 * s * x1 + 3 * (1 - s) * s * s * x2 + s ** 3 < u: lo = s
        else: hi = s
    s = (lo + hi) / 2
    return 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s * s * y2 + s ** 3

def value_at(keys, t):
    for i in range(len(keys) - 1):
        t0, v0, e0 = keys[i]
        t1, v1, _ = keys[i + 1]
        if t0 <= t <= t1:
            return v0 + (v1 - v0) * eased(e0, 0 if t1 == t0 else (t - t0) / (t1 - t0))
    return keys[-1][1]

def mover_keys():
    """.vb-move's keyframes: [(t, ({sx, sy, ty, rot}, ease))], each key carrying the values it doesn't set."""
    by_t, carry = {}, dict(sx=RIGHT, sy=1, ty=0, rot=0)
    for t, s, e in sorted(mover, key=lambda k: k[0]):
        carry = dict(carry, **s); by_t[round(t, 4)] = (dict(carry), e)
    return sorted(by_t.items())

def mover_at(ks, t):
    """{sx, sy, ty, rot} of .vb-move at time t, as CSS plays its keyframes ks."""
    for (t0, (s0, e0)), (t1, (s1, _)) in zip(ks, ks[1:]):
        if t0 <= t <= t1:
            u = eased(e0, 0 if t1 == t0 else (t - t0) / (t1 - t0))
            return {k: s0[k] + (s1[k] - s0[k]) * u for k in s0}
    return dict(ks[-1][1][0])

def simplified(samples, tol):
    """The fewest samples that, joined by straight lines, stay within tol of all of them."""
    out, i, n = [samples[0]], 0, len(samples)
    while i < n - 1:
        best, j = i + 1, i + 1
        while j < n:
            t0, v0 = samples[i]
            t1, v1 = samples[j]
            if any(abs(v0 + (v1 - v0) * (samples[k][0] - t0) / (t1 - t0) - samples[k][1]) > tol for k in range(i + 1, j)):
                break
            best, j = j, j + 1
        out.append(samples[best])
        i = best
    return out

def smooth(u):
    return u * u * (3 - 2 * u)

def walk(start, face, drawn=False):
    """A wind-up, STEPS steps from `start` (the boot behind first), the stop:
    each rig's legs (strides()); the arm swings against the legs and the head
    bobs a beat late. Steps start on the RATE grid, so both ways are worked
    out alike. drawn: an outfit with a drawn walk (tools/vaultboy-walk.py),
    DRAWN_STEPS steps of drawings shown in turn, the parts hidden (drawn_css())."""
    start = round(start * RATE) / RATE
    if drawn:
        draws = start + TURN_TIME                                  # first he turns to the side (drawn_css())
        end = draws + DRAWN_FRAMES * FRAME
        at(start, IO, sx=face, sy=1, ty=0, rot=0)
        at(end, OUT, sx=face, sy=1, rot=0)
        key('Arm', start, 0); key('Arm', end + 0.12, 0)
        key('Head', start, 0); key('Head', end + 0.08, 2 * AHEAD); key('Head', end + 0.25, 0)
        at(end + 0.08, IO, sx=face, sy=0.97, rot=-AHEAD)           # brakes, the parts back: leans back, squashes
        at(end + 0.18, IO, sx=face, sy=1.01, rot=0.3 * AHEAD)
        at(end + 0.26, IO, sx=face, sy=1, rot=0)
        walks.append((draws, end, face))
        return end + max(0.26, TURN_TIME)                          # and turns back to us
    at(start, IO, sx=face, sy=1, ty=0, rot=0)
    at(start + 0.08, IO, sx=face, sy=0.98, rot=-1.5 * AHEAD)      # wind-up: leans back, dips
    c0 = start + 0.12
    at(c0, LIN, sx=face, sy=1, rot=LEAN)                           # leans into the walk
    contacts = [c0 + i * STEP for i in range(STEPS + 1)]
    end = contacts[-1]
    at(contacts[-2], IO, sx=face, sy=1, rot=LEAN)
    at(end, OUT, sx=face, sy=1, rot=0)                             # straightens up in the last step: the boot behind stands far back
    steps.append((start, LEAD))                                    # both down at first: the one ahead stays
    for i, c in enumerate(contacts[:-1]):
        swinging = TRAIL if i % 2 == 0 else LEAD                   # the boot behind first, the one ahead lands last
        steps.append((c, LEAD if swinging == TRAIL else TRAIL))    # the other one has the weight
        key('Arm', c + 0.03, -6 * AHEAD if swinging == 'B' else 6 * AHEAD)   # the thumb arm against his right leg
        key('Head', c + 0.05, -2 * AHEAD if swinging == 'B' else 2 * AHEAD)
    for name, rig in RIGS:
        strides(rig, legs[name], start, contacts)
    key('Arm', start, 0); key('Arm', end + 0.12, 0)
    key('Head', start, 0); key('Head', end + 0.08, 2 * AHEAD); key('Head', end + 0.25, 0)
    at(end + 0.08, IO, sx=face, sy=0.97, rot=-AHEAD)               # brakes: leans back, squashes
    at(end + 0.18, IO, sx=face, sy=1.01, rot=0.3 * AHEAD)
    at(end + 0.26, IO, sx=face, sy=1, rot=0)
    walks.append((start, end, face))                               # then both boots are down: he stays there
    return end + 0.26

def strides(rig, into, start, contacts):
    """One rig's legs for a walk (see the top): where the boots go, then the angles."""
    c0, c1, end, last = contacts[0], contacts[1], contacts[-1], contacts[-2]
    # Lengths ahead (picture pixels, along AHEAD): a step, his speed, where
    # each boot stands at rest from its hip (the one behind: below 0). He
    # gets going evenly in the wind-up and the first step (the boot ahead
    # stands until then: not too far for it to stay down) and slows down
    # evenly in the last one: SPAN in all.
    px = rig['H'] / float(rig['tall'])                             # picture pixels in a page pixel (frame 100px high)
    w = (c1 - start) / STEP / 2                                    # the way to get going, in steps
    step = SPAN * px / (len(contacts) - 2.5 + w)
    speed = step / STEP
    shift, stop = w * step, step / 2
    rest = {f: AHEAD * (rig['sole' + f][0] - rig['hip' + f][0]) for f in 'FB'}
    def hermite(u, a, b, va, vb, T):                               # from a to b, at those speeds, in T
        return (2*u**3 - 3*u*u + 1) * a + (u**3 - 2*u*u + u) * va * T + (-2*u**3 + 3*u*u) * b + (u**3 - u*u) * vb * T
    def body(t):                                                   # how far ahead he is
        if t <= c1:
            return hermite((t - start) / (c1 - start), 0, shift, 0, speed, c1 - start)
        if t <= last:
            return shift + speed * (t - c1)
        a = shift + speed * (last - c1)
        return hermite((t - last) / STEP, a, a + stop, speed, 0, STEP)
    low, high = BOB[0] * px, BOB[1] * px
    def drop(t):                                                   # how much lower than standing
        if t <= c0:
            return low * smooth((t - start) / (c0 - start))
        if t >= last:
            return low * (1 - smooth((t - last) / STEP))
        u = ((t - c0) % STEP) / STEP
        return low - (low - high) * math.sin(math.pi * u) ** 2
    # Each boot: where it stands (ahead), then, swinging, from there to where it lands.
    # Each lands half a step ahead of its hip; the last two where they stand
    # at rest once he has stopped.
    swings = {'F': [], 'B': []}
    stand = {f: AHEAD * rig['sole' + f][0] for f in 'FB'}
    for i, (c, nxt) in enumerate(zip(contacts, contacts[1:])):
        f = TRAIL if i % 2 == 0 else LEAD
        lands = body(nxt) + AHEAD * rig['hip' + f][0] + (rest[f] if nxt == end else rest[f] + stop if nxt == last else step / 2)
        swings[f].append((c, nxt, stand[f], lands))
        stand[f] = lands
    def boot_at(f, t):                                             # (ahead, up above its lane)
        for c, nxt, a, b in swings[f]:
            if c <= t < nxt:
                u = (t - c) / STEP
                return a + (b - a) * (u - math.sin(2 * math.pi * u) / (2 * math.pi)), LIFT * px * (1 - math.cos(2 * math.pi * u)) / 2
            if t < c:
                return a, 0.0
        return swings[f][-1][3], 0.0
    # The legs' angles, RATE times a second: each boot's spot on the gauge
    # brought back into the picture (the body ahead, lower, leaned and squashed
    # as .vb-move does it), then reached.
    moves, (ox, oy) = mover_keys(), rig['origin']
    angles = {k: [] for k in LEGS}
    for i in range(int(round((end - start) * RATE)) + 1):
        t = start + i / float(RATE)
        m = mover_at(moves, t)
        for f in 'FB':
            ahead, up = boot_at(f, t)
            gx, gy = AHEAD * (ahead - body(t)) - ox, (rig['sole' + f][1] - up - oy) / m['sy']
            x, y = turned((gx, gy), (0, 0), -m['rot'])
            leg, shin = reach(rig, f, (ox + x, oy + y - drop(t)))
            angles['Leg' + f].append((t, leg))
            angles['Shin' + f].append((t, shin))
    # From standing as drawn (0) in the wind-up: the back leg's knee is drawn
    # bent behind him, it comes round to his front then (a front leg may also
    # be drawn a hair past straight); back to it while he brakes, both boots down.
    for k, samples in angles.items():
        a0 = samples[0][1]
        for j, (t, v) in enumerate(samples):
            samples[j] = (t, v - a0 * (1 - smooth(min(1.0, (t - start) / (c0 - start)))))
    for f in 'FB':
        kept = simplified_leg(rig, f, angles['Leg' + f], angles['Shin' + f], 0.1)
        for t, leg, shin in kept[:-1]:
            into['Leg' + f].append((t, round(leg, 3), LIN))
            into['Shin' + f].append((t, round(shin, 3), LIN))
        for k, v in (('Leg' + f, kept[-1][1]), ('Shin' + f, kept[-1][2])):
            into[k].append((end, round(v, 3), IO))
            into[k].append((end + 0.26, 0, IO))

def simplified_leg(rig, f, legs_, shins, tol):
    """A leg's two angles at the fewest same moments that, joined by straight
    lines, keep its boot within tol picture pixels of where it should be."""
    exact = [boot(rig, f, a, b) for (_, a), (_, b) in zip(legs_, shins)]
    out, i, n = [(legs_[0][0], legs_[0][1], shins[0][1])], 0, len(legs_)
    while i < n - 1:
        best, j = i + 1, i + 1
        while j < n:
            (t0, a0), (t1, a1), b0, b1 = legs_[i], legs_[j], shins[i][1], shins[j][1]
            def off(k):
                u = (legs_[k][0] - t0) / (t1 - t0)
                return math.dist(boot(rig, f, a0 + (a1 - a0) * u, b0 + (b1 - b0) * u), exact[k])
            if any(off(k) > tol for k in range(i + 1, j)):
                break
            best, j = j, j + 1
        out.append((legs_[best][0], legs_[best][1], shins[best][1]))
        i = best
    return out

def look(t):
    """One way, the other, back (a small turn of the head)."""
    for dt, v, e in [(0, 0, IO), (0.2, -5, IO), (0.4, -5, OUT), (0.6, 4.5, IO), (0.77, 4.5, IO), (0.93, 0, IO)]:
        key('Head', t + dt, v, e)
    return t + 0.93

def thumbs(t, face):
    """A little wind-up, two thumbs-up pumps with a bounce, settle."""
    for dt, sy, ty, e in [(0, 1, 0, OUT), (0.1, 0.97, 0, OUT), (0.24, 1.02, -2.5, IO), (0.38, 0.99, 0, OUT),
                          (0.54, 1.02, -2.5, IO), (0.72, 0.99, 0, IO), (0.86, 1, 0, IO)]:
        at(t + dt, e, sx=face, sy=sy, ty=ty, rot=0)
    for dt, v, e in [(0, 0, IO), (0.1, -4, BACK), (0.24, 15, IO), (0.38, 5, BACK), (0.54, 15, IO), (0.76, -2, IO), (0.92, 1, IO), (1.1, 0, IO)]:
        key('Arm', t + dt, v, e)
    for dt, v in [(0, 0), (0.24, 2), (0.54, -2), (0.8, 0)]:
        key('Head', t + dt, v)
    return t + 1.1

def turn(t0, t1, sx_from, sx_to):
    """A cartoon turn: he spins like a flat card, a little squashed and lifted halfway."""
    mid = (t0 + t1) / 2
    at(t0, IN, sx=sx_from, sy=1, ty=0, rot=0)
    at(mid - 0.004, LIN, sx=0.15 * sx_from, sy=0.95, ty=-2, rot=0)
    at(mid, OUT, sx=0.15 * sx_to, sy=0.95, ty=-2, rot=0)
    at(t1, IO, sx=sx_to, sy=1, ty=0, rot=0)
    return t1

# ---------- the loop: from the left end, going right ----------
def timeline(drawn=False):
    """The whole loop's keys, for the parts' walk or a drawn one: the same
    moves, the pauses between them making up for the drawn walk and its turns
    being shorter or longer (`wait`)."""
    global ch, legs, mover, steps, walks
    ch, legs = {k: [] for k, _ in PARTS}, {name: {k: [] for k in LEGS} for name, _ in RIGS}
    mover, steps, walks = [], [], []
    wait = (0.12 + STEPS * STEP - DRAWN_FRAMES * FRAME) / 2 - TURN_TIME if drawn else 0
    assert 0.3 + wait >= 0.15, 'the drawn walk and its turns leave too short a pause before the look and the thumbs-up'
    t = walk(0, RIGHT, drawn)                                       # to the right end
    t = look(t + 0.35 + wait)
    t = thumbs(t + 0.3 + wait, RIGHT)
    t = turn(t + 0.35, t + 0.53, RIGHT, LEFT)
    t = walk(t + 0.05, LEFT, drawn)                                 # back to the left end
    t = look(t + 0.35 + wait)
    t = thumbs(t + 0.3 + wait, LEFT)
    t = turn(t + 0.35, t + 0.53, LEFT, RIGHT)
    assert t < LOOP - 0.2, 'the loop is too short: %.2f s' % t
    at(LOOP, IO, sx=RIGHT, sy=1, ty=0, rot=0)
    return t

# ---------- reading the keyframes back, as CSS plays them ----------
def planted(name, rig):
    """[(t, x along the gauge)], [(t, body y)], in shares of the frame's height,
    RATE times a second, and how far the boot with the weight ever is above
    the gauge. The boots are worked out as the page draws them: each leg
    turned at the knee and the hip, the body moved down by y, the whole of him
    turned and squashed around his feet (.vb-move, its hops aside). The body
    is as low as the lower boot lets it: that boot stands on its lane, the
    other on it or above it. While he walks, the boot with the weight (steps)
    stays where it is on the gauge: x makes up for it."""
    angle = {k: one_per_time(legs[name][k], 0) for k in LEGS}
    H, (ox, oy) = float(rig['H']), rig['origin']
    lane = {'F': rig['soleF'][1], 'B': rig['soleB'][1]}
    order, moves = sorted(steps), mover_keys()
    xs, ys, hover = [], [], 0.0
    track, stance, plant = 0.0, None, None
    for i in range(int(round(LOOP * RATE)) + 1):
        t = i / float(RATE)
        m = mover_at(moves, t)
        c, s = math.cos(math.radians(m['rot'])), math.sin(math.radians(m['rot']))
        a = {k: value_at(angle[k], t) for k in LEGS}
        feet = {f: boot(rig, f, a['Leg' + f], a['Shin' + f]) for f in 'FB'}
        # down so that boot touches its lane: (p + (0, y) - origin) turned, squashed, + origin
        lift = {f: ((lane[f] - oy) / m['sy'] - (feet[f][0] - ox) * s) / c - (feet[f][1] - oy) for f in 'FB'}
        down = min(lift.values())
        seen = lambda f: ox + m['sx'] * ((feet[f][0] - ox) * c - (feet[f][1] + down - oy) * s)
        now = [st for st in order if st[0] <= t + 1e-9]
        if now and any(w0 <= t <= w1 for w0, w1, _ in walks):
            if now[-1] != stance:
                stance = now[-1]
                plant = track + seen(stance[1])                    # where that boot stands
            track = plant - seen(stance[1])
            hover = max(hover, (lift[stance[1]] - down) / H)
        xs.append((t, track / H))
        ys.append((t, down / H))
    assert abs(xs[-1][1]) < 1e-6, 'he comes back to where he started: %f' % xs[-1][1]
    assert abs(ys[-1][1]) < 1e-9 and abs(ys[0][1]) < 1e-9, 'standing at rest at both ends of the loop'
    return xs, ys, hover

# ---------- to CSS ----------
def pct(t):
    return ('%.3f' % (100.0 * t / LOOP)).rstrip('0').rstrip('.') + '%'
def num(v, places=3):
    v = round(v, places)
    return ('%.*f' % (places, v)).rstrip('0').rstrip('.') if v != int(v) else str(int(v))

def mover_css(name='vbMove'):
    ks = mover_keys()
    assert ks[0][0] == 0 and ks[0][1][0] == ks[-1][1][0], 'the loop starts and ends the same'
    rows = ['  %s{ transform:translate(0,%s) scale(%s,%s) rotate(%sdeg); animation-timing-function:%s; }'
            % (pct(t), '%spx' % num(s['ty']) if s['ty'] else '0', num(s['sx']), num(s['sy']), num(s['rot']), e)
            for t, (s, e) in ks]
    return '@keyframes %s{\n' % name + '\n'.join(rows) + '\n}'

def part_css(part, name=''):
    if part in LEGS:
        value = lambda v: 'rotate(calc(var(--vb-swing, 1) * %sdeg))' % num(v, 2)
        ks = one_per_time(legs[name][part], 0)
    else:
        value = lambda v: 'rotate(%sdeg)' % num(v)
        ks = one_per_time(ch[part], 0)
    ease = lambda e: '' if e == LIN else ' animation-timing-function:%s;' % e          # the animation is linear
    return '@keyframes vb%s%s{ %s }' % (part, name, ' '.join('%s{ transform:%s;%s }' % (pct(t), value(v), ease(e)) for t, v, e in ks))

def held_css(name, rows):
    """Keyframes whose values hold until the next one (a flip book); of two at
    the same moment, the later."""
    last = {}
    for t, css in rows:
        last[pct(t)] = (t, css)
    return '@keyframes %s{ %s }' % (name, ' '.join('%s{ %s animation-timing-function:steps(1, end); }' % (k, css) for k, (t, css) in sorted(last.items(), key=lambda kv: kv[1][0])))

def drawn_css(tier, data):
    """An outfit with a drawn walk (images/vaultboy/walk-lvlXX.png, its drawings
    side by side, each as high as the frame): while he walks, the drawings in turn (.vb-walk)
    and the parts hidden (.vb-breathe); where he is moves on at each drawing,
    as far as tools/vaultboy-walk.py measured; the rest of the loop as for the
    parts, from the drawn timeline (vbMoveDrawn, vbArmDrawn, vbHeadDrawn)."""
    n, pos, turn = data['frames'], data['position'], data.get('turn', 0)
    N = n + turn                                                   # the strip: the walk's drawings, then the turn's
    own = RIGS[0][1]                                               # the drawings' frame: the outfits'
    fit = BORROW.get(tier)
    k = (own['tall'] / own['H']) / (fit['tall'] / fit['H']) if fit else 1.0   # this frame's px a drawing px
    cycle, H = pos[n], float(fit['H'] if fit else own['H']) / k
    track, show, parts_ = [(0, 0.0)], [(0, (0, 0))], [(0, 1)]
    base = 0.0
    for start, end, face in walks:
        sign = 1 if face == RIGHT else -1
        for i in range(turn):                                      # facing us to the side (the turn backwards)
            show.append((start - TURN_TIME + i * TURN_FRAME, (1, N - 1 - i)))
        for j in range(DRAWN_FRAMES):
            track.append((start + j * FRAME, base + sign * ((j // n) * cycle + pos[j % n]) / H))
            show.append((start + j * FRAME, (1, j % n)))
        for i in range(turn):                                      # stopped, he turns to us
            show.append((end + i * TURN_FRAME, (1, n + i)))
        show.append((end + turn * TURN_FRAME, (0, 0)))
        parts_ += [(start - turn * TURN_FRAME, 0), (end + turn * TURN_FRAME, 1)]
        base += sign * DRAWN_STEPS * cycle / 2 / H
    assert abs(base) < 1e-9, 'he comes back to where he started'
    track.append((LOOP, 0.0)); show.append((LOOP, (0, 0))); parts_.append((LOOP, 1))
    span = max(v for _, v in track)
    t = '.vaultboy[data-tier="%s"]' % tier
    legs_ = ', '.join('%s .%s' % (t, cls) for part, cls in PARTS if part in LEGS)
    track_css = held_css('vbTrack' + tier, [(at_, 'transform:translateX(calc(var(--vb-h) * var(--vb-swing, 1) * %s));' % num(v, 4)) for at_, v in track])
    if fit:                                                        # the source's drawings and timing, his own track
        src = fit['of']
        box = (fit['belt'] - (data['belt'] - data['left']) * k, fit['sole'] - own['soleF'][1] * k, data['width'] * k, own['H'] * k)
        return [
            '%s .vb-track{ animation-name:vbTrack%s; }' % (t, tier),
            '%s .vb-move{ animation-name:vbMoveDrawn; }' % t,
            '%s .vb-body{ animation:none; }' % t,
            '%s .vb-arm{ animation-name:vbArmDrawn; }' % t,
            '%s .vb-head{ animation-name:vbHeadDrawn; }' % t,
            '%s{ animation:none; }' % legs_,
            '%s .vb-breathe{ animation:mascotBreathe 4.2s ease-in-out infinite, vbParts%s %s linear infinite; }' % (t, src, length),
            '%s .vb-walk{ left:%s%%; right:auto; width:%s%%; top:%s%%; bottom:auto; height:%s%%; background-image:url(../images/vaultboy/walk-lvl%s.png); background-size:%d%% 100%%; animation:vbWalk%s %s linear infinite; }'
            % (t, num(100.0 * box[0] / fit['W'], 3), num(100.0 * box[2] / fit['W'], 3), num(100.0 * box[1] / fit['H'], 3),
               num(100.0 * box[3] / fit['H'], 3), src, 100 * N, src, length),
            '%s{ --vb-span:%s; }' % (t, num(span, 4)),
            track_css,
        ]
    return [
        '%s .vb-track{ animation-name:vbTrack%s; }' % (t, tier),
        '%s .vb-move{ animation-name:vbMoveDrawn; }' % t,
        '%s .vb-body{ animation:none; }' % t,
        '%s .vb-arm{ animation-name:vbArmDrawn; }' % t,
        '%s .vb-head{ animation-name:vbHeadDrawn; }' % t,
        '%s{ animation:none; }' % legs_,
        '%s .vb-breathe{ animation:mascotBreathe 4.2s ease-in-out infinite, vbParts%s %s linear infinite; }' % (t, tier, length),
        '%s .vb-walk{ left:%s%%; right:auto; width:%s%%; background-image:url(../images/vaultboy/walk-lvl%s.png); background-size:%d%% 100%%; animation:vbWalk%s %s linear infinite; }'
        % (t, num(100.0 * data['left'] / 308, 3), num(100.0 * data['width'] / 308, 3), tier, 100 * N, tier, length),
        '%s{ --vb-span:%s; }' % (t, num(span, 4)),
        track_css,
        held_css('vbWalk' + tier, [(at_, 'opacity:%d; background-position:%s 0;' % (o, '%s%%' % num(100.0 * k / (N - 1), 4) if k else '0'))
                                   for at_, (o, k) in show]),
        held_css('vbParts' + tier, [(at_, 'opacity:%d;' % o) for at_, o in parts_]),
    ]

def knee_css(sel, rig):
    """A bent knee folds like a drawn one: the shin's corner never shows as
    a square step over the thigh. Each shin sits in a .vb-knee box that turns
    with the thigh and hides it above the knee line, as wide as the thigh
    there (so never the boot, never past the thigh's outline): the back of
    the knee folds into a V, its front shows the thigh's round end
    (tools/vaultboy-parts.py round_end())."""
    rows = []
    for f, cls in (('F', 'vb-leg-front'), ('B', 'vb-leg-back')):
        hip, knee = rig['hip' + f], rig['knee' + f]
        L = math.dist(hip, knee)
        u = ((knee[0] - hip[0]) / L, (knee[1] - hip[1]) / L)
        across = (-u[1], u[0])                                     # behind him, as drawn
        behind, ahead = rig['thigh' + f]
        pts = [(knee[0] + o * across[0] - a * u[0], knee[1] + o * across[1] - a * u[1])
               for o, a in ((behind, 0), (behind, L), (-ahead, L), (-ahead, 0))]
        pts = ['%s%% %s%%' % (num(100.0 * x / rig['W'], 2), num(100.0 * y / rig['H'], 2)) for x, y in pts]
        rows.append('%s.%s > .vb-knee{ clip-path:polygon(evenodd, -100%% -100%%, 200%% -100%%, 200%% 200%%, -100%% 200%%, -100%% -100%%, %s); }'
                    % (sel, cls, ', '.join(pts + pts[:1])))
    return rows

def lengths_css(name, samples, tol, fmt):
    rows = ['%s{ transform:%s; }' % (pct(t), fmt(num(v, 4))) for t, v in simplified(samples, tol)]
    return '@keyframes %s{ %s }' % (name, ' '.join(rows))

length = num(LOOP) + 's'
t = timeline()
out = ['''/* The Vault Boy's walk on the level bar, made by tools/vaultboy-moves.py:
   change it there, not here. One loop, every element the same length so they
   stay together (they all start when he shows). Where he is along the gauge
   and his body's height come from his legs, his boots planted: vbLegF...
   vbTrack, vbBody for the outfits that walk in parts; --vb-span: how far he
   goes, in frame heights. */''',
       '.vb-track{ animation:vbTrack %s linear infinite; }' % length,
       '.vb-move{ animation:vbMove %s linear infinite; }' % length,
       '.vb-body{ animation:vbBody %s linear infinite; }' % length]
for part, cls in PARTS:
    out.append('.%s{ animation:vb%s %s linear infinite; }' % (cls, part, length))
spans = {}
for suffix, rig in RIGS:
    xs, ys, hover = planted(suffix, rig)
    print('rig %s: the boot with the weight at most %.2f%% of his height above the gauge' % (suffix or 'outfits', 100 * hover))
    assert hover < HOVER, 'the boot with the weight must be the lower one'
    spans[suffix] = max(v for _, v in xs)
    out.append(lengths_css('vbTrack' + suffix, xs, 0.0005,
                           lambda v: 'translateX(calc(var(--vb-h) * var(--vb-swing, 1) * %s))' % v))
    out.append(lengths_css('vbBody' + suffix, ys, 0.0003, lambda v: 'translateY(calc(var(--vb-h) * %s))' % v))
out += knee_css('', RIGS[0][1])
out.append('.vaultboy{ --vb-span:%s; }' % num(spans[''], 4))
out += [mover_css()] + [part_css(p) for p, _ in PARTS]
if WALKS:
    out.append('''/* The outfits with a drawn walk (tools/vaultboy-walk.py), and the original
   Vault Boy with level 5's (BORROW): the same moves at the same moments, but
   while he walks, his drawings in turn instead of the parts (DRAWN_STEPS
   steps, longer than the parts' steps). */''')
    timeline(drawn=True)
    for tier in sorted(WALKS):
        out += drawn_css(tier, WALKS[tier])
    for tier, fit in sorted(BORROW.items()):
        out += drawn_css(tier, WALKS[fit['of']])
    out += [mover_css('vbMoveDrawn'), part_css('Arm', 'Drawn'), part_css('Head', 'Drawn')]
out.append("/* End of the Vault Boy's walk made by tools/vaultboy-moves.py. */")

text = open(CSS).read()
START, END = "/* The Vault Boy's walk on the level bar", "/* End of the Vault Boy's walk made by tools/vaultboy-moves.py. */"
a = text.index(START)
b = text.index(END, a) + len(END)
open(CSS, 'w').write(text[:a] + '\n'.join(out) + text[b:])
print('wrote the Vault Boy walk into', os.path.relpath(CSS, ROOT), '(%s loop, last move ends at %.2f s; the parts\' span %.3f frame heights)'
      % (length, t, spans['']))
