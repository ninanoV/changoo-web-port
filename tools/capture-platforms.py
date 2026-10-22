"""Capture original moving-platform and spring routines for a native port."""
import json
from pathlib import Path
import runpy
import struct

base = runpy.run_path(str(Path(__file__).with_name('capture-objects.py')))
cpu, write, read, call = (base[key] for key in ['cpu', 'write', 'read', 'call'])
PLAYER, NODE, CAMERA = (base[key] for key in ['PLAYER', 'NODE', 'CAMERA'])
allocations = base['allocations']
cpu.mem_write(0x476288, struct.pack('<4i', 24, 65, 50, 71))
for address in [0x77dfc4, 0x77dfb8]:
    write(address, 0x1600000)
for address, value in {0x77df98: 64, 0x77dfbc: 64, 0x4773a0: 64, 0x4773b8: 64, 0x477098: 64, 0x47709c: 23}.items():
    write(address, value)
write(CAMERA + 4, 3200)
ctors = {9: (0x434cf0, 0x434dc0, 0x434ef0), 88: (0x41ab50, 0x41ac20, 0x41ad50)}


def create(kind, x, y):
    ctor, update, destructor = ctors.get(kind, (0x4197e0, 0x419970, 0x419af0))
    start = len(allocations)
    call(ctor, 0x40 if kind in ctors else 0x3e, update, destructor, 6, x, y, kind)
    return allocations[start:start + 2]


def values(kind, data):
    fields = {'x': 4, 'y': 8, 'oldX': 0x40 if kind in ctors else 0x2c, 'oldY': 0x44 if kind in ctors else 0x30,
              'vx': 0x48 if kind in ctors else 0x34, 'vy': 0x4c if kind in ctors else 0x38,
              'state': 0x50 if kind in ctors else 0x3c}
    if kind in ctors:
        fields.update(frame=0x20, ticks=0x24, period=0x2c, frameCount=0x28)
    result = {key: read(data + offset) for key, offset in fields.items()}
    if kind in ctors:
        result['spriteIndex'] = read(read(data + 0x1c) + read(data + 0x20) * 4)
    return result


motions, contacts, journeys = [], [], []
for kind in [3, 4, 5, 49, 50, 9, 88]:
    node, data = create(kind, 3487, 3040)
    initial = values(kind, data)
    if kind in ctors:
        base['player'](x=3480, y=2975, state=2, vy=5)
        call(0x4098f0, NODE, node)
    trace = []
    for _ in range(64):
        call(read(node + 4), node)
        trace.append(values(kind, data))
    motions.append({'kind': kind, 'initial': initial, 'trace': trace})
    for scenario, x, y, vy in [('fall', 3480, 2975, 5), ('rise', 3480, 2975, -5), ('side', 3480, 3020, 5), ('edge', 3519, 2975, 5)]:
        node, data = create(kind, 3487, 3040)
        base['player'](x=x, y=y, state=2, vy=vy)
        if kind not in ctors:
            call(read(node + 4), node)
        before = values(kind, data)
        call(0x4098f0, NODE, node)
        contacts.append({'kind': kind, 'scenario': scenario, 'player': {'x': x, 'y': y, 'vy': vy},
                         'surface': before, 'expected': {'x': read(PLAYER + 8), 'y': read(PLAYER + 12), 'vy': read(PLAYER + 0x58), 'onPlatform': bool(read(PLAYER + 0x64))},
                         'surfaceAfter': values(kind, data)})

# Follow each spring launch through the real player update, geometry and contact functions.
for kind in [9, 88]:
    node, data = create(kind, 3487, 3040)
    base['player'](x=3480, y=2975, state=2, vy=5)
    call(0x40d790, PLAYER)
    write(PLAYER + 0x58, 5)
    call(0x4098f0, NODE, node)
    trace = []
    for tick in range(85):
        # Hold still against the tall wall until above it, then move to its upper surface.
        right = 20 <= tick < 65
        write(0x46d4bc, int(right))
        write(CAMERA + 8, max(0, read(PLAYER + 12) - 280))
        call(read(node + 4), node)
        call(0x405cf0, NODE)
        hit = call(0x431130, PLAYER + 0x2c, read(PLAYER + 8), read(PLAYER + 12))
        if hit:
            call(0x40d4c0, NODE, hit)
        if call(0x434ad0, PLAYER + 0x2c, read(PLAYER + 8), read(PLAYER + 12), data + 0xc, read(data + 4), read(data + 8)):
            call(0x4098f0, NODE, node)
        trace.append({'input': {'right': right}, 'expected': {**base['player_values'](), 'onPlatform': bool(read(PLAYER + 0x64))}})
    journeys.append({'kind': kind, 'trace': trace})

result = {'motions': motions, 'contacts': contacts, 'journeys': journeys}
destination = base['base']['ROOT'] / 'test/fixtures/original-platforms.json'
assert len(contacts) == 28 and all(j['trace'][-1]['expected']['x'] > 3600 for j in journeys)
destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(f'Captured {len(motions)} surface traces, {len(contacts)} contacts and {len(journeys)} spring journeys.')
