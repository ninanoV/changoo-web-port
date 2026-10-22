"""Capture the shooting boss's random motion, retaliation, delayed damage and exit request."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP, UC_X86_REG_ESI, UC_X86_REG_ECX

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, write, read, call, loaded, played = (g[key] for key in ['base', 'cpu', 'write', 'read', 'call', 'loaded', 'played'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
shots, requests, respawns = [], [], []
fields = {'x': 4, 'y': 8, 'frame': 16, 'ticks': 20, 'count': 24, 'period': 28, 'oldX': 64, 'oldY': 68,
          'vx': 72, 'vy': 76, 'state': 80, 'timer': 88, 'previousState': 92, 'facing': 96, 'width': 100, 'height': 104, 'health': 108}
entries = {1: 0x437800, 3: 0x437830, 4: 0x437860}


def shot(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    x, y = read(sp + 20), read(sp + 24)
    shots.append({'type': 37, 'x': x, 'y': y, 'vx': int((read(PLAYER + 8) - x) / 40), 'vy': int((read(PLAYER + 12) - y) / 40)})


def request(uc, address, size, _):
    if address == 0x427900: requests.append(read(0x461428))
    if address == 0x4262e0:
        sp = uc.reg_read(UC_X86_REG_ESP)
        respawns.append([read(sp + i * 4) for i in range(1, 6)])
    g['return_from'](uc)


request_hooks = {address: cpu.hook_add(UC_HOOK_CODE, request, begin=address, end=address)
                 for address in [0x427900, 0x44d440, 0x4321f0, 0x4262e0]}
cpu.hook_add(UC_HOOK_CODE, shot, begin=0x41e500, end=0x41e500)
call(0x436f10); images = list(loaded)
call(0x41e4a0); call(0x44afe0)
for pointer, name in [(0x4752e8, 'DEM-SHIN.WAV'), (0x475200, 'BONUS.WAV')]:
    cpu.mem_write(0x18f2000, name.encode() + b'\0'); call(0x42d4b0, 0, pointer, 0x18f2000)


def create(x=38262, y=187):
    b['player'](x=37900, y=200); call(0x40daa0, PLAYER)
    write(CAMERA + 4, 37700); write(CAMERA + 8, 0)
    write(0x461428, 2); write(0x46142c, 2)
    write(0x77bf4c, 0); write(0x77bf50, 0)
    offset = len(b['allocations'])
    call(0x4370f0, 107, 0x437200, 0x437620, 6, x, y, 33)
    return b['allocations'][offset:offset + 2]


def values(node, data):
    result = {key: read(data + offset) for key, offset in fields.items()}
    result['spriteIndex'] = read(read(data + 12) + result['frame'] * 4)
    result['removed'] = cpu.mem_read(node + 1, 1)[0] == 2
    return result


node, data = create()
initial = values(node, data)
body = [read(data + 32 + i * 4) for i in range(4)]
states = {}
for state, entry in entries.items():
    played.clear(); call(entry, data)
    states[state] = {'frames': [read(read(data + 12) + i * 4) for i in range(read(data + 24))], 'period': read(data + 28)}
    if state == 4: damage_sounds = list(played)
metadata = {'initial': initial, 'body': body, 'images': images[:15], 'healthImage': images[15], 'headImage': images[16],
            'states': states, 'damageSounds': damage_sounds}
movement = []
for seed in [1, 1997, 0xffffffff]:
    node, data = create(); write(0x471d70, seed)
    trace = []
    for tick in range(600):
        player = {'x': 37900 if tick % 200 < 100 else 38300, 'y': 100 if tick % 160 < 80 else 400}
        write(PLAYER + 8, player['x']); write(PLAYER + 12, player['y'])
        shots.clear(); call(0x437200, node)
        trace.append({'player': player, 'expected': values(node, data), 'randomSeed': read(0x471d70) & 0xffffffff, 'shots': list(shots)})
    movement.append({'seed': seed, 'trace': trace})

boundaries = []
for x, y in [(37699, 200), (38201, 200), (38000, -1), (38000, 481), (35459, 200), (40261, 200), (38000, -1441), (38000, 1921)]:
    for state in [1, 3, 4]:
        node, data = create(x, y); call(entries[state], data); write(0x471d70, 1)
        before = values(node, data); shots.clear(); respawns.clear(); call(0x437200, node)
        boundaries.append({'initial': before, 'expected': values(node, data), 'randomSeed': read(0x471d70) & 0xffffffff,
                           'shots': list(shots), 'respawns': list(respawns)})

contacts, lasers = [], []
for state, entry in entries.items():
    for pstate in [18, 19]:
        for immune in [0, 30]:
            node, data = create(); call(entry, data)
            b['player'](x=38262, y=187, points=99, invulnerable=immune)
            call(0x40daa0 if pstate == 18 else 0x40dad0, PLAYER)
            before, boss_before = b['player_values'](), values(node, data)
            contacts_row = []
            for _ in range(2):
                played.clear(); call(0x4077d0, NODE, node)
                contacts_row.append({'player': b['player_values'](), 'boss': values(node, data), 'sounds': list(played)})
            contacts.append({'before': before, 'boss': boss_before, 'trace': contacts_row})
    node, data = create(); call(entry, data); write(PLAYER + 112, 99)
    before, boss_before = b['player_values'](), values(node, data)
    offset = len(b['allocations']); call(0x44b040, 35, 0x44b120, 0x44b1b0, 6, 38262, 187, 24)
    shot_node = b['allocations'][offset]; trace = []
    for _ in range(2):
        played.clear(); call(0x44b200, shot_node, node)
        trace.append({'boss': values(node, data), 'player': b['player_values'](), 'removed': cpu.mem_read(shot_node + 1, 1)[0] == 2, 'sounds': list(played)})
    lasers.append({'before': before, 'boss': boss_before, 'trace': trace})

node, data = create(); death = []
for hit in range(20):
    call(0x437860, data); trace = []
    for tick in range(22):
        shots.clear(); requests.clear(); call(0x437200, node)
        trace.append({'expected': values(node, data), 'shots': list(shots), 'requests': list(requests)})
    death.append(trace)
assert read(data + 108) == 0 and death[-1][-1]['requests'] == [3]
assert all(len(frame['shots']) == 1 for hit in death for frame in hit[:21])

# Now execute the real map reader and the original player mode setup at the last hit.
cpu.hook_del(request_hooks[0x427900])
def stage_output(address, stage):
    if address == 0x43ef80:
        assert stage == 2
        write(0x461754, 0)
        return 0x40dbf0
    assert stage == 3
    # 0x43eb40 disables these groups while the next entry movie is active.
    for priority in [2, 6, 7, 8]: write(0x471920 + priority * 4, 0)
    return 0x40dc40

map_support = runpy.run_path(str(Path(__file__).with_name('capture-map-support.py')))
map_loads = map_support['install_map_reader'](g, stage_output)
node, data = create()
contact = call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x4077d0)
write(PLAYER + 60, contact)
write(PLAYER + 0x90, 1)
write(PLAYER + 84, -4); write(PLAYER + 88, 3); write(PLAYER + 184, 17)
write(0x461754, 1)
write(data + 108, 1); call(0x437860, data)
# The native reader uses CHAR.CFG headers for placement, including editor-only markers.
for kind, name in enumerate((b['base']['ROOT'] / 'Changoo (E)/RESOURCE/CHAR.CFG').read_text().split()):
    cpu.mem_write(0x18f2000, name.replace('.raw', '.app').encode() + b'\0')
    write(0x461430 + kind * 4, call(0x4402c0, 0x18f2000))
transition = []
for tick in range(22):
    call(0x437200, node, instruction_limit=20_000_000, timeout=15_000_000)
    transition.append({'boss': values(node, data), 'player': b['player_values'](), 'stage': read(0x461428),
                       'stopped': bool(read(0x461754)), 'playerUpdate': hex(read(NODE + 4)),
                       'contact': hex(read(contact + 12)), 'ready': bool(read(PLAYER + 0x90))})
assert transition[-1]['stage'] == 3 and transition[-1]['player']['state'] == 26
assert transition[-1]['player']['lives'] == 8 and transition[-1]['playerUpdate'] == '0x407380'
assert [read(0x77bf44), read(0x77bf54)] == [1131, 100]

transition_loads = list(map_loads)
for address in [0x44d440, 0x4321f0]: cpu.hook_del(request_hooks[address])

# A full boss fight through the native scheduler, two nearby shooters and camera tracking.
call(0x4496d0)
cpu.mem_write(0x18f2000, b'sblock.app\0'); call(0x4402c0, 0x18f2000)
for priority in range(10):
    write(0x1601000 + priority * 64 + 24, 0)
    write(0x471920 + priority * 4, 1)
write(0x1601404, 0); write(0x1601504, 0)
b['player'](x=37900, y=200)
write(NODE + 20, 0x1601200); write(NODE + 24, 0); write(0x1601218, NODE); cpu.mem_write(NODE + 1, b'\0')
contact = call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x4098f0)
write(PLAYER + 60, contact); call(0x431050, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x40d4c0)
call(0x40dbb0, PLAYER)
write(CAMERA + 68, 1400); write(CAMERA + 72, 20)
write(0x77bf44, 1400); write(0x77bf54, 20); write(0x461428, 2); write(0x46142c, 2); write(0x461754, 1); write(0x471d70, 1)
for offset, value in [(4, 37700), (8, 0), (12, 37700 // 32), (16, 0), (20, 37700 % 32), (24, 0), (56, 200), (60, 280)]: write(CAMERA + offset, value)
for ctor, update, destructor, code in [(0x430fd0, 0x431000, 0x4310f0, 3), (0x434a20, 0x434a50, 0x434be0, 2)]:
    offset = len(b['allocations']); call(ctor, code, update, destructor, 9); cpu.mem_write(b['allocations'][offset] + 1, b'\0')
placements = [{'kind': 56, 'x': 38089, 'y': 14}, {'kind': 56, 'x': 38234, 'y': 304}, {'kind': 33, 'x': 38262, 'y': 187}]
actors = []
for obj in placements:
    ctor, update, destructor, code = (0x449820, 0x449930, 0x449bf0, 32) if obj['kind'] == 56 else (0x4370f0, 0x437200, 0x437620, 107)
    offset = len(b['allocations']); call(ctor, code, update, destructor, 6, obj['x'], obj['y'], obj['kind'])
    actor_node, actor = b['allocations'][offset:offset + 2]; cpu.mem_write(actor_node + 1, b'\0'); actors.append((actor_node, actor))
boss_node, boss = actors[-1]
cpu.hook_add(UC_HOOK_CODE, lambda uc, *_: g['return_from'](uc), begin=0x4261ad, end=0x4261ad)
coupled = []
for tick in range(1600):
    camera_x = read(CAMERA + 12) * 32 + read(CAMERA + 20)
    camera_y = max(0, min(159, read(CAMERA + 16) * 32 + read(CAMERA + 24)))
    for offset, value in [(4, camera_x), (8, camera_y), (12, camera_x // 32), (16, camera_y // 32), (20, camera_x % 32), (24, camera_y % 32)]: write(CAMERA + offset, value)
    cpu.reg_write(UC_X86_REG_ESI, CAMERA); cpu.reg_write(UC_X86_REG_ECX, camera_y); call(0x425c37)
    target = read(boss + 8) + 70 + (80 if tick // 16 % 2 else -80)
    inputs = {'left': read(PLAYER + 8) > camera_x + 160, 'up': read(PLAYER + 12) > target + 5,
              'down': read(PLAYER + 12) < target - 5, 'fire': tick % 8 == 0}
    for key, address in [('left', 0x46d4b8), ('right', 0x46d4bc), ('up', 0x46d4b0), ('down', 0x46d4b4), ('fire', 0x46d4e8)]: write(address, int(inputs.get(key, False)))
    for address in [0x46d4d8, 0x46d4f0, 0x46d4ec]: write(address, 0)
    played.clear(); call(0x44d3a0, instruction_limit=20_000_000, timeout=15_000_000)
    coupled.append({'input': inputs, 'camera': {'x': camera_x, 'y': camera_y}, 'player': b['player_values'](),
                    'boss': values(boss_node, boss), 'randomSeed': read(0x471d70) & 0xffffffff, 'stage': read(0x461428), 'sounds': list(played)})
    if read(0x461428) == 3: break
assert coupled[-1]['stage'] == 3 and read(PLAYER + 140) > 0
print('Native complete boss fight:', len(coupled), 'ticks, lives after transition:', read(PLAYER + 140), flush=True)

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

root = b['base']['ROOT']
result = {'allies': allies, 'coupled': coupled, 'placements': placements, 'metadata': metadata, 'movement': movement, 'boundaries': boundaries, 'contacts': contacts, 'lasers': lasers, 'death': death, 'transition': transition, 'mapLoads': transition_loads,
          'scope': 'Native shooting boss, RNG, contacts and complete scheduler fight. Isolated-hit traces intercept stage clearing/loading; transition and coupled fight run the real map reader and player mode functions. Graphics/audio/file transport and next-scene resources/title/movie setup are virtualized; native next-entry group flags are applied.'}
(root / 'test/fixtures/original-flight-boss.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
(root / 'web/flight-boss-data.js').write_text('// Original kind-33 boss loader 0x436f10, constructor 0x4370f0 and state tables.\n'
    + 'export const FLIGHT_BOSS = ' + json.dumps(metadata, separators=(',', ':')) + ';\n')
print('Captured 1800 movement ticks, 24 boundaries, 12 body contacts, 3 laser scenarios and 440 delayed-hit ticks.', flush=True)
