"""Capture jungle paired-boss dialogue, damage cycles and its straight projectile."""
import json
from pathlib import Path
import runpy
import struct

a = runpy.run_path(str(Path(__file__).with_name('capture-atlas-support.py')))
g, b, cpu, read, write, call, draws, set_clock = (a[key] for key in ['graphics', 'base', 'cpu', 'read', 'write', 'call', 'draws', 'set_clock'])
played = g['played']; PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
for loader in [0x404a80, 0x444250, 0x41a550, 0x42d5e0, 0x42fc00]: call(loader)
for pointer, name in [(0x4752e8, 'DEM-SHIN.WAV'), (0x475200, 'BONUS.WAV')]:
    cpu.mem_write(0x18f2000, name.encode() + b'\0'); call(0x42d4b0, 0, pointer, 0x18f2000)
map_data = g['resources']['stage4.map']; width, height = struct.unpack_from('<II', map_data)
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
write(0x461428, 4); write(0x46142c, 4)
write(CAMERA + 4, 24200); write(CAMERA + 8, 5919); write(CAMERA + 68, width); write(CAMERA + 72, height)
cpu.mem_write(0x18f2000, b'block4.app\0'); call(0x4402c0, 0x18f2000)
fields = {'x': 4, 'y': 8, 'frame': 16, 'ticks': 20, 'count': 24, 'period': 28, 'oldX': 64, 'oldY': 68,
          'vx': 72, 'vy': 76, 'state': 80, 'timer': 88, 'previousState': 92, 'facing': 96, 'width': 100, 'height': 104, 'health': 108}
shot_fields = {'x': 4, 'y': 8, 'width': 12, 'height': 16, 'frame': 24, 'ticks': 28, 'count': 32, 'period': 36,
               'oldX': 72, 'oldY': 76, 'vx': 80, 'vy': 84, 'facing': 104}


def boss_values(kind, data):
    node = read(data + 112)
    assert read(node + 12) == data
    return {**{key: read(data + offset) for key, offset in fields.items()},
            'spriteIndex': read(read(data + 12) + read(data + 16) * 4),
            'scripted': read(node + 4) == (0x405480 if kind == 39 else 0x444bf0),
            'removed': cpu.mem_read(node + 1, 1)[0] == 2}


def start(scheduler=False, hurt=False):
    for priority in range(10):
        write(0x1601000 + priority * 64 + 24, 0); write(0x471920 + priority * 4, 1)
    write(0x1601404, 0); write(0x1601504, 0); write(0x46fff8, 0); write(0x45c0a8, 2)
    b['player'](x=24520, y=6232, state=4 if hurt else 0)
    write(NODE + 4, 0x405cf0); write(NODE + 20, 0x1601200); write(NODE + 24, 0)
    write(0x1601218, NODE); cpu.mem_write(NODE + 1, b'\0')
    for address in [0x46d4b0, 0x46d4b4, 0x46d4b8, 0x46d4bc, 0x46d4e8, 0x46d4ec, 0x46d4d8, 0x46d4f0, 0x46d4ac]: write(address, 0)
    if scheduler:
        call(0x431050, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x40d4c0)
        offset = len(b['allocations']); call(0x430fd0, 3, 0x431000, 0x4310f0, 9)
        cpu.mem_write(b['allocations'][offset] + 1, b'\0')
    set_clock(1000); played.clear()
    offset = len(b['allocations']); call(0x441b40, 45, 0x441c80, 0x441d80, 6)
    node, data = b['allocations'][offset:offset + 2]
    return node, data, {39: read(0x4739a4), 40: read(0x78eeb4)}


def snapshot(node, data, bosses):
    return {'phase': read(data + 4), 'removed': cpu.mem_read(node + 1, 1)[0] == 2, 'player': b['player_values'](),
            'count': read(PLAYER + 36), 'period': read(PLAYER + 40), 'bosses': {kind: boss_values(kind, actor) for kind, actor in bosses.items()}}


node, data, bosses = start()
scene = {'initialState': read(PLAYER + 92), 'startSounds': list(played), 'end': 12630, 'canSkip': False, 'singleStep': False,
         'timeline': [], 'enemies': {}}
player_images = list(a['atlases'][read(0x475318)].values()); poses = {}
for entry in [0x411850, 0x411600]:
    call(entry, PLAYER); state = read(PLAYER + 92)
    indices = [read(read(PLAYER + 24) + i * 4) for i in range(read(PLAYER + 36))]
    poses[state] = {'frames': [player_images[index].removesuffix('.app') for index in indices], 'count': len(indices), 'period': read(PLAYER + 40)}
    if state == 73: poses[state]['zeroHorizontal'] = False
for kind, entries, surface in [(39, [0x4055b0, 0x4055e0, 0x405610], 0x4739ac), (40, [0x444d10, 0x444d40], 0x78f024)]:
    actor = bosses[kind]; states = {}
    for entry in entries:
        call(entry, actor); state = read(actor + 80)
        states[state] = {'frames': [read(read(actor + 12) + i * 4) for i in range(read(actor + 24))], 'period': read(actor + 28)}
    scene['enemies'][kind] = {'images': list(a['atlases'][read(surface)].values()), 'states': states}
node, data, bosses = start()
for elapsed in [1240, 3450, 8090]:
    set_clock(1001 + elapsed); played.clear(); call(0x441c80, node)
    scene['timeline'].append([elapsed, 73 if elapsed == 8090 else None, list(played),
                              [6, 6] if elapsed == 1240 else [7, None] if elapsed == 3450 else [None, None]])
