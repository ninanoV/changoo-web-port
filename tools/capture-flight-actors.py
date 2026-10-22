"""Native shooting enemies, decorative clouds, bullets and player/laser contacts."""
import json
import struct
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, write, read, call, loaded, played = (g[key] for key in ['base', 'cpu', 'write', 'read', 'call', 'loaded', 'played'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
specs = {
    55: (0x415c30, 0x415d80, 0x415e90, 0x416430, 31, [0x416630, 0x416660, 0x416690, 0x4166c0, 0x4166f0]),
    56: (0x4496d0, 0x449820, 0x449930, 0x449bf0, 32, [0x449df0, 0x449e20, 0x449e50, 0x449e80, 0x449eb0]),
    57: (0x43f420, 0x43f570, 0x43f680, 0x43f920, 33, [0x43fb40, 0x43fb70, 0x43fba0, 0x43fbd0, 0x43fc00]),
    58: (0x430d10, 0x430d70, 0x430e00, 0x430e90, 34, []),
}
for kind in range(60, 65): specs[kind] = specs[55]
bullet_specs = {36: (0x42cac0, 0x42cb20, 0x42cc00, 0x42cc90), 37: (0x41e4a0, 0x41e500, 0x41e610, 0x41e6b0)}
fields = {'x': 4, 'y': 8, 'frame': 16, 'ticks': 20, 'frameCount': 24, 'period': 28,
          'oldX': 64, 'oldY': 68, 'vx': 72, 'vy': 76, 'state': 80, 'timer': 88, 'previousState': 92,
          'facing': 96, 'width': 100, 'height': 104}
cloud_fields = {'x': 4, 'y': 8, 'oldX': 44, 'oldY': 48, 'vx': 52, 'vy': 56, 'width': 68, 'height': 72}
bullet_fields = {'x': 4, 'y': 8, 'width': 12, 'height': 16, 'oldX': 52, 'oldY': 56, 'vx': 60, 'vy': 64}
spawns = []


def emit(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    kind = 36 if address == 0x42cb20 else 37
    x, y = read(sp + 20), read(sp + 24)
    vx = read(sp + 28) if kind == 36 else int((read(PLAYER + 8) - x) / 40)
    vy = 0 if kind == 36 else int((read(PLAYER + 12) - y) / 40)
    spawns.append({'type': kind, 'x': x, 'y': y, 'vx': vx, 'vy': vy})


for _, ctor, _, _ in bullet_specs.values(): cpu.hook_add(UC_HOOK_CODE, emit, begin=ctor, end=ctor)
call(0x434c10)
for loader in [0x415c30, 0x4496d0, 0x43f420, 0x430d10, 0x42cac0, 0x41e4a0, 0x44afe0]: call(loader)
for pointer, name in [(0x4752e8, 'DEM-SHIN.WAV'), (0x475200, 'BONUS.WAV')]:
    cpu.mem_write(0x18f2000, name.encode() + b'\0')
    call(0x42d4b0, 0, pointer, 0x18f2000)


def create(kind, x=6500, y=200):
    _, ctor, update, destructor, code, _ = specs[kind]
    offset = len(b['allocations'])
    call(ctor, code, update, destructor, 6, x, y, kind)
    return b['allocations'][offset:offset + 2]


def values(kind, node, data):
    result = {key: read(data + offset) for key, offset in (cloud_fields if kind == 58 else fields).items()}
    if kind in [55, 60, 61, 62, 63, 64]: result['age'] = read(data + 108)
    if kind != 58: result['spriteIndex'] = read(read(data + 12) + result['frame'] * 4)
    return {**result, 'removed': cpu.mem_read(node + 1, 1)[0] == 2}


metadata, traces, contacts, lasers = {}, [], [], []
for kind, (loader, _, update, _, _, setters) in specs.items():
    loaded.clear(); call(loader)
    node, data = create(kind)
    initial = values(kind, node, data)
    animations = {}
    for state, setter in enumerate(setters):
        call(setter, data)
        animations[state] = {'frames': [read(read(data + 12) + i * 4) for i in range(read(data + 24))], 'period': read(data + 28)}
    metadata[kind] = {'images': list(loaded), 'initial': initial, 'animations': animations,
                      'body': None if kind == 58 else [read(data + 32 + i * 4) for i in range(4)]}
    for state in ([None] if kind == 58 else [0, 1, 2, 4]):
        node, data = create(kind)
        if state is not None: call(setters[state], data)
        initial = values(kind, node, data)
        frames = []
        for tick in range(620 if kind in [55, 60, 61, 62, 63, 64] else 440):
            camera = {'x': read(data + 4) - 300, 'y': 0}
            write(CAMERA + 4, camera['x']); write(CAMERA + 8, 0)
            player = {'x': read(data + 4) + (200 if tick % 90 < 45 else -200), 'y': 100 if tick % 110 < 55 else 400}
            b['player'](**player)
            spawns.clear(); call(update, node)
            frames.append({'player': player, 'camera': camera, 'expected': values(kind, node, data), 'shots': list(spawns)})
            if frames[-1]['expected']['removed']: break
        traces.append({'kind': kind, 'state': state, 'initial': initial, 'trace': frames})
    if kind == 58: continue
    for state in [18, 19]:
        for immune in [0, 30]:
            for dead_enemy in [False, True]:
                b['player'](x=6500, y=200, points=99, invulnerable=immune); call(0x40daa0 if state == 18 else 0x40dad0, PLAYER)
                node, data = create(kind)
                if dead_enemy: call(setters[4], data)
                before, enemy = b['player_values'](), values(kind, node, data)
                played.clear(); call(0x4077d0, NODE, node)
                first = {'player': b['player_values'](), 'actor': values(kind, node, data), 'sounds': list(played)}
                played.clear(); call(0x4077d0, NODE, node)
                contacts.append({'kind': kind, 'before': before, 'initial': enemy, 'first': first,
                                 'second': {'player': b['player_values'](), 'actor': values(kind, node, data), 'sounds': list(played)}})
    for dead_enemy in [False, True]:
        b['player'](x=6500, y=200, points=99); call(0x40daa0, PLAYER)
        node, data = create(kind)
        if dead_enemy: call(setters[4], data)
        offset = len(b['allocations']); call(0x44b040, 35, 0x44b120, 0x44b1b0, 6, 6500, 200, 24)
        shot_node = b['allocations'][offset]
        before, initial = b['player_values'](), values(kind, node, data)
        played.clear(); call(0x44b200, shot_node, node)
        first = {'player': b['player_values'](), 'actor': values(kind, node, data), 'removed': cpu.mem_read(shot_node + 1, 1)[0] == 2, 'sounds': list(played)}
        played.clear(); call(0x44b200, shot_node, node)
        lasers.append({'kind': kind, 'before': before, 'initial': initial, 'first': first,
                       'second': {'player': b['player_values'](), 'actor': values(kind, node, data), 'removed': cpu.mem_read(shot_node + 1, 1)[0] == 2, 'sounds': list(played)}})
    print(kind, metadata[kind]['images'], flush=True)

offscreen = []
for kind in specs:
    for x in [-641, -640, 1280, 1281]:
        b['player'](x=200, y=100)
        node, data = create(kind, x, 200)
        write(CAMERA + 4, 0); write(CAMERA + 8, 0)
        initial = values(kind, node, data)
        call(specs[kind][2], node)
        offscreen.append({'kind': kind, 'initial': initial, 'expected': values(kind, node, data)})

bullets, bullet_traces, bullet_contacts = {}, [], []
for kind, (loader, ctor, update, destructor) in bullet_specs.items():
    loaded.clear(); call(loader)
    for aim in [(6100, 100), (6800, 400), (6500, 200)]:
        b['player'](x=aim[0], y=aim[1]); call(0x40daa0, PLAYER)
        offset = len(b['allocations']); call(ctor, kind, update, destructor, 6, 6500, 200, -8)
        node, data = b['allocations'][offset:offset + 2]
        initial = {key: read(data + offset) for key, offset in bullet_fields.items()}
        bullets[kind] = {'image': loaded[-1], 'body': [read(data + 20 + i * 4) for i in range(4)],
                         'width': initial['width'], 'height': initial['height']}
        trace = []
        write(CAMERA + 4, 6200); write(CAMERA + 8, 0)
        for tick in range(300):
            call(update, node)
            trace.append({**{key: read(data + offset) for key, offset in bullet_fields.items()}, 'removed': cpu.mem_read(node + 1, 1)[0] == 2})
            if trace[-1]['removed']: break
        bullet_traces.append({'kind': kind, 'aim': aim, 'initial': initial, 'trace': trace})
    for state in [18, 19]:
        for immune in [0, 30]:
            b['player'](x=6500, y=200, invulnerable=immune); call(0x40daa0 if state == 18 else 0x40dad0, PLAYER)
            offset = len(b['allocations']); call(ctor, kind, update, destructor, 6, 6500, 200, -8)
            node = b['allocations'][offset]
            before = b['player_values'](); played.clear(); call(0x4077d0, NODE, node)
            bullet_contacts.append({'kind': kind, 'before': before, 'player': b['player_values'](),
                                    'removed': cpu.mem_read(node + 1, 1)[0] == 2, 'sounds': list(played)})

allies = []
for slot, ctor, update, code, attack in [(2, 0x417c20, 0x417f00, 0x36, 3), (3, 0x44e660, 0x44e760, 0x34, 1),
                                      (5, 0x422c10, 0x422d10, 0x37, 3), (6, 0x4168a0, 0x4169a0, 0x33, 2),
                                      (7, 0x446f20, 0x447020, 0x38, 0), (4, 0x439500, 0x4395f0, 0x35, 3)]:
    for address in [0x45ef68, 0x45ef6c, 0x45ee58, 0x461224, 0x470d20, 0x46cda8, 0x45e8a8]: write(address, 0)
    b['player']()
    if slot == 4: call(0x439440)
    offset = len(b['allocations']); call(ctor, code, update, 0, 6, 10, 400)
    ally_node, ally_data = b['allocations'][offset:offset + 2]
    contact = 0x439820 if slot == 4 else read(read(ally_data + 0x38) + 12)
    for state in sorted({0, attack}):
        write(ally_data + (0x48 if slot == 4 else 0x58), state)
        for kind in [55, 56, 57, 60, 61, 62, 63, 64]:
            b['player'](); node, data = create(kind)
            call(contact, ally_node, node)
            first = {'enemy': values(kind, node, data), 'points': read(PLAYER + 0x70)}
            call(contact, ally_node, node)
            second = {'enemy': values(kind, node, data), 'points': read(PLAYER + 0x70)}
            allies.append({'slot': slot, 'state': state, 'kind': kind, 'first': first, 'second': second})
print('Ally contacts:', len(allies), 'damaging:', sum(a['first']['points'] > 0 for a in allies), flush=True)

ally_updates = []
for slot, cost, ctor, update, destructor, code in [(2, 1, 0x417c20, 0x417f00, 0x418160, 0x36),
    (2, 2, 0x417c20, 0x417d20, 0x418160, 0x36), (3, 1, 0x44e660, 0x44e760, 0x44e920, 0x34),
    (5, 1, 0x422c10, 0x422d10, 0x422f90, 0x37)]:
    for priority in range(10): write(0x1601000 + priority * 64 + 24, 0)
    write(0x1601404, 0)
    for address in [0x45ef68, 0x45ef6c, 0x45ee58, 0x461224, 0x470d20, 0x46cda8, 0x45e8a8]: write(address, 0)
    b['player'](x=100, y=200); write(CAMERA + 4, 0); write(CAMERA + 8, 0)
    actors = [create(kind, 300 + i * 100, 200) for i, kind in enumerate([55, 56, 57])]
    offset = len(b['allocations']); call(ctor, code, update, destructor, 6)
    node, data = b['allocations'][offset:offset + 2]
    frames = []
    for tick in range(700):
        call(update, node)
        frames.append({'x': read(data + 4), 'y': read(data + 8), 'state': read(data + 88),
                       'removed': cpu.mem_read(node + 1, 1)[0] == 2,
                       'enemies': [values(kind, *actor) for kind, actor in zip([55, 56, 57], actors)]})
        if frames[-1]['removed']: break
    assert frames[-1]['removed']
    ally_updates.append({'slot': slot, 'cost': cost, 'trace': frames})
    print('Ally update', slot, cost, len(frames), [a['state'] for a in frames[-1]['enemies']], flush=True)

# Exercise the original scheduler and body/terrain managers with moving flight actors.
coupled = []
cpu.mem_write(0x18f2000, b'sblock.app\0'); call(0x4402c0, 0x18f2000)
for scenario in ['laser', 'contact', 'bullets']:
    for priority in range(10):
        write(0x1601000 + priority * 64 + 24, 0)
        write(0x471920 + priority * 4, 1)
    write(0x1601404, 0); write(0x1601504, 0)
    b['player'](x=100, y=200)
    write(CAMERA + 4, 0); write(CAMERA + 8, 0); write(CAMERA + 68, 1400); write(CAMERA + 72, 20)
    write(NODE + 4, 0x405cf0); write(NODE + 8, 0x407760)
    write(NODE + 20, 0x1601200); write(NODE + 24, 0); write(0x1601218, NODE)
    cpu.mem_write(NODE + 1, b'\0')
    contact = call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x4098f0)
    write(PLAYER + 60, contact)
    call(0x431050, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x40d4c0)
    call(0x40dbb0, PLAYER)
    for ctor, update, destructor, code in [(0x430fd0, 0x431000, 0x4310f0, 3), (0x434a20, 0x434a50, 0x434be0, 2)]:
        offset = len(b['allocations']); call(ctor, code, update, destructor, 9)
        cpu.mem_write(b['allocations'][offset] + 1, b'\0')
    placements = [{'kind': 55, 'x': 350, 'y': 200}, {'kind': 56, 'x': 480, 'y': 200}, {'kind': 57, 'x': 600, 'y': 200}]
    actors = [create(a['kind'], a['x'], a['y']) for a in placements]
    for node, _ in actors: cpu.mem_write(node + 1, b'\0')
    frames = []
    for tick in range(160):
        inputs = {'fire': scenario == 'laser' and tick % 12 == 0,
                  'up': scenario == 'bullets' and 30 <= tick < 40,
                  'down': scenario == 'bullets' and 65 <= tick < 75}
        for key, address in [('left', 0x46d4b8), ('right', 0x46d4bc), ('up', 0x46d4b0), ('down', 0x46d4b4), ('fire', 0x46d4e8)]:
            write(address, int(inputs.get(key, False)))
        for address in [0x46d4d8, 0x46d4f0, 0x461754]: write(address, 0)
        camera = {'x': tick * 3, 'y': 0}
        write(CAMERA + 4, camera['x']); write(CAMERA + 8, 0)
        played.clear(); call(0x44d3a0)
        shots = []
        node = read(0x1601198)
        while node:
            kind = cpu.mem_read(node, 1)[0]
            if kind in [35, 36, 37]:
                data = read(node + 12)
                shots.append({'type': kind, 'x': read(data + 4), 'y': read(data + 8), 'vx': read(data + 60), 'vy': read(data + 64)})
            node = read(node + 24)
        frames.append({'input': inputs, 'camera': camera, 'player': b['player_values'](),
                       'actors': [values(a['kind'], *actor) for a, actor in zip(placements, actors)],
                       'shots': shots, 'sounds': list(played)})
    coupled.append({'scenario': scenario, 'placements': placements, 'trace': frames})
print('Scheduler ticks:', sum(len(t['trace']) for t in coupled), flush=True)

terrain = []
empty = struct.pack('<hhhhh', -1, -1, -1, 0, 0)
cpu.mem_write(0x478be8, empty * 1500 * 210)
cpu.mem_write(0x478be8 + (10 * 1500 + 10) * 10, struct.pack('<hhhhh', -1, 0, -1, 0, 0))
for pixel in [1, 2]:
    for row in range(32): cpu.mem_write(b['base']['MASK'] + 8 + row * 640, bytes([pixel]) * 32)
    for kind, callback in [(35, 0x44bbd0), (36, 0x42cfd0), (37, 0x41e9f0)]:
        _, ctor, update, destructor = (0x44afe0, 0x44b040, 0x44b120, 0x44b1b0) if kind == 35 else bullet_specs[kind]
        for x, y, old_x, old_y in [(325, 320, 325, 300), (325, 344, 300, 344), (340, 344, 360, 344), (325, 344, 325, 300), (325, 344, 325, 370)]:
            b['player'](x=100, y=200)
            offset = len(b['allocations']); call(ctor, kind, update, destructor, 6, x, y, 8)
            node, data = b['allocations'][offset:offset + 2]
            for key, value in [('oldX', old_x), ('oldY', old_y), ('vx', 8), ('vy', 5)]: write(data + bullet_fields[key], value)
            before = {key: read(data + offset) for key, offset in bullet_fields.items()}
            call(callback, node, pixel)
            expected = {**{key: read(data + offset) for key, offset in bullet_fields.items()},
                        'bounces': read(data + 68), 'removed': cpu.mem_read(node + 1, 1)[0] == 2}
            terrain.append({'kind': kind, 'pixel': pixel, 'before': before, 'expected': expected})

root = b['base']['ROOT']
result = {'metadata': metadata, 'traces': traces, 'contacts': contacts, 'lasers': lasers,
          'terrain': terrain, 'allyUpdates': ally_updates, 'coupled': coupled, 'allies': allies, 'offscreen': offscreen, 'bullets': bullets, 'bulletTraces': bullet_traces, 'bulletContacts': bullet_contacts,
          'scope': 'Original isolated constructors, updates and collision callbacks; real image metadata, substituted graphics/audio. Camera positions explicitly supplied; sblock has no solid pixels.'}
(root / 'test/fixtures/original-flight-actors.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
(root / 'web/flight-actor-data.js').write_text('// Extracted by capture-flight-actors.py from SHIN.EXE.\n'
    + 'export const FLIGHT_ACTORS = ' + json.dumps(metadata, separators=(',', ':')) + ';\n'
    + 'export const FLIGHT_BULLETS = ' + json.dumps(bullets, separators=(',', ':')) + ';\n')
print('Movement ticks:', sum(len(t['trace']) for t in traces), 'contacts:', len(contacts), 'lasers:', len(lasers), flush=True)
