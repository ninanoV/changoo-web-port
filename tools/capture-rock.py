"""Run the original map-121 rock factory, physics, contacts and audio flags."""
import json
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, read, write, call, played = (g[key] for key in ['base', 'cpu', 'read', 'write', 'call', 'played'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
audio = []


def sound(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    audio.append({'name': g['support']['audio_names'][read(sp + 4)], 'loop': bool(read(sp + 16) & 1)})


cpu.hook_add(UC_HOOK_CODE, sound, begin=0x1600200, end=0x1600200)
call(0x404600)


def create(x=650, y=150, vx=-6, vy=-8):
    offset = len(b['allocations'])
    call(0x404690, 60, 0x4047c0, 0x404850, 6, x, y, vx, vy)
    return b['allocations'][offset:offset + 2]


def values(node, data):
    fields = {'x': 4, 'y': 8, 'width': 12, 'height': 16, 'oldX': 52, 'oldY': 56, 'vx': 60, 'vy': 64, 'bounces': 68}
    return {**{key: read(data + offset) for key, offset in fields.items()}, 'removed': cpu.mem_read(node + 1, 1)[0] == 2}


node, data = create()
metadata = {'name': g['loaded'][-1], 'width': read(data + 12), 'height': read(data + 16),
            'body': [read(data + 20 + i * 4) for i in range(4)], 'spawnSounds': list(audio)}
audio.clear(); call(0x404850, node); assert not audio
metadata['destructorSounds'] = []


def terrain(pixel, floor=False):
    cpu.mem_write(0x478be8, struct.pack('<5h', -1, -1, -1, 0, 0) * 1500 * 210)
    for column in range(80) if floor else [10]:
        cpu.mem_write(0x478be8 + (10 * 1500 + column) * 10, struct.pack('<5h', -1, 0, -1, 0, 0))
    pixels = bytearray(640 * 32)
    for row in range(32): pixels[row * 640:row * 640 + 32] = bytes([pixel]) * 32
    cpu.mem_write(b['base']['MASK'], struct.pack('<II', 640, 32) + pixels)


movement, contacts, collisions = [], [], []
for scenario in ['bounces', 'moving', 'freeze']:
    terrain(1, True)
    node, data = create(vx=0 if scenario == 'bounces' else -6)
    initial, trace = values(node, data), []
    for tick in range(300):
        camera = {'x': read(data + 4) - 320 if scenario != 'freeze' or tick < 10 or tick >= 100 else 5000, 'y': 0}
        write(CAMERA + 4, camera['x']); write(CAMERA + 8, 0)
        call(0x4047c0, node)
        hit = call(0x431130, data + 20, read(data + 4), read(data + 8))
        if hit: call(0x4048d0, node, hit)
        trace.append({'camera': camera, 'expected': values(node, data)})
    movement.append({'scenario': scenario, 'initial': initial, 'trace': trace})
assert movement[0]['trace'][-1]['expected']['bounces'] > 3

for state in [0, 2, 4, 10, 14, 17]:
    for vx in [-6, 0, 6]:
        for immune in [0, 20]:
            for side in [-1, 1]:
                node, data = create(vx=vx)
                b['player'](x=650 + side * 30, y=150, state=state, vy=5, invulnerable=immune)
                initial = b['player_values'](); played.clear()
                call(0x4098f0, NODE, node)
                contacts.append({'initial': initial, 'vx': vx, 'player': b['player_values'](), 'actor': values(node, data), 'sounds': list(played)})
                assert cpu.mem_read(node + 1, 1)[0] != 2

for pixel in range(1, 6):
    terrain(pixel)
    for x, y, old_x, old_y in [(280, 220, 275, 210), (240, 260, 230, 260), (340, 260, 350, 260), (280, 340, 280, 350), (280, 300, 270, 290)]:
        node, data = create(x, y)
        write(data + 52, old_x); write(data + 56, old_y)
        before = values(node, data)
        hit = call(0x431130, data + 20, x, y)
        if hit: call(0x4048d0, node, hit)
        collisions.append({'pixel': pixel, 'initial': before, 'expected': values(node, data)})

# Execute the secondary map dispatcher rather than assuming constructor velocities.
terrain(0)
cpu.mem_write(0x18f2000, b'dol.app\0'); write(0x461430 + 121 * 4, call(0x4402c0, 0x18f2000))
write(CAMERA + 12, 0); write(CAMERA + 16, 0); write(0x77bf44, 1500); write(0x77bf54, 210)
cpu.mem_write(0x478be8 + (10 * 1500 + 10) * 10, struct.pack('<5h', -1, -1, 121, 0, 0))
offset = len(b['allocations']); audio.clear(); call(0x427610, 10, 10, CAMERA)
node, data = b['allocations'][offset:offset + 2]
factory = {'expected': values(node, data), 'sounds': list(audio)}
assert factory['expected']['vx'] == -6 and factory['expected']['vy'] == -8
root = b['base']['ROOT']
(root / 'web/rock-data.js').write_text('// Extracted from SHIN.EXE 0x404600/0x404690.\nexport const ROCK = ' + json.dumps(metadata, separators=(',', ':')) + ';\n')
(root / 'test/fixtures/original-rock.json').write_text(json.dumps({'metadata': metadata, 'movement': movement, 'contacts': contacts, 'terrain': collisions, 'factory': factory}, separators=(',', ':')) + '\n')
print('Rock:', metadata, 'ticks:', sum(len(item['trace']) for item in movement), 'contacts:', len(contacts), 'terrain:', len(collisions), 'factory:', factory, flush=True)
