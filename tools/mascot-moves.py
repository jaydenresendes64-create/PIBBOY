"""
Writes the mascot's moves into css/terminal.css: smooth, cartoon-style, like
Vault Boy in a Fallout 4 Pip-Boy. Every move is one .mascot-move animation
(where he goes, which way he faces, squash and stretch) plus one animation
per part (legs, knees, thumb arm, head, body bob), all the same length, made
from the keys below: for each part, a time in seconds, a value (degrees; px
for the body) and the easing to the next key. The cartoon tricks: a small
wind-up before each move, slow in and out of every pose, squash on landing
and stretch in the air, a little overshoot before settling, the head a beat
behind the body, and a spin like a flat card to turn around.

After changing a move: python tools/mascot-moves.py (plain Python 3), then
node --test. It replaces the part of css/terminal.css between
"/* Cartoon animation, like Vault Boy" and "/* End of the moves made by
tools/mascot-moves.py. */". A positive angle swings a leg or the thumb arm
to his front (forward as he walks), a negative one bends a knee (the boot
going back). Every move starts and ends at rest, so nothing jumps.
"""
import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CSS = os.path.join(ROOT, 'css', 'terminal.css')

# Easings: slow in and out, snaps in and settles, speeds up, overshoots and settles, steady.
IO, OUT, IN, BACK, LIN = ('cubic-bezier(.45,0,.55,1)', 'cubic-bezier(.2,.7,.3,1)',
                          'cubic-bezier(.55,0,.85,.35)', 'cubic-bezier(.34,1.56,.64,1)', 'linear')
PARTS = [('LegF', 'mp-leg-front'), ('ShinF', 'mp-shin-front'), ('LegB', 'mp-leg-back'), ('ShinB', 'mp-shin-back'),
         ('Arm', 'mp-arm'), ('Head', 'mp-head'), ('Body', 'mascot-body')]

# Walking poses: C1 his right leg ahead (the left one behind pushing off, knee a
# little bent), C2 the other way; at the passing position the swinging knee bends
# and the boot comes off the ground (PB: his left leg swinging through, PF: his right).
C1 = dict(LegF=14, ShinF=-4, LegB=-10, ShinB=-14)
C2 = dict(LegF=-10, ShinF=-14, LegB=14, ShinB=-4)
PB = dict(ShinF=0, ShinB=-38)
PF = dict(ShinF=-38, ShinB=0)

class Move:
    def __init__(self, name, dur, comment, selectors):
        self.name, self.dur, self.comment, self.selectors = name, dur, comment, selectors
        self.ch = {k: [] for k, _ in PARTS}
        self.mover = []       # (t, state, ease); state: tx (steps), txpx, ty, sx, sy, rot
    def key(self, part, t, v, ease=IO):
        self.ch[part].append((t, v, ease))
    def pose(self, t, ease=IO, **vals):
        for k, v in vals.items():
            self.key(k, t, v, ease)
    def at(self, t, ease=IO, **state):
        self.mover.append((t, state, ease))

def walk(m, start, strides, T, arm=6, tail=True):
    """Strides from rest at `start` (a short wind-up first), each T long; the legs
    swing between contacts, the knees bend at the passing positions, the body bobs
    (down on each contact, up when passing), the arm swings and the head bobs a
    beat late. Ends with the feet together, the body landing and rebounding."""
    c0 = start + 0.12
    contacts = [c0 + i * T for i in range(strides + 1)]      # the last one: feet together
    for i, c in enumerate(contacts[:-1]):
        pose_c = C1 if i % 2 == 0 else C2
        m.pose(c, **pose_c)
        m.key('Arm', c + 0.03, -arm if i % 2 == 0 else arm)
        m.key('Head', c + 0.05, 3 if i % 2 == 0 else -3)
        m.key('Body', c, 1)
        passing = PB if i % 2 == 0 else PF
        m.pose(c + T / 2, **passing)
        m.key('Body', c + T / 2, -1.5)
    end = contacts[-1]
    for k in ('LegF', 'ShinF', 'LegB', 'ShinB'):
        m.key(k, start, 0)
        m.key(k, end, 0)
    m.key('Arm', start, 0); m.key('Arm', end + 0.12, 0)
    m.key('Head', start, 0)
    m.key('Body', start, 0); m.key('Body', start + 0.08, 1)
    m.key('Body', end, 1.5); m.key('Body', end + 0.12, -0.6); m.key('Body', end + 0.22, 0)
    if tail:
        m.key('Head', end + 0.08, -3); m.key('Head', end + 0.25, 0)
    return c0, end

