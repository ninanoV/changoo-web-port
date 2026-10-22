"""Capture the second boss and its distinct bouncing projectile; story hooks are recorded separately."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, read, write, call, loaded, played = (g[key] for key in ['base', 'cpu', 'read', 'write', 'call', 'loaded', 'played'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
requests, shots = [], []


def story(uc, address, size, _):
    requests.append('intro' if address == 0x404320 else 'death')
    g['return_from'](uc)


def projectile(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    shots.append({'type': 91, 'variant': 'boss2', **{key: read(sp + offset) for key, offset in [('x', 20), ('y', 24), ('vx', 28), ('vy', 32)]}})


for address in [0x404320, 0x43c140]: cpu.hook_add(UC_HOOK_CODE, story, begin=address, end=address)
cpu.hook_add(UC_HOOK_CODE, projectile, begin=0x402350, end=0x402350)
call(0x437d10); images = list(loaded)
loaded.clear(); call(0x4022f0); projectile_image = loaded[0]
call(0x42d5e0); call(0x42fc00)
map_data = g['resources']['stage2.map']
width, height = int.from_bytes(map_data[:4], 'little'), int.from_bytes(map_data[4:8], 'little')
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
cpu.mem_write(0x18f2000, b'block2.app\0'); call(0x4402c0, 0x18f2000)


def create():
    b['player'](x=22800, y=3032)
    write(CAMERA + 4, 22500); write(CAMERA + 8, 2719)
    offset = len(b['allocations']); requests.clear()
    call(0x437ef0, 0x73, 0x438020, 0x438390, 6, 23018, 2912, 32)
    assert requests == ['intro']
    return b['allocations'][offset:offset + 2]


def values(node, data):
    fields = {'x': 4, 'y': 8, 'frame': 16, 'ticks': 20, 'count': 24, 'period': 28, 'oldX': 64, 'oldY': 68,
              'vx': 72, 'vy': 76, 'state': 80, 'timer': 88, 'previousState': 92, 'facing': 96, 'width': 100, 'height': 104, 'health': 108}
    result = {key: read(data + offset) for key, offset in fields.items()}
    result['spriteIndex'] = read(read(data + 12) + result['frame'] * 4)
    result['removed'] = cpu.mem_read(node + 1, 1)[0] == 2
    return result


entries = {0: 0x4385b0, 1: 0x4385e0, 2: 0x438610, 6: 0x438640, 7: 0x438670}
node, data = create(); initial = values(node, data)
body = [read(data + 32 + i * 4) for i in range(4)]
states = {}
for state, entry in entries.items():
    played.clear(); call(entry, data)
    states[state] = {'frames': [read(read(data + 12) + i * 4) for i in range(read(data + 24))], 'period': read(data + 28)}
    if state == 7: damage_sounds = list(played)
metadata = {'initial': initial, 'body': body, 'images': images[:19], 'healthImage': images[19], 'headImage': images[20], 'states': states, 'damageSounds': damage_sounds}
node, data = create(); movement = []
for tick in range(800):
    player_x = 22800 if tick < 400 else 23200
    write(PLAYER + 8, player_x); shots.clear(); requests.clear()
    call(0x438020, node)
    hit = call(0x431130, data + 32, read(data + 4), read(data + 8))
    if hit: call(0x438470, node, hit)
    movement.append({'playerX': player_x, 'expected': values(node, data), 'shots': list(shots)})

contacts, weapons, death = [], [], []
for state in [1, 6, 7]:
    for player_state in [0, 2, 4, 10, 14, 17]:
        for scenario in ['side', 'descending', 'rising', 'immune']:
            node, data = create(); call(entries[state], data)
            b['player'](x=23018, y=2852 if scenario in ['descending', 'rising'] else 3032, state=player_state,
                        vy=-5 if scenario == 'rising' else 5, invulnerable=20 if scenario == 'immune' else 0)
            before = b['player_values'](); played.clear(); call(0x4098f0, NODE, node)
            contacts.append({'state': state, 'scenario': scenario, 'before': before, 'player': b['player_values'](), 'boss': values(node, data), 'sounds': list(played)})
for type_shot, ctor, update, contact in [(65, 0x42d640, 0x42d730, 0x42d810), (66, 0x42fc60, 0x42fd50, 0x42fe30)]:
    for state in [1, 6, 7]:
        node, data = create(); call(entries[state], data)
        offset = len(b['allocations']); call(ctor, type_shot, update, 0, 6, 23018, 2912, 10)
        shot_node = b['allocations'][offset]; call(contact, shot_node, node)
        weapons.append({'type': type_shot, 'state': state, 'boss': values(node, data), 'points': read(PLAYER + 112), 'removed': cpu.mem_read(shot_node + 1, 1)[0] == 2})
node, data = create()
for strike in range(10):
    call(0x438670, data)
    frames = []
    for tick in range(23):
        requests.clear(); call(0x438020, node)
        hit = call(0x431130, data + 32, read(data + 4), read(data + 8))
        if hit: call(0x438470, node, hit)
        frames.append({'expected': values(node, data), 'requests': list(requests)})
        if read(data + 80) != 7 or cpu.mem_read(node + 1, 1)[0] == 2: break
    death.append(frames)
assert values(node, data)['health'] == 0 and values(node, data)['removed'] and death[-1][-1]['requests'] == ['death']

projectiles = []
for vx in [-7, 0, 7]:
    offset = len(b['allocations']); call(0x402350, 91, 0x402440, 0x4024d0, 6, 23018, 2942, vx, -16)
    node, data = b['allocations'][offset:offset + 2]
    fields = {'x': 4, 'y': 8, 'width': 12, 'height': 16, 'oldX': 52, 'oldY': 56, 'vx': 60, 'vy': 64, 'bounces': 68}
    def shot_values(): return {**{key: read(data + offset) for key, offset in fields.items()}, 'removed': cpu.mem_read(node + 1, 1)[0] == 2}
    before = shot_values(); frames = []
    for tick in range(300):
        call(0x402440, node)
        hit = call(0x431130, data + 20, read(data + 4), read(data + 8))
        if hit: call(0x402530, node, hit)
        frames.append(shot_values())
        if cpu.mem_read(node + 1, 1)[0] == 2: break
    projectiles.append({'initial': before, 'trace': frames})

outside = []
call(0x436560); call(0x42d1f0)
for type_shot, variant, ctor, update in [(65, None, 0x42d640, 0x42d730), (66, None, 0x42fc60, 0x42fd50),
                                       (91, None, 0x4365c0, 0x4366b0), (95, None, 0x42d2a0, 0x42d380),
                                       (91, 'boss2', 0x402350, 0x402440)]:
    offset = len(b['allocations']); call(ctor, type_shot, update, 0, 6, 24500, 2900, 4, -10)
    node, data = b['allocations'][offset:offset + 2]
    before = {'x': read(data + 4), 'y': read(data + 8)}
    call(update, node)
    outside.append({'type': type_shot, 'variant': variant, 'before': before,
                    'after': {'x': read(data + 4), 'y': read(data + 8), 'removed': cpu.mem_read(node + 1, 1)[0] == 2}})
allies = []
for slot, ctor, update, code, attack in [(2, 0x417c20, 0x417f00, 0x36, 3), (3, 0x44e660, 0x44e760, 0x34, 1),
                                      (5, 0x422c10, 0x422d10, 0x37, 3), (6, 0x4168a0, 0x4169a0, 0x33, 2),
                                      (7, 0x446f20, 0x447020, 0x38, 0), (4, 0x439500, 0x4395f0, 0x35, 3)]:
    for address in [0x45ef68, 0x45ef6c, 0x45ee58, 0x461224, 0x470d20, 0x46cda8, 0x45e8a8]: write(address, 0)
    b['player'](x=22800, y=3032)
    if slot == 4: call(0x439440)
    offset = len(b['allocations']); call(ctor, code, update, 0, 6, 10, 400)
    ally_node, ally = b['allocations'][offset:offset + 2]
    contact = 0x439820 if slot == 4 else read(read(ally + 56) + 12)
    for state in sorted({0, attack}):
        write(ally + (72 if slot == 4 else 88), state)
        for boss_state in [1, 6, 7]:
            node, data = create(); call(entries[boss_state], data)
            call(contact, ally_node, node)
            first = {'boss': values(node, data), 'points': read(PLAYER + 112)}
            call(contact, ally_node, node)
            second = {'boss': values(node, data), 'points': read(PLAYER + 112)}
            allies.append({'slot': slot, 'state': state, 'bossState': boss_state, 'first': first, 'second': second})
write(0x1601404, 0); call(0x42b2a0)
boss_node, boss = create(); cpu.mem_write(boss_node + 1, b'\0')
offset = len(b['allocations']); call(0x42b300, 66, 0x42b3d0, 0, 8, 23018, 2942)
splash_node, splash_data = b['allocations'][offset:offset + 2]; cpu.mem_write(splash_node + 1, b'\0')
splash = []
for tick in range(40):
    call(0x438020, boss_node)
    hit = call(0x431130, boss + 32, read(boss + 4), read(boss + 8))
    if hit: call(0x438470, boss_node, hit)
    if cpu.mem_read(splash_node + 1, 1)[0] != 2: call(0x42b3d0, splash_node)
    call(0x434a50)
    splash.append({'boss': values(boss_node, boss), 'points': read(PLAYER + 112),
                   'ticks': read(splash_data + 72), 'removed': cpu.mem_read(splash_node + 1, 1)[0] == 2})
root = b['base']['ROOT']
(root / 'test/fixtures/original-stage2-boss.json').write_text(json.dumps({'metadata': metadata, 'movement': movement, 'contacts': contacts, 'weapons': weapons, 'death': death, 'projectileImage': projectile_image, 'projectiles': projectiles, 'outside': outside, 'allies': allies, 'splash': splash}, separators=(',', ':')) + '\n')
(root / 'web/stage2-boss-data.js').write_text('// SHIN.EXE 0x437d10 / 0x437ef0 and state entries, extracted by capture-stage2-boss.py.\n'
    + 'export const STAGE2_BOSS = ' + json.dumps(metadata, separators=(',', ':')) + ';\n'
    + 'export const BOSS2_PROJECTILE_IMAGE = ' + json.dumps(projectile_image) + ';\n')
print('Captured 800 movement ticks, 72 contacts, six weapon contacts, ten delayed hits and three projectile paths.', flush=True)
