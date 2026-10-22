"""Capture both final bosses' complete damage cycles and hostile attacks99/67."""
import json
from pathlib import Path
import runpy
import struct

a = runpy.run_path(str(Path(__file__).with_name('capture-atlas-support.py')))
g, b, cpu, read, write, call, draws = (a[key] for key in ['graphics', 'base', 'cpu', 'read', 'write', 'call', 'draws'])
played, PLAYER, NODE, CAMERA = g['played'], b['PLAYER'], b['NODE'], b['CAMERA']
for loader in [0x42a2e0, 0x442d60, 0x447ff0, 0x446420]: call(loader)
write(CAMERA + 4, 6200); write(CAMERA + 8, 1000)
boss_specs = {41: (0x42a4c0, 0x42a5e0, 0x42aa20, 119, 0x42ad00), 59: (0x442f10, 0x443020, 0x443360, 124, 0x443610)}


def boss_values(kind, node, data):
    fields = {'x': 4, 'y': 8, 'oldX': 64, 'oldY': 68, 'vx': 72, 'vy': 76, 'frame': 16, 'ticks': 20, 'count': 24, 'period': 28,
              'state': 80, 'facing': 96, 'timer': 88, 'health': 108} if kind == 41 else {
              'x': 4, 'y': 8, 'oldX': 72, 'oldY': 76, 'vx': 80, 'vy': 84, 'frame': 24, 'ticks': 28, 'count': 32, 'period': 36,
              'state': 88, 'facing': 104, 'timer': 108, 'health': 116}
    return {**{key: read(data + offset) for key, offset in fields.items()}, 'removed': cpu.mem_read(node + 1, 1)[0] == 2}


b['player'](x=6500, y=1200); damage, hud = [], []
for kind, (ctor, update, destructor, code, setter) in boss_specs.items():
    offset = len(b['allocations']); call(ctor, code, update, destructor, 6, 6600, 1200, kind)
    node, data = b['allocations'][offset:offset + 2]
    write(0x46d4ac, 1); draws.clear(); call(update, node)
    hud.extend(command for command in draws if command['name'] in ['bsfc71.app', 'bsfc72.app', 'rlife.app'])
    write(0x46d4ac, 0)
    initial = boss_values(kind, node, data); strikes = []
    for strike in range(10):
        played.clear(); call(setter, data); sounds = list(played); trace = []
        for tick in range(30):
            call(update, node); trace.append(boss_values(kind, node, data))
            if read(data + (80 if kind == 41 else 88)) != (4 if kind == 41 else 3): break
        assert trace[-1]['health'] == 9 - strike
        strikes.append({'trace': trace, 'sounds': sounds, 'remainingBosses': read(0x46c500)})
    damage.append({'kind': kind, 'initial': initial, 'strikes': strikes})
assert read(0x46c500) == 0


def projectile(kind, x=6500, y=1200, vx=8):
    offset = len(b['allocations'])
    if kind == 99: call(0x448110, 99, 0x448220, 0x448340, 6, x, y, vx)
    else: call(0x446480, 67, 0x446550, 0x4465e0, 6, x, y)
    return b['allocations'][offset:offset + 2]


def shot_values(kind, node, data):
    fields = {'x': 4, 'y': 8, 'width': 12, 'height': 16, 'frame': 24, 'ticks': 28, 'count': 32, 'period': 36,
              'oldX': 72, 'oldY': 76, 'vx': 80, 'vy': 84, 'facing': 104} if kind == 99 else {
              'x': 4, 'y': 8, 'width': 12, 'height': 16, 'oldX': 52, 'oldY': 56, 'vx': 60, 'vy': 64, 'ticks': 72}
    return {**{key: read(data + offset) for key, offset in fields.items()}, 'removed': cpu.mem_read(node + 1, 1)[0] == 2}


shots, movement, contacts, terrain = {}, [], [], []
for kind in [99, 67]:
    node, data = projectile(kind)
    shots[kind] = {'initial': shot_values(kind, node, data), 'body': [read(data + (40 if kind == 99 else 20) + i * 4) for i in range(4)],
                   'images': list(a['atlases'][read(0x78f6f4)].values()) if kind == 99 else [g['surface_names'][read(0x78f484)]]}
    for vx, y, distant in [(-8, 1200, False), (0, 1200, False), (8, 1200, False), (8, 1451, False), (8, 1200, True)]:
        node, data = projectile(kind, y=y, vx=vx); trace = []
        for tick in range(190):
            camera = {'x': 10000 if distant and 3 <= tick < 20 else 6200, 'y': 1000}
            write(CAMERA + 4, camera['x']); call(0x448220 if kind == 99 else 0x446550, node)
            trace.append({'camera': camera, 'expected': shot_values(kind, node, data)})
            if trace[-1]['expected']['removed']: break
        movement.append({'kind': kind, 'input': {'x': 6500, 'y': y, 'vx': vx, 'vy': 0}, 'trace': trace})
    for state in [0, 2, 4, 10, 14, 17]:
        for immune in [0, 20]:
            for vx in [-8, 0, 8]:
                node, data = projectile(kind, vx=vx); b['player'](x=6500, y=1200, state=state, vy=5, invulnerable=immune)
                before = b['player_values'](); played.clear(); call(0x4098f0, NODE, node)
                contacts.append({'kind': kind, 'vx': vx, 'before': before, 'player': b['player_values'](), 'shot': shot_values(kind, node, data), 'sounds': list(played)})
cpu.mem_write(0x478be8, struct.pack('<5h', -1, -1, -1, 0, 0) * 1500 * 210)
cpu.mem_write(0x478be8 + (10 * 1500 + 10) * 10, struct.pack('<5h', -1, 0, -1, 0, 0))
for pixel in range(1, 6):
    pixels = bytearray(640 * 32)
    for y in range(32): pixels[y * 640:y * 640 + 32] = bytes([pixel]) * 32
    cpu.mem_write(b['base']['MASK'], struct.pack('<II', 640, 32) + pixels)
    for x, y in [(310, 310), (320, 310), (340, 310), (310, 330), (330, 330)]:
        node, data = projectile(99, x, y); write(data + 72, x - 8); write(data + 76, y - 11); write(data + 84, 11)
        initial = shot_values(99, node, data); hit = call(0x431130, data + 40, x, y)
        if hit: call(0x4483b0, node, hit)
        terrain.append({'pixel': pixel, 'initial': initial, 'expected': shot_values(99, node, data)})
root = b['base']['ROOT']
(root / 'web/final-boss-data.js').write_text('// Original final-boss attacks99/67: 0x448110 and 0x446480.\nexport const FINAL_BOSS_SHOTS = ' + json.dumps(shots, separators=(',', ':')) + ';\n')
(root / 'test/fixtures/original-final-bosses.json').write_text(json.dumps({'damage': damage, 'hud': hud, 'shots': shots,
    'movement': movement, 'contacts': contacts, 'terrain': terrain}, separators=(',', ':')) + '\n')
print('Boss damage ticks', sum(len(t['trace']) for d in damage for t in d['strikes']), 'shot metadata', shots, 'contacts', len(contacts), 'terrain', len(terrain), flush=True)