def turn(m, t0, t1, sx_from, sx_to, **carry):
    """A cartoon turn: he spins like a flat card, a little squashed and lifted halfway."""
    mid = (t0 + t1) / 2
    m.at(t0, IN, sx=sx_from, sy=1, ty=0, **carry)
    m.at(mid - 0.004, LIN, sx=0.15 * sx_from, sy=0.95, ty=-2, **carry)   # edge-on: a thin sliver,
    m.at(mid, OUT, sx=0.15 * sx_to, sy=0.95, ty=-2, **carry)             # then the other side
    m.at(t1, IO, sx=sx_to, sy=1, ty=0, **carry)

MOVES = []

# ---------- walk-left / walk-right (3.4 s) ----------
def build_walk(direction):
    s = -1 if direction == 'left' else 1          # which way he goes first
    face_out = 1 if direction == 'left' else -1   # scale x while going out
    m = Move('Walk' + direction.title(), 3.4, '', [])
    m.at(0, IO, tx=0, sx=1, sy=1, ty=0, rot=0)
    if face_out == 1:
        m.at(0.08, IO, tx=0, sx=1, sy=0.98, rot=1.5)              # wind-up: leans back, dips
    else:
        turn(m, 0, 0.1, 1, -1, tx=0, rot=0)                       # turns to face right first
    m.at(0.12, LIN, tx=0, sx=face_out, sy=1, rot=-1)              # leans into the walk
    c0, end = walk(m, 0, 3, 0.25)
    m.at(end, OUT, tx=3 * s, sx=face_out, sy=1, rot=-1)
    m.at(end + 0.08, IO, tx=3 * s, sx=face_out, sy=0.97, rot=1)   # brakes: leans back, squashes
    m.at(end + 0.18, IO, tx=3 * s, sx=face_out, sy=1.01, rot=-0.3)
    m.at(end + 0.26, IO, tx=3 * s, sx=face_out, sy=1, rot=0)
    # a look around: one way, the other, back
    m.key('Head', 1.25, -8); m.key('Head', 1.45, -8, OUT); m.key('Head', 1.65, 7); m.key('Head', 1.82, 7); m.key('Head', 1.98, 0)
    m.at(1.98, IO, tx=3 * s, sx=face_out, sy=1, rot=0)
    turn(m, 1.98, 2.16, face_out, -face_out, tx=3 * s, rot=0)
    m.at(2.24, IO, tx=3 * s, sx=-face_out, sy=0.98, rot=1.5)
    m.at(2.3, LIN, tx=3 * s, sx=-face_out, sy=1, rot=-1)
    c0b, endb = walk(m, 2.18, 3, 0.25)
    m.at(endb, OUT, tx=0, sx=-face_out, sy=1, rot=-1)
    m.at(endb + 0.08, IO, tx=0, sx=-face_out, sy=0.97, rot=1)
    if -face_out == -1:                                              # came back facing right: turn to the front
        turn(m, endb + 0.1, endb + 0.24, -1, 1, tx=0, rot=0)
        m.at(endb + 0.3, IO, tx=0, sx=1, sy=1.01, rot=0)
    else:
        m.at(endb + 0.18, IO, tx=0, sx=1, sy=1.01, rot=-0.3)
        m.at(endb + 0.28, IO, tx=0, sx=1, sy=1, rot=0)
    m.at(3.4, IO, tx=0, sx=1, sy=1, rot=0)
    return m

wl, wr = build_walk('left'), build_walk('right')
wl.comment = 'walk-left / walk-right: a wind-up, three strides out, a stop, a look around, a spin, three strides back, settle.'
MOVES += [wl, wr]

