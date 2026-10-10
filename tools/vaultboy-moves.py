"""
Writes the Vault Boy's walk on the level bar into css/terminal.css: one loop
that never stops, in the cartoon style of the old mascot's moves
(tools/mascot-moves.py): a wind-up, four strides with the knees bending and
the body bobbing, a brake, a look around, a thumbs-up, a spin like a flat
card to turn round, the same back, another look and thumbs-up, a spin.

Every element of the rig gets one animation of the same length, so they stay
together: .vb-track (where he is along the free stretch of the bar, as a
share of --vb-len, set by js/render.js), .vb-move (which way he faces,
squash and stretch, the lean), .vb-body (the bob), and each part (degrees:
a positive angle swings a leg or the thumb arm to his front, a negative one
bends a knee). He faces left as drawn; scale(-1,1) turns him to the right.

After a change: python tools/vaultboy-moves.py (plain Python 3), then
node --test. It replaces the part of css/terminal.css between
"/* The Vault Boy's walk on the level bar" and
"/* End of the Vault Boy's walk made by tools/vaultboy-moves.py. */".
"""
import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CSS = os.path.join(ROOT, 'css', 'terminal.css')

IO, OUT, IN, BACK, LIN = ('cubic-bezier(.45,0,.55,1)', 'cubic-bezier(.2,.7,.3,1)',
                          'cubic-bezier(.55,0,.85,.35)', 'cubic-bezier(.34,1.56,.64,1)', 'linear')
PARTS = [('LegF', 'vb-leg-front'), ('ShinF', 'vb-shin-front'), ('LegB', 'vb-leg-back'), ('ShinB', 'vb-shin-back'),
         ('Arm', 'vb-arm'), ('Head', 'vb-head'), ('Body', 'vb-body')]
LOOP = 11.5                 # seconds
STRIDES, STRIDE = 4, 0.42   # each way
RIGHT, LEFT = -1, 1         # scale x to face that way

C1 = dict(LegF=14, ShinF=-4, LegB=-10, ShinB=-14)
C2 = dict(LegF=-10, ShinF=-14, LegB=14, ShinB=-4)
PB = dict(ShinF=0, ShinB=-38)
PF = dict(ShinF=-38, ShinB=0)

ch = {k: [] for k, _ in PARTS}
mover = []                  # (t, {sx, sy, ty, rot}, ease)
track = []                  # (t, share of the stretch, ease)
def key(part, t, v, ease=IO): ch[part].append((t, v, ease))
def pose(t, ease=IO, **vals):
    for k, v in vals.items(): key(k, t, v, ease)
def at(t, ease=IO, **state): mover.append((t, state, ease))

def walk(start, f_from, f_to, face):
    """A wind-up, STRIDES strides from `start`, the stop: the legs swing between
    contacts, the knees bend when passing, the body bobs (down on each contact,
    up when passing), the arm swings and the head bobs a beat late; he goes
    along the bar at an even pace from the first contact to the last."""
    at(start, IO, sx=face, sy=1, ty=0, rot=0)
    at(start + 0.08, IO, sx=face, sy=0.98, rot=1.5)               # wind-up: leans back, dips
    c0 = start + 0.12
    at(c0, LIN, sx=face, sy=1, rot=-1)                             # leans into the walk
    contacts = [c0 + i * STRIDE for i in range(STRIDES + 1)]
    for i, c in enumerate(contacts[:-1]):
        pose(c, **(C1 if i % 2 == 0 else C2))
        key('Arm', c + 0.03, -6 if i % 2 == 0 else 6)
        key('Head', c + 0.05, 3 if i % 2 == 0 else -3)
        key('Body', c, 1)
        pose(c + STRIDE / 2, **(PB if i % 2 == 0 else PF))
        key('Body', c + STRIDE / 2, -1.5)
    end = contacts[-1]
    for k in ('LegF', 'ShinF', 'LegB', 'ShinB'):
        key(k, start, 0); key(k, end, 0)
    key('Arm', start, 0); key('Arm', end + 0.12, 0)
    key('Head', start, 0); key('Head', end + 0.08, -3); key('Head', end + 0.25, 0)
    key('Body', start, 0); key('Body', start + 0.08, 1)
    key('Body', end, 1.5); key('Body', end + 0.12, -0.6); key('Body', end + 0.22, 0)
    track.append((start, f_from, LIN)); track.append((c0, f_from, LIN)); track.append((end, f_to, OUT))
    at(end, OUT, sx=face, sy=1, rot=-1)
    at(end + 0.08, IO, sx=face, sy=0.97, rot=1)                    # brakes: leans back, squashes
    at(end + 0.18, IO, sx=face, sy=1.01, rot=-0.3)
    at(end + 0.26, IO, sx=face, sy=1, rot=0)
    return end + 0.26

