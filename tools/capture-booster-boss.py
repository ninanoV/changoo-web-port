"""Capture kind 122, its tracking-then-accelerating shots and the exit-movie request."""
import json
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, write, read, call, loaded, played = (g[key] for key in ['base', 'cpu', 'write', 'read', 'call', 'loaded', 'played'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
shots, requests = [], []
fields = {'x': 4, 'y': 8, 'frame': 16, 'ticks': 20, 'count': 24, 'period': 28, 'oldX': 64, 'oldY': 68,
          'vx': 72, 'vy': 76, 'state': 80, 'timer': 96, 'previousState': 100, 'facing': 104, 'width': 108, 'height': 112, 'health': 116}
shot_fields = {'x': 4, 'y': 8, 'width': 12, 'height': 16, 'frame': 24, 'ticks': 28, 'count': 32, 'period': 36,
               'oldX': 72, 'oldY': 76, 'vx': 80, 'vy': 84, 'facing': 104, 'delay': 108}
entries = {1: 0x415a20, 2: 0x415a50, 3: 0x415a80, 5: 0x415ab0}


def projectile(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    shots.append({'type': 70, 'x': read(sp + 20), 'y': read(sp + 24), 'vx': read(sp + 28), 'vy': 0, 'delay': read(sp + 32)})


def ending(uc, address, size, _):
    requests.append('boosterExit'); g['return_from'](uc)


cpu.hook_add(UC_HOOK_CODE, projectile, begin=0x41f990, end=0x41f990)
ending_hook = cpu.hook_add(UC_HOOK_CODE, ending, begin=0x421680, end=0x421680)
call(0x414d70); images = list(loaded)
attack_sounds = [g['support']['audio_names'][read(pointer)] for pointer in [0x47680c, 0x476814]]
loaded.clear(); call(0x41f870); shot_images = list(loaded)
for loader in [0x44afe0, 0x42d5e0, 0x42fc00]: call(loader)
for pointer, name in [(0x4752e8, 'DEM-SHIN.WAV'), (0x475200, 'BONUS.WAV')]:
    cpu.mem_write(0x18f2000, name.encode() + b'\0'); call(0x42d4b0, 0, pointer, 0x18f2000)
map_data = g['resources']['stage3.map']; width, height = struct.unpack_from('<II', map_data)
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
cpu.mem_write(0x18f2000, b'block3.app\0'); call(0x4402c0, 0x18f2000)
write(CAMERA + 4, 9400); write(CAMERA + 8, 2500)


def create():
    b['player'](x=9550, y=2850)
    offset = len(b['allocations']); call(0x414f80, 50, 0x415090, 0x4157f0, 6, 9823, 2741, 122)
    return b['allocations'][offset:offset + 2]


def values(node, data, layout=fields):
    result = {key: read(data + offset) for key, offset in layout.items()}
    result['removed'] = cpu.mem_read(node + 1, 1)[0] == 2
    if layout is fields: result['spriteIndex'] = read(read(data + 12) + result['frame'] * 4)
    return result


node, data = create(); initial = values(node, data)
body = [read(data + 32 + i * 4) for i in range(4)]; states = {}
for state, setter in entries.items():
    played.clear(); call(setter, data)
    states[state] = {'frames': [read(read(data + 12) + i * 4) for i in range(read(data + 24))], 'period': read(data + 28)}
    if state == 5: damage_sounds = list(played)
metadata = {'initial': initial, 'body': body, 'states': states, 'images': images[:-2], 'healthImage': images[-2], 'headImage': images[-1],
            'damageSounds': damage_sounds, 'attackSounds': attack_sounds}
movement = []
for start_state in [1, 2]:
    node, data = create(); call(entries[start_state], data); start = values(node, data); trace = []
    for tick in range(700):
        px = 9550 if tick < 350 else 10300
        write(PLAYER + 8, px); shots.clear(); played.clear(); call(0x415090, node)
        hit = call(0x431130, data + 32, read(data + 4), read(data + 8))
        if hit: call(0x4158d0, node, hit)
        trace.append({'playerX': px, 'expected': values(node, data), 'shots': list(shots), 'sounds': list(played)})
    movement.append({'initial': start, 'trace': trace})

contacts, weapons = [], []
for state, setter in entries.items():
    for pstate in [0, 2, 4, 17, 26, 27, 28]:
        for scenario in ['left', 'right', 'descending', 'immune']:
            node, data = create(); call(setter, data)
            b['player'](x=9823 if scenario != 'right' else 10020, y=2733 if scenario == 'descending' else 2840,
                        state=pstate, vy=5, invulnerable=30 if scenario == 'immune' else 0, points=99)
            if pstate >= 26: call({26: 0x40db10, 27: 0x40db40, 28: 0x40db80}[pstate], PLAYER)
            before, boss_before = b['player_values'](), values(node, data)
            played.clear(); call(0x407bf0 if pstate >= 26 else 0x4098f0, NODE, node)
            contacts.append({'before': before, 'initial': boss_before, 'player': b['player_values'](), 'boss': values(node, data), 'sounds': list(played)})
    for type_shot, ctor, update, callback in [(35, 0x44b040, 0x44b120, 0x44b200), (65, 0x42d640, 0x42d730, 0x42d810), (66, 0x42fc60, 0x42fd50, 0x42fe30)]:
        node, data = create(); call(setter, data); write(PLAYER + 112, 99)
        before, boss_before = b['player_values'](), values(node, data)
        offset = len(b['allocations']); call(ctor, type_shot, update, 0, 6, 9823, 2800, 12)
        shot_node = b['allocations'][offset]; trace = []
        for _ in range(2):
            played.clear(); call(callback, shot_node, node)
            trace.append({'boss': values(node, data), 'player': b['player_values'](), 'removed': cpu.mem_read(shot_node + 1, 1)[0] == 2, 'sounds': list(played)})
        weapons.append({'type': type_shot, 'before': before, 'initial': boss_before, 'trace': trace})

node, data = create(); death = []
for strike in range(30):
    played.clear(); call(0x415ab0, data)
    row = {'hit': values(node, data), 'sounds': list(played), 'trace': []}
    for tick in range(10):
        requests.clear(); shots.clear(); played.clear(); call(0x415090, node)
        hit = call(0x431130, data + 32, read(data + 4), read(data + 8))
        if hit and cpu.mem_read(node + 1, 1)[0] != 2: call(0x4158d0, node, hit)
        row['trace'].append({'expected': values(node, data), 'shots': list(shots), 'requests': list(requests), 'sounds': list(played)})
    death.append(row)
assert death[-1]['trace'][-1]['requests'] == ['boosterExit']

projectiles, projectile_contacts = [], []
for vx in [-8, 8]:
    for delay in [20, 100]:
        offset = len(b['allocations']); call(0x41f990, 70, 0x41fab0, 0x41fc20, 6, 9700, 2800, vx, delay)
        node, data = b['allocations'][offset:offset + 2]
        shot_metadata = {'images': shot_images, 'width': read(data + 12), 'height': read(data + 16), 'body': [read(data + 40 + i * 4) for i in range(4)]}
        initial = values(node, data, shot_fields); trace = []
        for tick in range(300):
            py = 2600 if tick % 80 < 40 else 2900
            write(PLAYER + 12, py); call(0x41fab0, node)
            trace.append({'playerY': py, 'expected': values(node, data, shot_fields)})
            if trace[-1]['expected']['removed']: break
        assert trace[-1]['expected']['removed']
        projectiles.append({'initial': initial, 'trace': trace})
for state in [26, 27, 28]:
    for vx in [-8, 0, 8]:
        for immune in [0, 30]:
            for px in [9650, 9750]:
                b['player'](x=px, y=2800, invulnerable=immune); call({26: 0x40db10, 27: 0x40db40, 28: 0x40db80}[state], PLAYER)
                before = b['player_values']()
                offset = len(b['allocations']); call(0x41f990, 70, 0x41fab0, 0x41fc20, 6, 9700, 2800, vx, 20)
                node = b['allocations'][offset]; played.clear(); call(0x407bf0, NODE, node)
                projectile_contacts.append({'before': before, 'vx': vx, 'player': b['player_values'](), 'removed': cpu.mem_read(node + 1, 1)[0] == 2, 'sounds': list(played)})

allies = []
for slot, ctor, update, code, attack in [(2, 0x417c20, 0x417f00, 0x36, 3), (3, 0x44e660, 0x44e760, 0x34, 1),
                                      (5, 0x422c10, 0x422d10, 0x37, 3), (6, 0x4168a0, 0x4169a0, 0x33, 2),
                                      (7, 0x446f20, 0x447020, 0x38, 0), (4, 0x439500, 0x4395f0, 0x35, 3)]:
    for address in [0x45ef68, 0x45ef6c, 0x45ee58, 0x461224, 0x470d20, 0x46cda8, 0x45e8a8]: write(address, 0)
    b['player']()
    if slot == 4: call(0x439440)
    offset = len(b['allocations']); call(ctor, code, update, 0, 6, 10, 400)
    ally_node, ally_data = b['allocations'][offset:offset + 2]
    callback = 0x439820 if slot == 4 else read(read(ally_data + 56) + 12)
    for state in sorted({0, attack}):
        write(ally_data + (72 if slot == 4 else 88), state)
        node, data = create(); trace = []
        for _ in range(2):
            played.clear(); call(callback, ally_node, node)
            trace.append({'boss': values(node, data), 'points': read(PLAYER + 112), 'sounds': list(played)})
        allies.append({'slot': slot, 'state': state, 'trace': trace})

terrain = []
empty = struct.pack('<5h', -1, -1, -1, 0, 0)
cpu.mem_write(0x478be8, empty * 1500 * 210)
cpu.mem_write(0x478be8 + (10 * 1500 + 10) * 10, struct.pack('<5h', -1, 0, -1, 0, 0))
for pixel in [1, 2, 3, 4, 5]:
    for row in range(32): cpu.mem_write(b['base']['MASK'] + 8 + row * 640, bytes([pixel]) * 32)
    for x, y, old_x, old_y in [(325, 320, 325, 300), (325, 344, 300, 344), (340, 344, 360, 344), (325, 344, 325, 300), (325, 344, 325, 370)]:
        offset = len(b['allocations']); call(0x41f990, 70, 0x41fab0, 0x41fc20, 6, x, y, -8, 20)
        node, data = b['allocations'][offset:offset + 2]
        write(data + 72, old_x); write(data + 76, old_y); write(data + 84, 5)
        before = values(node, data, shot_fields)
        hit = call(0x431130, data + 40, x, y)
        if hit: call(0x41fc90, node, hit)
        terrain.append({'pixel': pixel, 'initial': before, 'expected': values(node, data, shot_fields)})

# Execute the exit controller with the real next-map reader and normal-player restoration.
cpu.hook_del(ending_hook)
def stage_output(address, stage):
    if address == 0x43ef80:
        assert stage == 3
        return 0x40dbf0
    assert stage == 4
    for priority in [2, 6, 7, 8]: write(0x471920 + priority * 4, 0)

map_support = runpy.run_path(str(Path(__file__).with_name('capture-map-support.py')))
map_loads = map_support['install_map_reader'](g, stage_output)
for kind, name in enumerate((b['base']['ROOT'] / 'Changoo (E)/RESOURCE/CHAR.CFG').read_text().split()):
    cpu.mem_write(0x18f2000, name.replace('.raw', '.app').encode() + b'\0')
    write(0x461430 + kind * 4, call(0x4402c0, 0x18f2000))
transitions = []
for strategy in ['natural', 'skip']:
    b['player'](x=9550, y=2850, invulnerable=17)
    contact = call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x407bf0)
    write(PLAYER + 60, contact); call(0x40dc40, PLAYER)
    write(PLAYER + 84, -4); write(PLAYER + 88, 3)
    before = b['player_values']()
    write(0x461428, 3); write(0x46142c, 3)
    for priority in [2, 6, 7, 8]: write(0x471920 + priority * 4, 0)
    offset = len(b['allocations']); call(0x421680, 14, 0x4216e0, 0x421900, 5)
    node = b['allocations'][offset]
    for tick in range(1000):
        g['support']['set_clock'](1000 + tick * 1000 // 30)
        write(0x46d4e8, int(strategy == 'skip'))
        call(0x4216e0, node, instruction_limit=20_000_000, timeout=15_000_000)
        if cpu.mem_read(node + 1, 1)[0] == 2: break
    assert read(0x461428) == 4 and read(PLAYER + 140) == 8
    assert [read(0x77bf44), read(0x77bf54)] == [999, 200]
    transitions.append({'strategy': strategy, 'ticks': tick + 1, 'before': before, 'player': b['player_values'](),
                        'update': hex(read(NODE + 4)), 'contact': hex(read(contact + 12)), 'stage': read(0x461428),
                        'width': read(0x77bf44), 'height': read(0x77bf54)})

# Full native scheduler battle, exit movie and real map handoff, without health/ammo grants.
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
cpu.mem_write(0x18f2000, b'block3.app\0'); call(0x4402c0, 0x18f2000)
for priority in range(10):
    write(0x1601000 + priority * 64 + 24, 0)
    write(0x471920 + priority * 4, 1)
write(0x1601404, 0); write(0x1601504, 0)
b['player'](x=9550, y=2850)
write(NODE + 20, 0x1601200); write(NODE + 24, 0); write(0x1601218, NODE); cpu.mem_write(NODE + 1, b'\0')
contact = call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x4098f0)
write(PLAYER + 60, contact); call(0x431050, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x40d4c0)
call(0x40dc40, PLAYER)
write(CAMERA + 4, 9400); write(CAMERA + 8, 2500); write(CAMERA + 68, width); write(CAMERA + 72, height)
write(0x461428, 3); write(0x46142c, 3)
for ctor, update, destructor, code in [(0x430fd0, 0x431000, 0x4310f0, 3), (0x434a20, 0x434a50, 0x434be0, 2)]:
    offset = len(b['allocations']); call(ctor, code, update, destructor, 9); cpu.mem_write(b['allocations'][offset] + 1, b'\0')
offset = len(b['allocations']); call(0x414f80, 50, 0x415090, 0x4157f0, 6, 9823, 2741, 122)
boss_node, boss = b['allocations'][offset:offset + 2]; cpu.mem_write(boss_node + 1, b'\0')
coupled = []
for tick in range(1800):
    x, y = read(boss + 4) + 60, read(boss + 8) + 160
    in_movie = cpu.mem_read(boss_node + 1, 1)[0] == 2
    inputs = {'left': read(PLAYER + 8) > x + 5, 'right': read(PLAYER + 8) < x - 5,
              'up': read(PLAYER + 12) > y + 5, 'down': read(PLAYER + 12) < y - 5,
              'fire': not in_movie and tick % 12 == 0}
    for key, address in [('left', 0x46d4b8), ('right', 0x46d4bc), ('up', 0x46d4b0), ('down', 0x46d4b4), ('fire', 0x46d4e8)]: write(address, int(inputs.get(key, False)))
    for address in [0x46d4d8, 0x46d4f0, 0x46d4ec]: write(address, 0)
    g['support']['set_clock'](1000 + tick * 1000 // 30)
    played.clear(); call(0x44d3a0, instruction_limit=20_000_000, timeout=15_000_000)
    missiles = []; node = read(0x1601198)
    while node:
        code, data = cpu.mem_read(node, 1)[0], read(node + 12)
        if code in [35, 70]:
            layout = {key: offset for key, offset in shot_fields.items() if key in ['x', 'y', 'vx', 'vy', 'frame', 'ticks', 'delay']} if code == 70 else {'x': 4, 'y': 8, 'vx': 60, 'vy': 64}
            missiles.append({'type': code, **{key: read(data + offset) for key, offset in layout.items()}})
        node = read(node + 24)
    movie_node = read(0x1601158)
    phase = read(read(movie_node + 12) + 16) if movie_node else None
    coupled.append({'input': inputs, 'player': b['player_values'](), 'boss': values(boss_node, boss), 'stage': read(0x461428),
                    'moviePhase': phase, 'shots': missiles, 'sounds': list(played)})
    if read(0x461428) == 4: break
assert coupled[-1]['stage'] == 4 and read(PLAYER + 140) > 3
print('Complete native booster fight/movie:', len(coupled), 'ticks; lives after transition', read(PLAYER + 140), 'points', read(PLAYER + 112), flush=True)

root = b['base']['ROOT']
result = {'coupled': coupled, 'transitions': transitions, 'mapLoads': map_loads, 'allies': allies, 'terrain': terrain, 'metadata': metadata, 'movement': movement, 'contacts': contacts, 'weapons': weapons, 'death': death,
          'projectile': shot_metadata, 'projectiles': projectiles, 'projectileContacts': projectile_contacts,
          'scope': 'Original kind122/shot70 movement and contacts, full scheduler fight, exit controller and real map reader. Isolated death traces intercept the exit constructor; coupled battle executes it. Graphics/audio/file transport and next-stage resources/title/movie setup are virtualized with the native group flags.'}
(root / 'test/fixtures/original-booster-boss.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
(root / 'web/booster-boss-data.js').write_text('// Original kind122 boss and shot70 metadata, extracted by capture-booster-boss.py.\n'
    + 'export const BOOSTER_BOSS = ' + json.dumps(metadata, separators=(',', ':')) + ';\n'
    + 'export const BOOSTER_SHOT = ' + json.dumps(shot_metadata, separators=(',', ':')) + ';\n')
print('Boss', len(images), 'images;', attack_sounds, damage_sounds, flush=True)
print('Movement 1400, damage 300, projectile', sum(len(p['trace']) for p in projectiles), 'ticks; contacts', len(contacts), len(projectile_contacts), flush=True)