# ---------- stroll: QUESTS (1.65 s) ----------
st = Move('Stroll', 1.65, 'QUESTS: two strides out, a spin, two back.', [])
st.at(0, IO, tx=0, sx=1, sy=1, ty=0, rot=0)
st.at(0.08, IO, tx=0, sx=1, sy=0.98, rot=1.5)
st.at(0.12, LIN, tx=0, sx=1, sy=1, rot=-1)
_, e1 = walk(st, 0, 2, 0.23, tail=False)
st.at(e1, OUT, tx=-2, sx=1, sy=1, rot=-1)
st.at(e1 + 0.07, IO, tx=-2, sx=1, sy=0.97, rot=0.8)
turn(st, e1 + 0.09, e1 + 0.23, 1, -1, tx=-2, rot=0)
b0 = e1 + 0.24
st.at(b0 + 0.06, IO, tx=-2, sx=-1, sy=0.98, rot=1.2)
st.at(b0 + 0.12, LIN, tx=-2, sx=-1, sy=1, rot=-1)
_, e2 = walk(st, b0, 2, 0.23, tail=False)
st.at(e2, OUT, tx=0, sx=-1, sy=1, rot=-1)
turn(st, e2 + 0.04, e2 + 0.18, -1, 1, tx=0, rot=0)
st.at(1.65, IO, tx=0, sx=1, sy=1, rot=0)
MOVES.append(st)

# ---------- nod: STATUS (0.9 s) ----------
nd = Move('Nod', 0.9, 'STATUS: a little wind-up, the thumb pops up high, two nods, back with a bounce.', [])
nd.at(0, IO, sx=1, sy=1, rot=0)
nd.at(0.08, OUT, sx=1, sy=0.98, rot=1)
nd.at(0.22, IO, sx=1, sy=1, rot=-4)
nd.at(0.3, IO, sx=1, sy=0.975, rot=-4)
nd.at(0.42, IO, sx=1, sy=1, rot=-4)
nd.at(0.55, IO, sx=1, sy=0.975, rot=-4)
nd.at(0.66, BACK, sx=1, sy=1, rot=-4)
nd.at(0.84, IO, sx=1, sy=1, rot=0)
nd.at(0.9, IO, sx=1, sy=1, rot=0)
for t, v, e in [(0, 0, IO), (0.08, -5, BACK), (0.22, 18, IO), (0.32, 15, IO), (0.58, 15, IO), (0.8, -2, IO), (0.9, 0, IO)]:
    nd.key('Arm', t, v, e)
for t, v, e in [(0, 0, IO), (0.12, 0, IO), (0.28, -10, IO), (0.4, -1, IO), (0.54, -10, IO), (0.7, 2, IO), (0.9, 0, IO)]:
    nd.key('Head', t, v, e)
MOVES.append(nd)

# ---------- hop: ITEMS (0.8 s) ----------
hp = Move('Hop', 0.8, 'ITEMS: crouches (squash), springs up (stretch), knees tucked and the thumb raised, lands (squash), bounces back.', [])
for t, st_, e in [(0, dict(sx=1, sy=1, ty=0), OUT), (0.14, dict(sx=1.05, sy=0.9, ty=0), OUT),
                  (0.3, dict(sx=0.97, sy=1.06, ty=-7), OUT), (0.4, dict(sx=0.99, sy=1.02, ty=-6), IN),
                  (0.52, dict(sx=1.06, sy=0.9, ty=0), OUT), (0.64, dict(sx=0.99, sy=1.03, ty=-1), IO),
                  (0.73, dict(sx=1, sy=0.99, ty=0), IO), (0.8, dict(sx=1, sy=1, ty=0), IO)]:
    hp.at(t, e, rot=0, **st_)
for t, p, e in [(0, dict(LegF=0, ShinF=0, LegB=0, ShinB=0, Arm=0, Head=0), OUT),
                (0.14, dict(LegF=10, ShinF=-18, LegB=2, ShinB=-16, Arm=-6, Head=2), OUT),
                (0.3, dict(LegF=14, ShinF=-36, LegB=10, ShinB=-36, Arm=18, Head=-3), IO),
                (0.44, dict(LegF=2, ShinF=-8, LegB=0, ShinB=-8, Arm=12, Head=-1), IN),
                (0.52, dict(LegF=10, ShinF=-16, LegB=2, ShinB=-14, Arm=6, Head=2), OUT),
                (0.66, dict(LegF=0, ShinF=0, LegB=0, ShinB=0, Arm=-2, Head=-1), IO),
                (0.8, dict(LegF=0, ShinF=0, LegB=0, ShinB=0, Arm=0, Head=0), IO)]:
    hp.pose(t, e, **p)
MOVES.append(hp)

