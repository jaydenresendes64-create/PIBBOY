"""
Writes the Vault Boy's walk on the 3D level gauge into css/terminal.css: one
loop that never stops, in the cartoon style of the old mascot's moves
(tools/mascot-moves.py): a wind-up, six quick steps, a brake, a look around,
a thumbs-up, a spin like a flat card to turn round, the same back, another
look and thumbs-up, a spin.

He really walks: his boots don't slide. The walk is worked out the way it is
animated by hand, from where the boots go: one boot stands still on the
gauge while the other swings forward in an arc, lifted off it, and lands a
step ahead; each step as long as the last, both legs alike, the body going
on at an even speed (it gets going and slows down at the ends) and bobbing
a little (lowest when both boots are down). The legs' angles come from that
(each leg a thigh and a shin reaching the boot, the knee to his front:
reach()). Then what the page will draw is checked back from the legs alone,
for each rig (the outfits', and the original Vault Boy's for levels 1-4),
from the joints and soles of his boots (RIGS): where he is along the gauge
(.vb-track) so that the boot with the weight stays put, and how high his
body is (.vb-body) so that the lower boot is on its lane of the gauge's top
(the back foot stands a little further back, so a little higher).

Every element of the rig gets one animation of the same length, so they stay
together: .vb-track, .vb-move (which way he faces, squash and stretch, the
lean), .vb-body, and each part (degrees: a positive angle swings a leg or
the thumb arm to his front, a negative one bends a knee). He faces left as
drawn; scale(-1,1) turns him to the right. Lengths are shares of his frame's
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
STEPS, STEP = 6, 0.28      # each way: quick steps (the old mascot's took 0.25 s); the last one lands the front boot
SPAN = 69                   # page pixels he goes each way (frame 100px high): a 390px-wide screen's room
LIFT = 3.8                  # page pixels: how high the swinging boot goes
BOB = (0.95, 0.36)          # page pixels his body is lower than standing: both boots down, one boot under him
HOVER = 0.002               # at most this share of his height between the boot with the weight and the gauge
DRAWN_STEPS = 4             # each way, for an outfit with a walking drawing (tools/vaultboy-walk.py), at the parts' pace
DRAWN_LIFT = 11.0           # px the swinging boot goes up (its leg shortened to clear the gauge)
DRAWN_ARM = 16.0            # degrees the arms swing either way
DRAWN_DOUBLE = 0.10         # of a step, both boots down after one lands
DRAWN_EASE = 0.16           # of the walk, speeding up at its start and slowing down at its end
WALK_DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vaultboy-walk.json')
WALKS = json.load(open(WALK_DATA)) if os.path.exists(WALK_DATA) else {}   # tools/vaultboy-walk.py: the outfits with one
RATE = 250                  # samples a second (STEP and 0.12 s fall on it)
RIGHT, LEFT = -1, 1         # scale x to face that way
LEAN = -1                   # degrees: he leans into the walk

# Each rig, in pixels of its picture: the hips and knees (the joints the
# cutting tools use: tools/vaultboy-parts.py JOINTS, tools/mascot-parts.py
# JOINTS doubled), the middle of each boot's sole, the picture's height, and
# the point .vb-move turns and squashes him around (css/terminal.css: 55%
# 97.9% of the 308px-wide frame, 52% 96.3% of the original's 288px), and
# how tall his frame is on the page (--vb-h: the original's is taller, so
# that he stands as tall). Each rig gets its own legs' angles.
RIGS = [
    ('', dict(H=420, hipF=(160, 277), kneeF=(145, 326), soleF=(117.5, 411),
              hipB=(215, 277), kneeB=(211, 326), soleB=(230.5, 401), origin=(0.55 * 308, 0.979 * 420), tall=100)),
    ('Old', dict(H=408, hipF=(140, 286), kneeF=(131, 328.6), soleF=(108.5, 393),
                 hipB=(188, 286), kneeB=(186.6, 328), soleB=(202, 384), origin=(0.52 * 288, 0.963 * 408), tall=117)),
]

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
    ahead, down = hip[0] - foot[0], foot[1] - hip[1]                # he faces left
    d = min(math.hypot(ahead, down), l1 + l2 - 1e-9)
    line = math.atan2(ahead, down)                                  # from the hip to the boot, from straight down
    thigh = line + math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))
    shin = line - math.acos((l2 * l2 + d * d - l1 * l1) / (2 * l2 * d))
    drawn = lambda a, b: math.atan2(a[0] - b[0], b[1] - a[1])        # as drawn, from straight down
    leg = math.degrees(thigh - drawn(hip, knee))
    return leg, math.degrees(shin - drawn(knee, sole)) - leg

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
    """A wind-up, STEPS steps from `start` (the back boot first), the stop:
    each rig's legs (strides()); the arm swings against the legs and the head
    bobs a beat late. Steps start on the RATE grid, so both ways are worked
    out alike. drawn: an outfit with a drawn walk (tools/vaultboy-walk.py),
    DRAWN_STEPS steps of its walking parts, the standing ones hidden (drawn_css())."""
    start = round(start * RATE) / RATE
    if drawn:
        end = start + DRAWN_STEPS * STEP
        at(start, IO, sx=face, sy=1, ty=0, rot=0)
        at(end, OUT, sx=face, sy=1, rot=0)
        key('Arm', start, 0); key('Arm', end + 0.12, 0)
        key('Head', start, 0); key('Head', end + 0.08, -2); key('Head', end + 0.25, 0)
        at(end + 0.08, IO, sx=face, sy=0.97, rot=1)                # brakes, the parts back: leans back, squashes
        at(end + 0.18, IO, sx=face, sy=1.01, rot=-0.3)
        at(end + 0.26, IO, sx=face, sy=1, rot=0)
        walks.append((start, end, face))
        return end + 0.26
    at(start, IO, sx=face, sy=1, ty=0, rot=0)
    at(start + 0.08, IO, sx=face, sy=0.98, rot=1.5)               # wind-up: leans back, dips
    c0 = start + 0.12
    at(c0, LIN, sx=face, sy=1, rot=LEAN)                           # leans into the walk
    contacts = [c0 + i * STEP for i in range(STEPS + 1)]
    end = contacts[-1]
    at(end, OUT, sx=face, sy=1, rot=LEAN)
    steps.append((start, 'F'))                                     # both down at first: the front one stays
    for i, c in enumerate(contacts[:-1]):
        swinging = 'B' if i % 2 == 0 else 'F'                      # the back boot first, the front one lands last
        steps.append((c, 'F' if swinging == 'B' else 'B'))         # the other one has the weight
        key('Arm', c + 0.03, 6 if swinging == 'B' else -6)
        key('Head', c + 0.05, 2 if swinging == 'B' else -2)
    for name, rig in RIGS:
        strides(rig, legs[name], start, contacts)
    key('Arm', start, 0); key('Arm', end + 0.12, 0)
    key('Head', start, 0); key('Head', end + 0.08, -2); key('Head', end + 0.25, 0)
    at(end + 0.08, IO, sx=face, sy=0.97, rot=1)                    # brakes: leans back, squashes
    at(end + 0.18, IO, sx=face, sy=1.01, rot=-0.3)
    at(end + 0.26, IO, sx=face, sy=1, rot=0)
    walks.append((start, end, face))                               # then both boots are down: he stays there
    return end + 0.26

def strides(rig, into, start, contacts):
    """One rig's legs for a walk (see the top): where the boots go, then the angles."""
    c0, end, last = contacts[0], contacts[-1], contacts[-2]
    # Lengths ahead (picture pixels, he faces left): a step, his speed, where
    # each boot stands at rest from its hip (the back one behind it: below 0).
    px = rig['H'] / float(rig['tall'])                             # picture pixels in a page pixel (frame 100px high)
    step = SPAN * px / STEPS
    speed = step / STEP
    rest = {f: rig['hip' + f][0] - rig['sole' + f][0] for f in 'FB'}
    def hermite(u, a, b, va, vb, T):                               # from a to b, at those speeds, in T
        return (2*u**3 - 3*u*u + 1) * a + (u**3 - 2*u*u + u) * va * T + (-2*u**3 + 3*u*u) * b + (u**3 - u*u) * vb * T
    shift = step / 2 + rest['B']                                   # the wind-up: onto the front boot, both down
    def body(t):                                                   # how far ahead he is
        if t <= c0:
            return hermite((t - start) / (c0 - start), 0, shift, 0, speed, c0 - start)
        if t <= last:
            return shift + speed * (t - c0)
        a = shift + speed * (last - c0)
        return hermite((t - last) / STEP, a, a + step / 2 - rest['B'], speed, 0, STEP)
    low, high = BOB[0] * px, BOB[1] * px
    def drop(t):                                                   # how much lower than standing
        if t <= c0:
            return low * smooth((t - start) / (c0 - start))
        if t >= last:
            return low * (1 - smooth((t - last) / STEP))
        u = ((t - c0) % STEP) / STEP
        return low - (low - high) * math.sin(math.pi * u) ** 2
    # Each boot: where it stands (ahead), then, swinging, from there to where it lands.
    swings = {'F': [], 'B': []}
    stand = {f: -rig['sole' + f][0] for f in 'FB'}
    for i, (c, nxt) in enumerate(zip(contacts, contacts[1:])):
        f = 'B' if i % 2 == 0 else 'F'
        lands = body(nxt) - rig['hip' + f][0] + (rest[f] if nxt == end else step / 2)
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
            gx, gy = -ahead + body(t) - ox, (rig['sole' + f][1] - up - oy) / m['sy']
            x, y = turned((gx, gy), (0, 0), -m['rot'])
            leg, shin = reach(rig, f, (ox + x, oy + y - drop(t)))
            angles['Leg' + f].append((t, leg))
            angles['Shin' + f].append((t, shin))
    # From standing as drawn (0: a front leg may be drawn a hair past straight)
    # in the wind-up; back to it while he brakes, both boots down.
    for k, samples in angles.items():
        a0 = samples[0][1]
        for j, (t, v) in enumerate(samples):
            samples[j] = (t, v - a0 * (1 - smooth(min(1.0, (t - start) / (c0 - start)))))
        kept = simplified(samples, 0.15)
        for t, v in kept[:-1]:
            into[k].append((t, round(v, 3), LIN))
        into[k].append((end, round(kept[-1][1], 3), IO))
        into[k].append((end + 0.26, 0, IO))

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

