"""Extract shared normal enemies and compare native movement, weapons and contacts."""
import json
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, read, write, call, loaded, played = (g[key] for key in ['base', 'cpu', 'read', 'write', 'call', 'loaded', 'played'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
resources = g['resources']
specs = {
    20: (0x428010, 0x428160, 0x428260, 0x4284f0, 0x6a, {0: 0x428650, 1: 0x428680, 2: 0x4286b0, 4: 0x4286e0}),
    21: (0x403040, 0x403190, 0x403290, 0x403530, 0x6c, {0: 0x403690, 1: 0x4036c0, 2: 0x4036f0, 4: 0x403720}),
    29: (0x419e00, 0x419f50, 0x41a050, 0x41a2f0, 0x68, {0: 0x41a450, 1: 0x41a480, 2: 0x41a4b0, 4: 0x41a4e0}),
    30: (0x44bef0, 0x44c040, 0x44c140, 0x44c420, 0x69, {0: 0x44c580, 1: 0x44c5b0, 2: 0x44c5e0, 4: 0x44c610}),
    31: (0x442290, 0x4423e0, 0x4424f0, 0x4427d0, 0x70, {0: 0x442930, 1: 0x442960, 2: 0x442990, 3: 0x442a20, 4: 0x4429c0, 5: 0x4429f0}),
    36: (0x44c9e0, 0x44cb30, 0x44cc40, 0x44d020, 0x72, {0: 0x44d160, 1: 0x44d190, 2: 0x44d1c0, 3: 0x44d1f0, 4: 0x44d220}),
    37: (0x41adf0, 0x41af40, 0x41b040, 0x41b2e0, 0x71, {0: 0x41b420, 1: 0x41b450, 2: 0x41b480, 3: 0x41b4b0}),
    22: (0x43c580, 0x43c700, 0x43c800, 0x43cb30, 0x6d, {0: 0x43cc90, 1: 0x43ccc0, 2: 0x43ccf0, 3: 0x43cd90, 4: 0x43cd20}),
    23: (0x42bd50, 0x42bed0, 0x42c010, 0x42c2d0, 0x6e, {0: 0x42c430, 1: 0x42c460, 2: 0x42c490, 4: 0x42c4c0}),
    93: (0x41d2a0, 0x41d420, 0x41d520, 0x41d8c0, 0x7e, {0: 0x41da20, 1: 0x41da50, 2: 0x41da80, 3: 0x41db20, 4: 0x41dab0}),
    39: (0x404a80, 0x404c60, 0x404d70, 0x405160, 0x75, {0: 0x4052a0, 1: 0x4052d0, 2: 0x405300, 3: 0x405330, 4: 0x405360}),
    40: (0x444250, 0x444430, 0x444540, 0x4448c0, 0x76, {0: 0x444a00, 1: 0x444a30, 2: 0x444a60, 3: 0x444a90, 4: 0x444ad0}),
    48: (0x43ad30, 0x43aeb0, 0x43afc0, 0x43b3b0, 0x7a, {0: 0x43b4f0, 1: 0x43b520, 2: 0x43b550, 3: 0x43b5e0, 4: 0x43b580, 5: 0x43b5b0, 6: 0x43b650}),
    51: (0x41db90, 0x41dce0, 0x41dde0, 0x41e060, 0x7b, {0: 0x41e1a0, 1: 0x41e1d0, 2: 0x41e200, 3: 0x41e230}),
    119: (0x4206e0, 0x420860, 0x4209a0, 0x420c30, 0x7f, {0: 0x420d90, 1: 0x420dc0, 2: 0x420e30, 3: 0x420ea0}),
    34: (0x432770, 0x4328c0, 0x4329d0, 0x432d90, 0x6f, {0: 0x432ed0, 1: 0x432f00, 2: 0x432f30, 3: 0x432f60, 4: 0x432f90}),
    41: (0x42a2e0, 0x42a4c0, 0x42a5e0, 0x42ab00, 0x77, {0: 0x42ac40, 1: 0x42ac70, 2: 0x42aca0, 3: 0x42acd0, 4: 0x42ad00, 5: 0x42ad70}),
    59: (0x442d60, 0x442f10, 0x443020, 0x443420, 0x7c, {0: 0x443580, 1: 0x4435b0, 2: 0x4435e0, 3: 0x443610, 4: 0x443640, 5: 0x443670}),
}
fields = {'x': 4, 'y': 8, 'width': 12, 'height': 16, 'frame': 24, 'ticks': 28, 'count': 32, 'period': 36,
          'oldX': 72, 'oldY': 76, 'vx': 80, 'vy': 84, 'state': 88, 'facing': 104}
small_fields = {'x': 4, 'y': 8, 'frame': 16, 'ticks': 20, 'count': 24, 'period': 28,
                'oldX': 64, 'oldY': 68, 'vx': 72, 'vy': 76, 'state': 80, 'timer': 88,
                'previousState': 92, 'facing': 96, 'width': 100, 'height': 104}
shots = []
small_kinds = [34, 36, 39, 40, 41]
death_three = [31, 37, 48, 51, 59, 119]


def observe_shot(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    shot = {key: read(sp + offset) for key, offset in [('type', 4), ('x', 20), ('y', 24), ('vx', 28), ('vy', 32)]}
    if address == 0x41a670: shot['vy'] = 0
    if address == 0x448110: shot['vy'] = 0
    if address == 0x446480: shot.update(vx=0, vy=0)
    shots.append(shot)


for address in [0x4365c0, 0x44a040, 0x445390, 0x41a670, 0x43b740, 0x448110, 0x446480]:
    cpu.hook_add(UC_HOOK_CODE, observe_shot, begin=address, end=address)
for loader in [0x436560, 0x449f20, 0x42d5e0, 0x42fc00, 0x41a550, 0x43b6c0, 0x447ff0, 0x446420]:
    call(loader)
loaded.clear(); call(0x445330)
projectile_name = loaded[-1]
call(0x44afe0)
for pointer, name in [(0x4752e8, 'DEM-SHIN.WAV'), (0x475200, 'BONUS.WAV')]:
    cpu.mem_write(0x18f2000, name.encode() + b'\0'); call(0x42d4b0, 0, pointer, 0x18f2000)


def create(kind, x=6500, y=1200):
    _, ctor, update, _, code, _ = specs[kind]
    offset = len(b['allocations'])
    call(ctor, code, update, 0, 6, x, y, kind)
    return b['allocations'][offset:offset + 2]


def values(kind, node, data):
    layout = small_fields if kind in small_kinds else fields
    result = {key: read(data + offset) for key, offset in layout.items()}
    if kind in [22, 30, 93]: result['timer'] = read(data + 108)
    if kind == 31: result.update(leftTicks=read(data + 108), rightTicks=read(data + 112))
    if kind == 48: result.update(timer=read(data + 108), leftTicks=read(data + 112), rightTicks=read(data + 116))
    if kind in [39, 40, 41]: result['health'] = read(data + 108)
    if kind == 59: result.update(timer=read(data + 108), health=read(data + 116))
    table = read(data + (12 if kind in small_kinds else 20))
    result['spriteIndex'] = read(table + result['frame'] * 4)
    result['removed'] = cpu.mem_read(node + 1, 1)[0] == 2
    return result


map_data = resources['stage2.map']
width, height = struct.unpack_from('<II', map_data)
for row in range(height):
    cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
cpu.mem_write(0x18f2000, b'block2.app\0'); call(0x4402c0, 0x18f2000)
write(CAMERA + 4, 6200); write(CAMERA + 8, 1000)
metadata, movement, contacts, weapons, terrain = {}, [], [], [], []
for kind, (loader, _, update, resolve, code, entries) in specs.items():
    loaded.clear(); call(loader)
    images = list(loaded)
    played.clear(); node, data = create(kind); spawn_sounds = list(played)
    initial = values(kind, node, data)
    body_offset = 32 if kind in small_kinds else 40
    body = [read(data + body_offset + i * 4) for i in range(4)]
    states, attack_sound, turn_sounds = {}, [], {}
    for state, entry in entries.items():
        played.clear(); call(entry, data)
        current = values(kind, node, data)
        table = read(data + (12 if kind in small_kinds else 20))
        states[state] = {'frames': [read(table + i * 4) for i in range(current['count'])], 'period': current['period']}
        if state == (3 if kind in death_three else 4): death_sound = list(played)
        if (state == 3 and kind in [22, 93]) or (state == 6 and kind == 48): attack_sound = list(played)
        if state in [0, 1, 2] and played: turn_sounds[state] = list(played)
    metadata[kind] = {'images': images, 'initial': initial, 'body': body, 'states': states,
                      'deathState': 3 if kind in death_three else 4, 'deathSound': death_sound}
    if attack_sound: metadata[kind]['attackSound'] = attack_sound
    if spawn_sounds: metadata[kind]['spawnSounds'] = spawn_sounds
    if turn_sounds: metadata[kind]['turnSounds'] = turn_sounds
    if kind in [39, 40, 41, 59]: metadata[kind].update(healthImage=images[-2], headImage=images[-1], images=images[:-2])
    for scenario in ['walk', 'dead', *(['below', 'attack5'] if kind in [41, 59] else [])]:
        node, data = create(kind)
        if scenario == 'dead': call(entries[metadata[kind]['deathState']], data)
        if scenario == 'attack5': call(entries[5], data)
        start = values(kind, node, data); trace = []
        for tick in range(50 if scenario == 'dead' else 460):
            state = {100: 2, 200: 0, 310: 1}.get(tick) if scenario == 'walk' else None
            if state is not None: call(entries[state], data)
            px = 6900 if tick < 230 else 6100
            py = 2000 if scenario == 'below' else 1336
            b['player'](x=px, y=py)
            shots.clear(); played.clear(); call(update, node)
            hit = call(0x431130, data + body_offset, read(data + 4), read(data + 8))
            if hit: call(resolve, node, hit)
            trace.append({'state': state, 'playerX': px, 'playerY': py, 'expected': values(kind, node, data), 'shots': list(shots), 'sounds': list(played)})
            if cpu.mem_read(node + 1, 1)[0] == 2: break
        movement.append({'kind': kind, 'scenario': scenario, 'initial': start, 'trace': trace})
    for enemy_state in ([1, 3, 4, 5] if kind in [41, 59] else [1, 3, 4] if kind in [34, 39, 40] else [1, 3, 4, 5, 6] if kind == 48 else [1, metadata[kind]['deathState']]):
        for player_state in [0, 2, 4, 10, 14, 17]:
            for scenario in ['side', 'descending', 'rising', 'immune', 'bonus']:
                node, data = create(kind); call(entries[enemy_state], data)
                p_y = 1200 + body[1] - 60 if scenario in ['descending', 'rising', 'bonus'] else 1250
                b['player'](x=6500, y=p_y, state=player_state, vy=-5 if scenario == 'rising' else 5,
                            invulnerable=20 if scenario == 'immune' else 0, points=99 if scenario == 'bonus' else 0)
                before = b['player_values'](); played.clear()
                call(0x4098f0, NODE, node)
                contacts.append({'kind': kind, 'enemyState': enemy_state, 'before': before, 'scenario': scenario,
                                 'player': b['player_values'](), 'enemy': values(kind, node, data), 'sounds': list(played)})
    for kind_shot, ctor, update_shot, contact in [(65, 0x42d640, 0x42d730, 0x42d810), (66, 0x42fc60, 0x42fd50, 0x42fe30)]:
        for enemy_state in [1, 3, 4, 5] if kind in [41, 59] else [1]:
            node, data = create(kind); b['player'](); call(entries[enemy_state], data)
            offset = len(b['allocations']); call(ctor, kind_shot, update_shot, 0, 6, 6500, 1200, 10)
            shot_node = b['allocations'][offset]
            played.clear(); call(contact, shot_node, node)
            weapons.append({'kind': kind, 'type': kind_shot, 'enemyState': enemy_state, 'enemy': values(kind, node, data),
                            'points': read(PLAYER + 0x70), 'removed': cpu.mem_read(shot_node + 1, 1)[0] == 2, 'sounds': list(played)})
    print(kind, len(images), 'images, movement and contacts captured', flush=True)

secondary = [kind for kind in range(13, 123) if read(0x427860 + cpu.mem_read(0x427888 + kind - 13, 1)[0] * 4) != 0x427855]
ignored = [kind for kind in range(127) if read(0x427408 + kind * 4) == 0x427403 and kind not in secondary]
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
        for kind in specs:
            for enemy_state in [1, 3, 4, 5] if kind in [41, 59] else [1]:
                b['player'](); node, data = create(kind); call(specs[kind][5][enemy_state], data)
                call(contact, ally_node, node)
                first = {'enemy': values(kind, node, data), 'points': read(PLAYER + 0x70)}
                call(contact, ally_node, node)
                second = {'enemy': values(kind, node, data), 'points': read(PLAYER + 0x70)}
                allies.append({'slot': slot, 'state': state, 'kind': kind, 'enemyState': enemy_state, 'first': first, 'second': second})

booster_contacts, lasers, ranges = [], [], []
for kind in [20, 21]:
    for enemy_state in [1, 4]:
        for state, setter in [(26, 0x40db10), (27, 0x40db40), (28, 0x40db80)]:
            for scenario in ['left', 'right', 'immune']:
                node, data = create(kind); call(specs[kind][5][enemy_state], data)
                b['player'](x=6500 if scenario != 'right' else 6700, y=1250, points=99, invulnerable=30 if scenario == 'immune' else 0)
                call(setter, PLAYER)
                before = b['player_values'](); played.clear(); call(0x407bf0, NODE, node)
                booster_contacts.append({'kind': kind, 'enemyState': enemy_state, 'before': before,
                                         'player': b['player_values'](), 'enemy': values(kind, node, data), 'sounds': list(played)})
        node, data = create(kind); call(specs[kind][5][enemy_state], data)
        b['player'](points=99)
        offset = len(b['allocations']); call(0x44b040, 35, 0x44b120, 0x44b1b0, 6, 6500, 1200, 12)
        shot_node = b['allocations'][offset]
        played.clear(); call(0x44b200, shot_node, node)
        lasers.append({'kind': kind, 'enemyState': enemy_state, 'enemy': values(kind, node, data),
                       'points': read(PLAYER + 112), 'lives': read(PLAYER + 140), 'removed': cpu.mem_read(shot_node + 1, 1)[0] == 2, 'sounds': list(played)})
for kind in [20, 21, 22, 23, 34, 48, 51, 93, 119]:
    for x, y in [(3079, 2000), (3080, 2000), (7560, 2000), (7561, 2000), (5000, 559), (5000, 560), (5000, 3920), (5000, 3921), (4359, 2000), (4360, 2000), (6280, 2000), (6281, 2000)]:
        write(CAMERA + 4, 5000); write(CAMERA + 8, 2000)
        node, data = create(kind, x, y)
        initial = values(kind, node, data); call(specs[kind][2], node)
        ranges.append({'kind': kind, 'initial': initial, 'expected': values(kind, node, data)})

def projectile(vx=0, vy=6, x=6500, y=1200):
    offset = len(b['allocations']); call(0x445390, 97, 0x445480, 0x445520, 6, x, y, vx, vy)
    return b['allocations'][offset:offset + 2]


def projectile_values(node, data):
    return {**{key: read(data + offset) for key, offset in [('x', 4), ('y', 8), ('width', 12), ('height', 16),
            ('oldX', 52), ('oldY', 56), ('vx', 60), ('vy', 64), ('bounces', 68)]}, 'removed': cpu.mem_read(node + 1, 1)[0] == 2}


node, data = projectile()
projectile_data = {'name': projectile_name, 'width': read(data + 12), 'height': read(data + 16),
                   'body': [read(data + 20 + i * 4) for i in range(4)]}
projectile_traces, projectile_contacts, projectile_terrain = [], [], []
write(CAMERA + 4, 6200); write(CAMERA + 8, 1000)
for vx, vy in [(0, 6), (-10, -16), (10, -16)]:
    node, data = projectile(vx, vy); initial = projectile_values(node, data); trace = []
    for tick in range(240):
        call(0x445480, node)
        if cpu.mem_read(node + 1, 1)[0] != 2:
            hit = call(0x431130, data + 20, read(data + 4), read(data + 8))
            if hit: call(0x445580, node, hit)
        trace.append(projectile_values(node, data))
        if trace[-1]['removed']: break
    projectile_traces.append({'initial': initial, 'trace': trace})
for state in [0, 2, 4, 10, 14, 17]:
    for immune in [0, 20]:
        for vx in [-10, 0, 10]:
            node, data = projectile(vx)
            b['player'](x=6500, y=1200, state=state, invulnerable=immune)
            before = b['player_values'](); played.clear(); call(0x4098f0, NODE, node)
            projectile_contacts.append({'before': before, 'vx': vx, 'player': b['player_values'](),
                                        'removed': cpu.mem_read(node + 1, 1)[0] == 2, 'sounds': list(played)})

# Isolate type 1/2 corrections; block2 contains no type-2 pixels.
empty = struct.pack('<hhhhh', -1, -1, -1, 0, 0)
cpu.mem_write(0x478be8, empty * 1500 * 210)
cpu.mem_write(0x478be8 + (10 * 1500 + 10) * 10, struct.pack('<hhhhh', -1, 0, -1, 0, 0))
for pixel in [1, 2]:
    pixels = bytearray(640 * 32)
    for y in range(32): pixels[y * 640:y * 640 + 32] = bytes([pixel]) * 32
    cpu.mem_write(b['base']['MASK'], struct.pack('<II', 640, 32) + pixels)
    for kind, (_, _, _, resolve, _, _) in specs.items():
        for x, y in [(280, 250), (295, 250), (320, 250), (295, 290), (295, 330)]:
            node, data = create(kind, x, y)
            offsets = small_fields if kind in small_kinds else fields
            write(data + offsets['oldX'], x - 7); write(data + offsets['oldY'], y - 11)
            write(data + offsets['vy'], 11)
            before = values(kind, node, data)
            hit = call(0x431130, data + (32 if kind in small_kinds else 40), x, y)
            if hit: call(resolve, node, hit)
            terrain.append({'kind': kind, 'pixel': pixel, 'before': before, 'expected': values(kind, node, data)})
    for x, y in [(300, 300), (310, 310), (320, 310), (340, 310), (330, 330)]:
        for bounces in [0, 1]:
            node, data = projectile(10, 11, x, y)
            write(data + 52, x - 7); write(data + 56, y - 11); write(data + 68, bounces)
            initial = projectile_values(node, data)
            hit = call(0x431130, data + 20, x, y)
            if hit: call(0x445580, node, hit)
            projectile_terrain.append({'pixel': pixel, 'initial': initial, 'expected': projectile_values(node, data)})
root = b['base']['ROOT']
(root / 'test/fixtures/original-stage2-actors.json').write_text(json.dumps({'projectile': projectile_data, 'projectileTraces': projectile_traces,
    'projectileContacts': projectile_contacts, 'projectileTerrain': projectile_terrain, 'boosterContacts': booster_contacts, 'lasers': lasers, 'ranges': ranges,
    'metadata': metadata, 'movement': movement, 'contacts': contacts, 'weapons': weapons, 'ignored': ignored, 'allies': allies, 'terrain': terrain}, separators=(',', ':')) + '\n')
(root / 'web/stage2-actor-data.js').write_text('// Extracted by capture-stage2-actors.py from SHIN.EXE constructors and animation entries.\n'
    + 'export const STAGE2_ACTORS = ' + json.dumps(metadata, separators=(',', ':')) + ';\n'
    + 'export const JUNGLE_PROJECTILE = ' + json.dumps(projectile_data, separators=(',', ':')) + ';\n'
    + 'export const IGNORED_KINDS = ' + json.dumps(ignored) + ';\n')