# ---------- scout: MAP (1.9 s) ----------
sc = Move('Scout', 1.9, 'MAP: braced, thumb raised, peering one way, a spin, peering the other way; a hop back to the front.', [])
brace = dict(LegF=6, ShinF=-6, LegB=-4, ShinB=-6)
rest4 = dict(LegF=0, ShinF=0, LegB=0, ShinB=0)
sc.at(0, IO, txpx=0, sx=1, sy=1, ty=0, rot=0)
sc.at(0.1, OUT, txpx=0, sx=1, sy=0.97, ty=0, rot=-1)
sc.at(0.3, IO, txpx=0, sx=1, sy=1, ty=1, rot=5)
sc.at(0.56, IO, txpx=-2, sx=1, sy=1, ty=1, rot=7)
sc.at(0.72, IO, txpx=0, sx=1, sy=1, ty=0, rot=0)
turn(sc, 0.78, 0.94, 1, -1, txpx=0, rot=0)
sc.at(1.1, IO, txpx=2, sx=-1, sy=1, ty=1, rot=5)
sc.at(1.32, IO, txpx=2, sx=-1, sy=1, ty=1, rot=7)
sc.at(1.46, OUT, txpx=0, sx=-1, sy=0.92, ty=0, rot=0)                 # crouch for the hop
sc.at(1.54, IN, txpx=0, sx=-0.95, sy=1.05, ty=-4.5, rot=0)            # springs up...
sc.at(1.576, LIN, txpx=0, sx=-0.15, sy=1.04, ty=-5, rot=0)            # ...spins quickly in the air
sc.at(1.58, OUT, txpx=0, sx=0.15, sy=1.04, ty=-5, rot=0)
sc.at(1.62, IN, txpx=0, sx=0.95, sy=1.03, ty=-4.5, rot=0)
sc.at(1.72, OUT, txpx=0, sx=1, sy=0.93, ty=0, rot=0)                  # lands facing front
sc.at(1.82, IO, txpx=0, sx=1, sy=1.02, ty=0, rot=0)
sc.at(1.9, IO, txpx=0, sx=1, sy=1, ty=0, rot=0)
for t, p, e in [(0, dict(rest4, Arm=0, Head=0), IO), (0.3, dict(brace, Arm=8, Head=-4), IO),
                (0.56, dict(brace, Arm=14, Head=-7), IO), (0.72, dict(rest4, Arm=0, Head=0), IO),
                (0.94, dict(rest4, Arm=0, Head=0), IO), (1.1, dict(brace, Arm=8, Head=-4), IO),
                (1.32, dict(brace, Arm=14, Head=-7), IO),
                (1.46, dict(LegF=8, ShinF=-18, LegB=2, ShinB=-16, Arm=4, Head=1), OUT),
                (1.6, dict(LegF=6, ShinF=-26, LegB=8, ShinB=-26, Arm=10, Head=-2), IN),
                (1.72, dict(LegF=8, ShinF=-14, LegB=2, ShinB=-12, Arm=2, Head=1), OUT),
                (1.84, dict(rest4, Arm=-1, Head=0), IO), (1.9, dict(rest4, Arm=0, Head=0), IO)]:
    sc.pose(t, e, **p)
MOVES.append(sc)

# ---------- write: LOG (1 s) ----------
wr_ = Move('Write', 1.0, 'LOG: head down, quick little strokes of the hand, like writing; back up with a bounce.', [])
wr_.at(0, OUT, sx=1, sy=1, ty=0, rot=0)
wr_.at(0.14, IO, sx=1, sy=0.97, ty=1, rot=-3.5)
wr_.at(0.72, BACK, sx=1, sy=0.97, ty=1, rot=-3.5)
wr_.at(0.9, IO, sx=1, sy=1, ty=0, rot=0)
wr_.at(1.0, IO, sx=1, sy=1, ty=0, rot=0)
for t, v in [(0, 0), (0.12, -7), (0.22, 4), (0.32, -7), (0.42, 4), (0.52, -6), (0.62, 3), (0.74, -3), (0.9, 0), (1.0, 0)]:
    wr_.key('Arm', t, v)
for t, v, e in [(0, 0, OUT), (0.14, -8, IO), (0.26, -6, IO), (0.38, -8, IO), (0.5, -6, IO), (0.6, -8, BACK), (0.86, 1.5, IO), (1.0, 0, IO)]:
    wr_.key('Head', t, v, e)
MOVES.append(wr_)