# ---------- the loop: from the left end, facing right ----------
def timeline(drawn=False):
    """The whole loop's keys, for the parts' walk or a drawn one: the same
    moves at the same moments, a drawn walk being shorter, he waits longer
    between them."""
    global ch, legs, mover, steps, walks
    ch, legs = {k: [] for k, _ in PARTS}, {name: {k: [] for k in LEGS} for name, _ in RIGS}
    mover, steps, walks = [], [], []
    wait = (0.12 + STEPS * STEP - DRAWN_STEPS * STEP) / 2 if drawn else 0
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

def drawn_walk(data):
    """One walk of the walking parts (tools/vaultboy-walk.json: joints, boots,
    lanes, in px of the 420 frame, facing left): from the drawn pose (a
    contact, the near boot just down in front, the far one on its toe behind)
    DRAWN_STEPS steps, back to it. The body goes on at the walk's speed (it
    gets going and slows down at the ends); each boot, once down, stays where
    it is, flat, then rolls up on its toe as the leg goes behind; it lands
    ahead of its hip as the drawn near boot is (the legs slanting alike); the
    body is as high as the more upright leg holds it (the legs don't bend);
    the swinging boot goes up DRAWN_LIFT in an arc, its leg shortened to it;
    the arms swing against the legs. [(t, {x, dy, legs: {N/F: (turn, shorten,
    boot)}, arms: (near, far)})], RATE times a second."""
    J = {k: tuple(v) for k, v in data['joints'].items()}
    T = DRAWN_STEPS * STEP
    sub = lambda a, b: (a[0] - b[0], a[1] - b[1])
    length = lambda d: math.hypot(d[0], d[1])
    slant = lambda d: math.degrees(math.atan2(-d[0], d[1]))            # from straight down, forward (left) positive
    L = {f: length(sub(J['ankle' + f], J['hip' + f])) for f in 'NF'}
    rest = {f: slant(sub(J['ankle' + f], J['hip' + f])) for f in 'NF'}
    tau = data['tau']
    reach = {f: (data['foot'][f]['toe'], -data['foot'][f]['up']) for f in 'NF'}   # toe to ankle, the boot flat
    def heel_up(v, g):                                                  # the boot turned heel-up by g about its toe
        return turned(v, (0, 0), -g)
    def ankle(f, toe, g):
        r = heel_up(reach[f], g); return (toe[0] + r[0], toe[1] + r[1])
    toe0 = {f: sub(J['ankle' + f], heel_up(reach[f], tau[f])) for f in 'NF'}   # the drawn boots' toes; their lanes
    lane = {f: toe0[f][1] for f in 'NF'}
    # the body's way: speeding up, steady, slowing down; DRAWN_STEPS steps long
    n = int(round(T * RATE))
    ramp = lambda u: smooth(min(1.0, u / DRAWN_EASE)) * smooth(min(1.0, (1 - u) / DRAWN_EASE))
    speeds = [ramp(i / float(n)) for i in range(n + 1)]
    dist = [0.0]
    for i in range(n): dist.append(dist[-1] + (speeds[i] + speeds[i + 1]) / 2)
    step = 2 * L['N'] * math.sin(math.radians(rest['N']))             # a step: the near leg slants as drawn, front and back
    scale = DRAWN_STEPS * step / dist[-1]
    xs = [d * scale for d in dist]
    hip = lambda f, i, dy: (J['hip' + f][0] - xs[i], J['hip' + f][1] + dy)
    # where each boot is down: (from sample, toe); the near one lands at contacts 0, 2, 4.., the far one 1, 3..
    lean = math.radians(rest['N'])
    down = {'N': [], 'F': [(None, toe0['F'])]}
    for k in range(DRAWN_STEPS + 1):
        f = 'N' if k % 2 == 0 else 'F'
        i = int(round(k * STEP * RATE))
        if k == 0: down['N'].append((0, toe0['N'])); continue
        h = hip(f, i, 0)
        a = (h[0] - L[f] * math.sin(lean), 0)
        down[f].append((i, (a[0] - reach[f][0], lane[f])))
    lift = lambda landed: (landed if landed is not None else -int(round(STEP * RATE))) + int(round(STEP * (1 + DRAWN_DOUBLE) * RATE))
    def flat_dy(f, toe, i):                                              # body drop with that boot flat, its leg its full length
        a = ankle(f, toe, 0); hx = J['hip' + f][0] - xs[i]
        return a[1] - math.sqrt(max(L[f] ** 2 - (hx - a[0]) ** 2, 0)) - J['hip' + f][1]
    def fit(f, toe, h):                                                 # a boot down: heel-up, or its leg a hair shorter or longer
        gap = lambda g: length(sub(ankle(f, toe, g), h)) - L[f]
        d0 = gap(0.0)
        if d0 <= 0: return 0.0, (L[f] + d0) / L[f]                       # flat reaches: the leg a hair shorter
        prev = 0.0
        for g in range(1, 86):                                          # the least heel-up that reaches
            if gap(float(g)) <= 0:
                lo, hi = prev, float(g)
                for _ in range(40):
                    m = (lo + hi) / 2
                    if gap(m) > 0: lo = m
                    else: hi = m
                return hi, 1.0
            prev = float(g)
        return 0.0, (L[f] + d0) / L[f]                                  # rolling can't (a boot in front): a hair longer
    blend = int(round(STEP * DRAWN_DOUBLE * RATE))
    out = []
    for i in range(n + 1):
        state, landed_at = {}, {}
        for f in 'NF':
            ds = down[f]
            j = max(q for q, (at_, _) in enumerate(ds) if at_ is None or at_ <= i)
            landed, toe = ds[j]
            landed_at[f] = landed if landed is not None else -10 ** 6
            nxt = ds[j + 1] if j + 1 < len(ds) else None
            if nxt is None or i < lift(landed): state[f] = ('down', toe)
            else:
                l0 = lift(landed)
                state[f] = ('swing', toe, nxt[1], (i - l0) / float(nxt[0] - l0), l0)
        # the body: as high as the boot down in front (the last one down) holds it, flat; when one lands, from
        # the other's height to its own while both are down
        downs = sorted((f for f in 'NF' if state[f][0] == 'down'), key=lambda f: landed_at[f])
        lead = downs[-1]
        dy = flat_dy(lead, state[lead][1], i)
        if len(downs) == 2 and 0 < landed_at[lead] < n and i - landed_at[lead] < blend:   # not the drawn pose at either end
            other = downs[0]
            w = smooth((i - landed_at[lead]) / float(blend))
            dy = flat_dy(other, state[other][1], i) * (1 - w) + dy * w
        legs_ = {}
        for f in 'NF':
            h = hip(f, i, dy)
            if state[f][0] == 'down':
                g, k = fit(f, state[f][1], h); a = ankle(f, state[f][1], g)
            else:
                _, t0, t1, u, l0 = state[f]
                g0 = fit(f, t0, hip(f, l0, dy))[0]
                a0, a1 = ankle(f, t0, g0), ankle(f, t1, 0)
                e = smooth(u)
                a = (a0[0] + (a1[0] - a0[0]) * e, a0[1] + (a1[1] - a0[1]) * e - DRAWN_LIFT * math.sin(math.pi * u))
                g = g0 * (1 - e)
                k = min(1.0, length(sub(a, h)) / L[f])
            turn = slant(sub(a, h)) - rest[f]
            legs_[f] = (turn, k, tau[f] - g - turn)
        swing = DRAWN_ARM * math.cos(math.pi * i / (STEP * RATE)) * speeds[i]
        out.append((i / float(RATE), dict(x=xs[i], dy=dy, legs=legs_, arms=(-swing, swing))))
    return out, rest