def look(t):
    """One way, the other, back."""
    for dt, v, e in [(0, 0, IO), (0.2, -8, IO), (0.4, -8, OUT), (0.6, 7, IO), (0.77, 7, IO), (0.93, 0, IO)]:
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
t = walk(0, 0, 1, RIGHT)                       # to the right end
t = look(t + 0.35)
t = thumbs(t + 0.3, RIGHT)
t = turn(t + 0.35, t + 0.53, RIGHT, LEFT)
t = walk(t + 0.05, 1, 0, LEFT)                 # back to the left end
t = look(t + 0.35)
t = thumbs(t + 0.3, LEFT)
t = turn(t + 0.35, t + 0.53, LEFT, RIGHT)
assert t < LOOP - 0.2, 'the loop is too short: %.2f s' % t
at(LOOP, IO, sx=RIGHT, sy=1, ty=0, rot=0)
track.append((LOOP, 0, LIN))

# ---------- to CSS ----------
def pct(t):
    return ('%.2f' % (100.0 * t / LOOP)).rstrip('0').rstrip('.') + '%'
def num(v):
    return ('%.3f' % v).rstrip('0').rstrip('.') if v != int(v) else str(int(v))

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

def mover_css():
    by_t, carry = {}, dict(sx=RIGHT, sy=1, ty=0, rot=0)
    for t, s, e in sorted(mover, key=lambda k: k[0]):
        carry = dict(carry, **s); by_t[round(t, 4)] = (dict(carry), e)
    ks = sorted(by_t.items())
    assert ks[0][0] == 0 and ks[0][1][0] == ks[-1][1][0], 'the loop starts and ends the same'
    rows = ['  %s{ transform:translate(0,%s) scale(%s,%s) rotate(%sdeg); animation-timing-function:%s; }'
            % (pct(t), '%spx' % num(s['ty']) if s['ty'] else '0', num(s['sx']), num(s['sy']), num(s['rot']), e)
            for t, (s, e) in ks]
    return '@keyframes vbMove{\n' + '\n'.join(rows) + '\n}'

def track_css():
    ks = one_per_time([(t, f, e) for t, f, e in track], 0)
    return '@keyframes vbTrack{ ' + ' '.join('%s{ transform:translateX(calc(var(--vb-len, 0px) * %s)); animation-timing-function:%s; }'
                                             % (pct(t), num(f), e) for t, f, e in ks) + ' }'

def part_css(part):
    value = (lambda v: 'translateY(%spx)' % num(v)) if part == 'Body' else (lambda v: 'rotate(%sdeg)' % num(v))
    ks = one_per_time(ch[part], 0)
    return '@keyframes vb%s{ %s }' % (part, ' '.join('%s{ transform:%s; animation-timing-function:%s; }' % (pct(t), value(v), e) for t, v, e in ks))

length = num(LOOP) + 's'
out = ['''/* The Vault Boy's walk on the level bar, made by tools/vaultboy-moves.py:
   change it there, not here. One loop, every element the same length so they
   stay together (they all start when he shows). */''',
       '.vb-track{ animation:vbTrack %s linear infinite; }' % length,
       '.vb-move{ animation:vbMove %s linear infinite; }' % length]
for part, cls in PARTS:
    out.append('.%s{ animation:vb%s %s linear infinite; }' % (cls, part, length))
out += [track_css(), mover_css()] + [part_css(p) for p, _ in PARTS]
out.append("/* End of the Vault Boy's walk made by tools/vaultboy-moves.py. */")

text = open(CSS).read()
START, END = "/* The Vault Boy's walk on the level bar", "/* End of the Vault Boy's walk made by tools/vaultboy-moves.py. */"
a = text.index(START)
b = text.index(END, a) + len(END)
open(CSS, 'w').write(text[:a] + '\n'.join(out) + text[b:])
print('wrote the Vault Boy walk into', os.path.relpath(CSS, ROOT), '(%s loop, last move ends at %.2f s)' % (length, t))