# ---------- thumbs: now and then while idle (1.1 s) ----------
th = Move('Thumbs', 1.1, 'now and then while idle: a little wind-up, two thumbs-up pumps with a bounce, settle.', [])
for t, st_, e in [(0, dict(sy=1, ty=0), OUT), (0.1, dict(sy=0.97, ty=0), OUT), (0.24, dict(sy=1.02, ty=-2.5), IO),
                  (0.38, dict(sy=0.99, ty=0), OUT), (0.54, dict(sy=1.02, ty=-2.5), IO), (0.72, dict(sy=0.99, ty=0), IO),
                  (0.86, dict(sy=1, ty=0), IO), (1.1, dict(sy=1, ty=0), IO)]:
    th.at(t, e, sx=1, rot=0, **st_)
for t, v, e in [(0, 0, IO), (0.1, -4, BACK), (0.24, 15, IO), (0.38, 5, BACK), (0.54, 15, IO), (0.76, -2, IO), (0.92, 1, IO), (1.1, 0, IO)]:
    th.key('Arm', t, v, e)
for t, v, e in [(0, 0, IO), (0.24, 2, IO), (0.54, -2, IO), (0.8, 0, IO), (1.1, 0, IO)]:
    th.key('Head', t, v, e)
MOVES.append(th)

MOVE_NAMES = {'WalkLeft': 'walk-left', 'WalkRight': 'walk-right', 'Stroll': 'stroll', 'Nod': 'nod', 'Hop': 'hop',
              'Scout': 'scout', 'Write': 'write', 'Thumbs': 'thumbs'}

def pct(t, dur):
    s = ('%.2f' % (100.0 * t / dur)).rstrip('0').rstrip('.')
    return s + '%'
def num(v):
    return ('%.3f' % v).rstrip('0').rstrip('.') if v != int(v) else str(int(v))

def mover_transform(s):
    if s.get('tx'):
        x = 'calc(var(--mascot-step) * %s)' % num(s['tx'])
    elif s.get('txpx'):
        x = '%spx' % num(s['txpx'])
    else:
        x = '0'
    y = '%spx' % num(s.get('ty', 0)) if s.get('ty') else '0'
    return 'translate(%s,%s) scale(%s,%s) rotate(%sdeg)' % (x, y, num(s.get('sx', 1)), num(s.get('sy', 1)), num(s.get('rot', 0)))

def part_value(part, v):
    return 'translateY(%spx)' % num(v) if part == 'Body' else 'rotate(%sdeg)' % num(v)

def clean(keys, dur, rest=0):
    """Sorted keys, one per time (the last given wins), with rest at 0 and at the end; a key
    is dropped only in the middle of a hold (same value before and after)."""
    by_t = {}
    for t, v, e in keys:
        by_t[round(t, 4)] = (v, e)
    by_t.setdefault(0.0, (rest, IO))
    by_t[round(dur, 4)] = (rest, IO)
    ks = sorted((t, v, e) for t, (v, e) in by_t.items())
    out = []
    for i, k in enumerate(ks):
        if 0 < i < len(ks) - 1 and ks[i - 1][1] == k[1] == ks[i + 1][1]:
            continue
        out.append(k)
    return out

css = []
for m in MOVES:
    # the whole figure
    states, carry = [], dict(tx=0, txpx=0, ty=0, sx=1, sy=1, rot=0)
    by_t = {}
    for t, s, e in sorted(m.mover, key=lambda k: k[0]):
        carry = dict(carry, **s); by_t[round(t, 4)] = (dict(carry), e)
    ks = sorted(by_t.items())
    assert ks[0][0] == 0 and abs(ks[-1][0] - m.dur) < 1e-6, m.name
    for t, (s, e) in ks:
        assert t <= m.dur + 1e-6, (m.name, t)
    rest = mover_transform(dict(tx=0, txpx=0, ty=0, sx=1, sy=1, rot=0))
    assert mover_transform(ks[0][1][0]) == rest and mover_transform(ks[-1][1][0]) == rest, m.name + ' starts and ends at rest'
    lines = ['@keyframes mascot%s{' % m.name]
    for t, (s, e) in ks:
        lines.append('  %s{ transform:%s; animation-timing-function:%s; }' % (pct(t, m.dur), mover_transform(s), e))
    lines.append('}')
    m.mover_css = '\n'.join(lines)
    m.parts_css = []
    for part, cls in PARTS:
        keys = m.ch[part]
        if not keys or all(v == 0 for _, v, _ in keys):
            continue
        assert max(t for t, _, _ in keys) <= m.dur + 1e-6, (m.name, part)
        ks2 = clean(keys, m.dur)
        body = ' '.join('%s{ transform:%s; animation-timing-function:%s; }' % (pct(t, m.dur), part_value(part, v), e) for t, v, e in ks2)
        kf = 'mascot%s%s' % ('Walk' if m.name.startswith('Walk') else m.name, part)   # the two walks share theirs
        m.parts_css.append((cls, kf, '@keyframes %s{ %s }' % (kf, body)))