def drawn_css(tier, data):
    """An outfit with a walking drawing (images/vaultboy/walk-lvlXX.png, 7
    parts, tools/vaultboy-walk.py): while he walks, its parts (.vw-rig) and
    the standing ones hidden (.vb-breathe); drawn_walk() for each walk of the
    drawn timeline (the track, the body's height, each leg's turn and
    shortening along itself, the boots, the arms); the rest of the loop as for
    the parts (vbMoveDrawn, vbArmDrawn, vbHeadDrawn)."""
    W, H = float(data['width']), float(RIGS[0][1]['H'])
    J = data['joints']
    samples, rest = drawn_walk(data)
    T = DRAWN_STEPS * STEP
    chans = dict(track=[(0, 0.0)], body=[(0, 0.0)], show=[(0, 0)], parts=[(0, 1)],
                 legN=[(0, (0.0, 1.0))], legF=[(0, (0.0, 1.0))], bootN=[(0, 0.0)], bootF=[(0, 0.0)], armN=[(0, 0.0)], armF=[(0, 0.0)])
    base = 0.0
    for start, end, face in walks:
        sign = 1 if face == RIGHT else -1
        for tt, st in samples:
            at_ = start + tt
            chans['track'].append((at_, base + sign * st['x'] / H))
            chans['body'].append((at_, st['dy'] / H))
            for f in 'NF':
                chans['leg' + f].append((at_, st['legs'][f][:2])); chans['boot' + f].append((at_, st['legs'][f][2]))
            chans['armN'].append((at_, st['arms'][0])); chans['armF'].append((at_, st['arms'][1]))
        chans['show'] += [(start, 1), (end, 0)]
        chans['parts'] += [(start, 0), (end, 1)]
        base += sign * samples[-1][1]['x'] / H
    assert abs(base) < 1e-9, 'he comes back to where he started'
    for c in chans.values():
        last = c[-1][1]; c.append((LOOP, last))
    span = max(v for _, v in chans['track'])
    def flow(name, rows, tol, fmt):
        """Linear keyframes, the fewest that stay within tol of the samples (each value of a tuple)."""
        vals = [r[1] if isinstance(r[1], tuple) else (r[1],) for r in rows]
        keep = set()
        for c in range(len(vals[0])):
            for t_, _ in simplified([(rows[q][0], vals[q][c]) for q in range(len(rows))], tol[c]):
                keep.add(t_)
        picked = [(t_, v) for (t_, v) in rows if t_ in keep]
        seen = {}
        for t_, v in picked: seen[pct(t_)] = (t_, v)
        tup = lambda v: v if isinstance(v, tuple) else (v,)
        return '@keyframes %s{ %s }' % (name, ' '.join('%s{ transform:%s; }' % (k, fmt(tup(v))) for k, (t_, v) in sorted(seen.items(), key=lambda kv: kv[1][0])))
    t = '.vaultboy[data-tier="%s"]' % tier
    legs_ = ', '.join('%s .%s' % (t, cls) for part, cls in PARTS if part in LEGS)
    o = lambda name: '%s%% %s%%' % (num(100.0 * J[name][0] / W, 3), num(100.0 * J[name][1] / H, 3))
    leg_fmt = lambda f: (lambda v: 'rotate(%sdeg) rotate(%sdeg) scaleY(%s) rotate(%sdeg)' % (num(v[0], 2), num(rest[f], 2), num(v[1], 4), num(-rest[f], 2)))
    return [
        '%s .vb-track{ animation-name:vbTrack%s; }' % (t, tier),
        '%s .vb-move{ animation-name:vbMoveDrawn; }' % t,
        '%s .vb-body{ animation:none; }' % t,
        '%s .vb-arm{ animation-name:vbArmDrawn; }' % t,
        '%s .vb-head{ animation-name:vbHeadDrawn; }' % t,
        '%s{ animation:none; }' % legs_,
        '%s .vb-breathe{ animation:mascotBreathe 4.2s ease-in-out infinite, vbParts%s %s linear infinite; }' % (t, tier, length),
        '%s .vw-rig{ display:block; width:%s%%; animation:vbWalk%s %s linear infinite; }' % (t, num(100.0 * W / 308, 3), tier, length),
        '%s .vw-pic{ background-image:url(../images/vaultboy/walk-lvl%s.png); }' % (t, tier),
        '%s .vw-body{ animation:vbBody%s %s linear infinite; }' % (t, tier, length),
        '%s .vw-legN{ transform-origin:%s; animation:vbLegN%s %s linear infinite; }' % (t, o('hipN'), tier, length),
        '%s .vw-legF{ transform-origin:%s; animation:vbLegF%s %s linear infinite; }' % (t, o('hipF'), tier, length),
        '%s .vw-bootN{ transform-origin:%s; animation:vbBootN%s %s linear infinite; }' % (t, o('ankleN'), tier, length),
        '%s .vw-bootF{ transform-origin:%s; animation:vbBootF%s %s linear infinite; }' % (t, o('ankleF'), tier, length),
        '%s .vw-armN{ transform-origin:%s; animation:vbArmN%s %s linear infinite; }' % (t, o('shoulderN'), tier, length),
        '%s .vw-armF{ transform-origin:%s; animation:vbArmF%s %s linear infinite; }' % (t, o('shoulderF'), tier, length),
        '%s{ --vb-span:%s; }' % (t, num(span, 4)),
        flow('vbTrack' + tier, chans['track'], (0.0005,), lambda v: 'translateX(calc(var(--vb-h) * var(--vb-swing, 1) * %s))' % num(v[0], 4)),
        flow('vbBody' + tier, chans['body'], (0.0003,), lambda v: 'translateY(calc(var(--vb-h) * %s))' % num(v[0], 4)),
        flow('vbLegN' + tier, chans['legN'], (0.15, 0.002), leg_fmt('N')),
        flow('vbLegF' + tier, chans['legF'], (0.15, 0.002), leg_fmt('F')),
        flow('vbBootN' + tier, chans['bootN'], (0.2,), lambda v: 'rotate(%sdeg)' % num(v[0], 2)),
        flow('vbBootF' + tier, chans['bootF'], (0.2,), lambda v: 'rotate(%sdeg)' % num(v[0], 2)),
        flow('vbArmN' + tier, chans['armN'], (0.2,), lambda v: 'rotate(%sdeg)' % num(v[0], 2)),
        flow('vbArmF' + tier, chans['armF'], (0.2,), lambda v: 'rotate(%sdeg)' % num(v[0], 2)),
        held_css('vbWalk' + tier, [(at_, 'opacity:%d;' % o_) for at_, o_ in chans['show']]),
        held_css('vbParts' + tier, [(at_, 'opacity:%d;' % o_) for at_, o_ in chans['parts']]),
    ]