print('Captured dialogue86: four voices, player poses and both actor atlases.', flush=True)
sequences = []
for scenario in ['natural', 'enter', 'large-time-jump', 'hurt-entry']:
    node, data, bosses = start(True, scenario == 'hurt-entry'); initial = snapshot(node, data, bosses); frames = []
    for tick in range(500):
        elapsed = tick * (30000 if scenario == 'large-time-jump' else 1000) // (1 if scenario == 'large-time-jump' else 30)
        enter = scenario == 'enter' and tick == 9
        set_clock(1000 + elapsed); write(0x46d4ec, int(enter)); played.clear(); call(0x44d3a0)
        frames.append({'elapsed': elapsed, 'enter': enter, 'expected': snapshot(node, data, bosses), 'sounds': list(played)})
        if frames[-1]['expected']['removed']: break
    assert frames[-1]['expected']['removed']
    sequences.append({'scenario': scenario, 'initial': initial, 'trace': frames})
    print(scenario, len(frames), flush=True)

# The native HUD uses a separate row for each boss.
hud = []
for kind, actor in bosses.items():
    write(0x46d4ac, 1); draws.clear(); call(read(read(actor + 112) + 4), read(actor + 112))
    hud.extend(command for command in draws if command['name'] in ['bsfc51.app', 'bsfc52.app', 'rlife.app'])
write(0x46d4ac, 0)
deaths = []
for kind, ctor, update, damage in [(39, 0x404c60, 0x404d70, 0x405360), (40, 0x444430, 0x444540, 0x444ad0)]:
    b['player'](x=24520, y=6232); write(0x45c0a8, 2)
    offset = len(b['allocations']); call(ctor, kind + 78, update, 0, 6, 24860, 6102, kind)
    actor = b['allocations'][offset + 1]; strikes = []
    for hit in range(10):
        call(damage, actor); frames = []
        for tick in range(30):
            call(update, read(actor + 112)); frames.append(boss_values(kind, actor))
            if read(actor + 80) != 4: break
        strikes.append(frames)
    assert read(actor + 108) == 0 and read(0x45c0a8) == 1
    deaths.append({'kind': kind, 'strikes': strikes})


def shot(vx, x=24860, y=6132):
    offset = len(b['allocations']); call(0x41a670, 68, 0x41a780, 0x41a8a0, 6, x, y, vx)
    return b['allocations'][offset:offset + 2]


def shot_values(node, data):
    return {**{key: read(data + offset) for key, offset in shot_fields.items()}, 'removed': cpu.mem_read(node + 1, 1)[0] == 2}


node, data = shot(8)
bullet = {'initial': shot_values(node, data), 'images': list(a['atlases'][read(0x4772f4)].values()), 'body': [read(data + 40 + i * 4) for i in range(4)]}
bullet_traces, contacts, terrain = [], [], []
for vx, x, y in [(-8, 24860, 6132), (8, 24860, 6132), (8, 25481, 6132), (8, 24860, 6320), (0, 24860, 6132)]:
    node, data = shot(vx, x, y); initial = shot_values(node, data); frames = []
    for tick in range(170):
        call(0x41a780, node); frames.append(shot_values(node, data))
        if frames[-1]['removed']: break
    bullet_traces.append({'initial': initial, 'trace': frames})
for state in [0, 2, 4, 10, 14, 17]:
    for immune in [0, 20]:
        for vx in [-8, 0, 8]:
            node, data = shot(vx); b['player'](x=24860, y=6132, state=state, invulnerable=immune)
            before = b['player_values'](); played.clear(); call(0x4098f0, NODE, node)
            contacts.append({'before': before, 'vx': vx, 'player': b['player_values'](), 'removed': cpu.mem_read(node + 1, 1)[0] == 2, 'sounds': list(played)})
cpu.mem_write(0x478be8, struct.pack('<5h', -1, -1, -1, 0, 0) * 1500 * 210)
cpu.mem_write(0x478be8 + (10 * 1500 + 10) * 10, struct.pack('<5h', -1, 0, -1, 0, 0))
for pixel in range(1, 6):
    pixels = bytearray(640 * 32)
    for y in range(32): pixels[y * 640:y * 640 + 32] = bytes([pixel]) * 32
    cpu.mem_write(b['base']['MASK'], struct.pack('<II', 640, 32) + pixels)
    for x, y in [(310, 315), (320, 315), (330, 330)]:
        node, data = shot(8, x, y); write(data + 72, x - 8); write(data + 76, y - 10)
        initial = shot_values(node, data); hit = call(0x431130, data + 40, x, y)
        if hit: call(0x41a910, node, hit)
        terrain.append({'pixel': pixel, 'initial': initial, 'expected': shot_values(node, data)})
root = b['base']['ROOT']
(root / 'test/fixtures/original-jungle-bosses.json').write_text(json.dumps({'scene': scene, 'poses': poses, 'sequences': sequences, 'hud': hud, 'deaths': deaths,
    'bullet': bullet, 'bulletTraces': bullet_traces, 'bulletContacts': contacts, 'bulletTerrain': terrain}, separators=(',', ':')) + '\n')
(root / 'web/jungle-boss-data.js').write_text('// Native jungle dialogue86, actor story atlases and projectile68.\nexport const JUNGLE_SCENE = ' + json.dumps(scene, separators=(',', ':')) + ';\n'
    + 'export const JUNGLE_POSES = ' + json.dumps(poses, separators=(',', ':')) + ';\n'
    + 'export const JUNGLE_BOSS_BULLET = ' + json.dumps(bullet, separators=(',', ':')) + ';\n')