def dur(m):
    return num(m.dur) + 's'

out = []
out.append('''/* Cartoon animation, like Vault Boy in a Fallout 4 Pip-Boy, as smooth as the
   screen allows (only transforms move, so the phone's graphics chip does the
   work). Idle, he breathes and sways a little and blinks; js/mascot.js sets
   data-move for a walk or a thumbs-up every 10-20 s, and one gesture when the
   tab changes. A move animates the whole figure (.mascot-move: where he goes,
   which way he faces, squash and stretch) and each part (the keyframes after
   these). The cartoon tricks: a small wind-up before each move, slow in and
   out of every pose, squash on landing and stretch in the air, a little
   overshoot before settling, the head a beat behind the body, and a spin like
   a flat card to turn around. He faces left as drawn; scale(-1,1) turns him
   to the right, parts and all. Made by tools/mascot-moves.py: change a move
   there, not here. */
.mascot-body{ animation:mascotBreathe 4.2s ease-in-out infinite; }
.mascot-body .mp-head{ animation:mascotIdleHead 4.2s ease-in-out infinite; }
.mascot-body .mp-arm{ animation:mascotIdleArm 4.2s ease-in-out infinite; }''')
for m in MOVES:
    out.append('.mascot-move[data-move="%s"]{ animation:mascot%s %s ease-in-out; }' % (MOVE_NAMES[m.name], m.name, dur(m)))
out.append('''/* Idle: breathing in and out, the head and the thumb going along. */
@keyframes mascotBreathe{ 0%, 100%{ transform:scale(1,1); } 45%{ transform:scale(1,1.025); } 60%{ transform:scale(1,1.025); } }
@keyframes mascotIdleHead{ 0%, 100%{ transform:rotate(0deg); } 50%{ transform:rotate(-1.2deg); } }
@keyframes mascotIdleArm{ 0%, 100%{ transform:rotate(0deg); } 50%{ transform:rotate(2deg); } }''')
for m in MOVES:
    out.append('/* %s */' % (m.comment or m.name))
    out.append(m.mover_css)
out.append('''
/* Each part's moves during each move (same length as the move above;
   rotate() turns a part around its joint: a positive angle swings a leg or
   the thumb arm to his front, forward as he walks, a negative one bends a
   knee, the boot going back; the body bobs up and down). */''')
# parts: walk-left and walk-right share their part keyframes (same timing)
for m in MOVES:
    if m.name == 'WalkRight':
        continue
    sels = ['walk-left', 'walk-right'] if m.name == 'WalkLeft' else [MOVE_NAMES[m.name]]
    if m.name == 'WalkLeft':
        out.append('/* walk-left and walk-right: the legs, arm, head and body do the same. */')
    for cls, kf, kcss in m.parts_css:
        out.append(kcss)
    for cls, kf, kcss in m.parts_css:
        sel = ', '.join('.mascot-move[data-move="%s"] .%s' % (s, cls) for s in sels)
        out.append('%s{ animation:%s %s ease-in-out; }' % (sel, kf, dur(m)))
# walk-right's parts must match walk-left's exactly (they share them)
wl_parts = {p: clean(wl.ch[p], wl.dur) for p, _ in PARTS}
wr_parts = {p: clean(wr.ch[p], wr.dur) for p, _ in PARTS}
assert wl_parts == wr_parts
out.append('/* End of the moves made by tools/mascot-moves.py. */')
text = open(CSS).read()
START, END = '/* Cartoon animation, like Vault Boy', '/* End of the moves made by tools/mascot-moves.py. */'
a = text.index(START)
b = text.index(END, a) + len(END) if END in text else text.index('\n\n.toast-layer{', a)
open(CSS, 'w').write(text[:a] + '\n'.join(out) + text[b:])
print('wrote the mascot moves into', os.path.relpath(CSS, ROOT), '(%d moves)' % len(MOVES))