def lengths_css(name, samples, tol, fmt):
    rows = ['%s{ transform:%s; }' % (pct(t), fmt(num(v, 4))) for t, v in simplified(samples, tol)]
    return '@keyframes %s{ %s }' % (name, ' '.join(rows))

length = num(LOOP) + 's'
t = timeline()
out = ['''/* The Vault Boy's walk on the level bar, made by tools/vaultboy-moves.py:
   change it there, not here. One loop, every element the same length so they
   stay together (they all start when he shows). Where he is along the gauge
   and his body's height come from his legs, his boots planted. Each rig its
   own legs, track and body: vbLegF... vbTrack, vbBody for the outfits,
   vbLegFOld... vbTrackOld, vbBodyOld for the original Vault Boy; --vb-span:
   how far he goes, in frame heights. */''',
       '.vb-track{ animation:vbTrack %s linear infinite; }' % length,
       '.vb-move{ animation:vbMove %s linear infinite; }' % length,
       '.vb-body{ animation:vbBody %s linear infinite; }' % length]
for part, cls in PARTS:
    out.append('.%s{ animation:vb%s %s linear infinite; }' % (cls, part, length))
out.append('.vaultboy[data-tier="00"] .vb-track{ animation-name:vbTrackOld; }')
out.append('.vaultboy[data-tier="00"] .vb-body{ animation-name:vbBodyOld; }')
for part, cls in PARTS:
    if part in LEGS:
        out.append('.vaultboy[data-tier="00"] .%s{ animation-name:vb%sOld; }' % (cls, part))
