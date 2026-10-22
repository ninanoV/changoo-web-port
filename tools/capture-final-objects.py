"""Capture final-stage fire decoration and enemy-34 projectile94."""
import json
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE

a = runpy.run_path(str(Path(__file__).with_name('capture-atlas-support.py')))
g, b, cpu, read, write, call, draws = (a[key] for key in ['graphics', 'base', 'cpu', 'read', 'write', 'call', 'draws'])
played, PLAYER, NODE, CAMERA = g['played'], b['PLAYER'], b['NODE'], b['CAMERA']
call(0x4193e0); g['loaded'].clear(); call(0x43b6c0); bullet_image = g['loaded'][-1]
registrations = []
for address in [0x434b40, 0x431050]: cpu.hook_add(UC_HOOK_CODE, lambda uc, address, size, _: registrations.append(address), begin=address, end=address)


def fire(x=6500, y=1200):
    offset = len(b['allocations']); call(0x419500, 69, 0x4195c0, 0x419700, 7, x, y, 95)
    return b['allocations'][offset:offset + 2]


def fire_values(node, data):
    fields = {'x': 4, 'y': 8, 'width': 12, 'height': 16, 'frame': 24, 'ticks': 28, 'count': 32, 'period': 36,
              'oldX': 72, 'oldY': 76, 'vx': 80, 'vy': 84, 'state': 88, 'facing': 104}
    return {**{key: read(data + offset) for key, offset in fields.items()},
            'spriteIndex': read(read(data + 20) + read(data + 24) * 4), 'removed': cpu.mem_read(node + 1, 1)[0] == 2}


registrations.clear(); node, data = fire(); assert not registrations
fire_data = {'initial': fire_values(node, data), 'images': list(a['atlases'][read(0x476fc8)].values()),
             'frames': [read(read(data + 20) + i * 4) for i in range(read(data + 32))], 'collisionRegistrations': list(registrations)}
write(CAMERA + 4, 6200); write(CAMERA + 8, 1000); write(0x46d4ac, 1)
fire_trace = []
for tick in range(200):
    draws.clear(); call(0x4195c0, node)
    fire_trace.append({'expected': fire_values(node, data), 'draws': list(draws)})
write(0x46d4ac, 0)


def bullet(x=6500, y=1200, vx=7, vy=-16):
    offset = len(b['allocations']); call(0x43b740, 94, 0x43b830, 0x43b8e0, 6, x, y, vx, vy)
    return b['allocations'][offset:offset + 2]


def bullet_values(node, data):
    fields = {'x': 4, 'y': 8, 'width': 12, 'height': 16, 'oldX': 52, 'oldY': 56, 'vx': 60, 'vy': 64, 'bounces': 68}
    return {**{key: read(data + offset) for key, offset in fields.items()}, 'removed': cpu.mem_read(node + 1, 1)[0] == 2}


node, data = bullet()
bullet_data = {'name': bullet_image, 'width': read(data + 12), 'height': read(data + 16), 'body': [read(data + 20 + i * 4) for i in range(4)]}
movement, contacts, terrain, ranges = [], [], [], []
for vx in [-7, 0, 7]:
    node, data = bullet(vx=vx); initial = bullet_values(node, data); trace = []
    for tick in range(200):
        camera = {'x': 10000 if 20 <= tick < 60 else 6200, 'y': 1000}
        write(CAMERA + 4, camera['x']); call(0x43b830, node)
        trace.append({'camera': camera, 'expected': bullet_values(node, data)})
    movement.append({'initial': initial, 'trace': trace})
for state in [0, 2, 4, 10, 14, 17]:
    for immune in [0, 20]:
        for vx in [-7, 0, 7]:
            node, data = bullet(vx=vx); b['player'](x=6500, y=1200, state=state, invulnerable=immune)
            before = b['player_values'](); played.clear(); call(0x4098f0, NODE, node)
            contacts.append({'before': before, 'vx': vx, 'player': b['player_values'](), 'actor': bullet_values(node, data), 'sounds': list(played)})
cpu.mem_write(0x478be8, struct.pack('<5h', -1, -1, -1, 0, 0) * 1500 * 210)
cpu.mem_write(0x478be8 + (10 * 1500 + 10) * 10, struct.pack('<5h', -1, 0, -1, 0, 0))
for pixel in range(1, 6):
    pixels = bytearray(640 * 32)
    for y in range(32): pixels[y * 640:y * 640 + 32] = bytes([pixel]) * 32
    cpu.mem_write(b['base']['MASK'], struct.pack('<II', 640, 32) + pixels)
    for x, y in [(310, 310), (320, 310), (340, 310), (310, 330), (330, 330)]:
        for bounces in [0, 1, 2]:
            node, data = bullet(x, y, 7, 11)
            write(data + 52, x - 7); write(data + 56, y - 11); write(data + 68, bounces)
            initial = bullet_values(node, data); hit = call(0x431130, data + 20, x, y)
            if hit: call(0x43b950, node, hit)
            terrain.append({'pixel': pixel, 'initial': initial, 'expected': bullet_values(node, data)})
write(CAMERA + 4, 5000)
for x in [4359, 4360, 6280, 6281]:
    node, data = fire(x, 1200); initial = fire_values(node, data); call(0x4195c0, node)
    ranges.append({'initial': initial, 'expected': fire_values(node, data)})
root = b['base']['ROOT']
(root / 'web/final-stage-data.js').write_text('// Original fire95 (0x419500) and projectile94 (0x43b740).\n'
    + 'export const FIRE_EFFECT = ' + json.dumps(fire_data, separators=(',', ':')) + ';\n'
    + 'export const FINAL_PROJECTILE = ' + json.dumps(bullet_data, separators=(',', ':')) + ';\n')
(root / 'test/fixtures/original-final-objects.json').write_text(json.dumps({'fire': fire_data, 'fireTrace': fire_trace, 'fireRanges': ranges,
    'projectile': bullet_data, 'movement': movement, 'contacts': contacts, 'terrain': terrain}, separators=(',', ':')) + '\n')
print('Fire', fire_data, 'bullet', bullet_data, 'ticks', len(fire_trace) + sum(len(t['trace']) for t in movement), 'contacts', len(contacts), 'terrain', len(terrain), flush=True)