spans = {}
for suffix, rig in RIGS:
    xs, ys, hover = planted(suffix, rig)
    print('rig %s: the boot with the weight at most %.2f%% of his height above the gauge' % (suffix or 'outfits', 100 * hover))
    assert hover < HOVER, 'the boot with the weight must be the lower one'
    spans[suffix] = max(v for _, v in xs)
    out.append(lengths_css('vbTrack' + suffix, xs, 0.0005,
                           lambda v: 'translateX(calc(var(--vb-h) * var(--vb-swing, 1) * %s))' % v))
    out.append(lengths_css('vbBody' + suffix, ys, 0.0003, lambda v: 'translateY(calc(var(--vb-h) * %s))' % v))
out.append('.vaultboy{ --vb-span:%s; }' % num(spans[''], 4))
out.append('.vaultboy[data-tier="00"]{ --vb-span:%s; }' % num(spans['Old'], 4))
out += [mover_css()] + [part_css(p) for p, _ in PARTS] + [part_css(p, 'Old') for p in LEGS]
if WALKS:
    out.append('''/* The outfits with a drawn walk (tools/vaultboy-walk.py): the same moves
   at the same moments, but while he walks, his walking parts instead of the
   standing ones (DRAWN_STEPS steps, his boots planted, his legs straight). */''')
    timeline(drawn=True)
    for tier in sorted(WALKS):
        out += drawn_css(tier, WALKS[tier])
    out += [mover_css('vbMoveDrawn'), part_css('Arm', 'Drawn'), part_css('Head', 'Drawn')]
out.append("/* End of the Vault Boy's walk made by tools/vaultboy-moves.py. */")

text = open(CSS).read()
START, END = "/* The Vault Boy's walk on the level bar", "/* End of the Vault Boy's walk made by tools/vaultboy-moves.py. */"
a = text.index(START)
b = text.index(END, a) + len(END)
open(CSS, 'w').write(text[:a] + '\n'.join(out) + text[b:])
print('wrote the Vault Boy walk into', os.path.relpath(CSS, ROOT), '(%s loop, last move ends at %.2f s; spans %.3f and %.3f frame heights)'
      % (length, t, spans[''], spans['Old']))
