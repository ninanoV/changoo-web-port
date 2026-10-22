"""Capture the stage-one boss, contact rules, and native next-map data transition."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ESP

graphics = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
base, cpu, write, read, call, played, loaded = (graphics[key] for key in ['base', 'cpu', 'write', 'read', 'call', 'played', 'loaded'])
PLAYER, NODE, CAMERA = (base[key] for key in ['PLAYER', 'NODE', 'CAMERA'])
return_from = graphics['return_from']
call(0x421db0)
images = list(loaded)
call(0x42d5e0)
call(0x42fc00)


def create():
    base['player'](x=24900, y=3096)
    write(CAMERA + 4, 24700)
    write(CAMERA + 8, 2719)
    offset = len(base['allocations'])
    call(0x421f90, 0x74, 0x4220a0, 0x4223e0, 6, 25063, 2991, 18)
    return base['allocations'][offset:offset + 2]


def values(node, data):
    fields = {'x': 4, 'y': 8, 'frame': 0x10, 'ticks': 0x14, 'count': 0x18, 'period': 0x1c,
              'vx': 0x48, 'vy': 0x4c, 'state': 0x50, 'timer': 0x60, 'previousState': 0x64, 'facing': 0x68,
              'width': 0x6c, 'height': 0x70, 'health': 0x74}
    result = {key: read(data + offset) for key, offset in fields.items()}
    index = read(read(data + 12) + result['frame'] * 4)
    result.update({'sprite': images[index], 'removed': cpu.mem_read(node + 1, 1)[0] == 2})
    return result


node, data = create()
initial = values(node, data)
body = [read(data + 0x20 + i * 4) for i in range(4)]
movement = []
for tick in range(520):
    player_x = 24900 if tick < 260 else 25400
    write(PLAYER + 8, player_x)
    call(0x4220a0, node)
    hit = call(0x431130, data + 0x20, read(data + 4), read(data + 8))
    if hit:
        call(0x4224b0, node, hit)
    movement.append({'playerX': player_x, 'expected': values(node, data)})

contacts = []
for boss_state, entry in [(1, 0x4225f0), (3, 0x422650), (4, 0x422680)]:
    for state in [0, 2, 10, 14, 17, 4]:
        for scenario in ['side', 'descending', 'rising', 'immune']:
            node, data = create()
            call(entry, data)
            initial_boss = values(node, data)
            base['player'](x=25063, y=2930 if scenario in ['descending', 'rising'] else 3096, state=state,
                           vy=-5 if scenario == 'rising' else 5, invulnerable=30 if scenario == 'immune' else 0)
            before = base['player_values']()
            played.clear()
            call(0x4098f0, NODE, node)
            contacts.append({'boss': initial_boss, 'player': before, 'scenario': scenario,
                             'expectedBoss': values(node, data), 'expectedPlayer': base['player_values'](), 'sounds': list(played)})

weapon_contacts = []
for kind, ctor, update, contact in [(65, 0x42d640, 0x42d730, 0x42d810), (66, 0x42fc60, 0x42fd50, 0x42fe30)]:
    for state, entry in [(1, 0x4225f0), (3, 0x422650), (4, 0x422680)]:
        boss_node, boss = create()
        call(entry, boss)
        before = values(boss_node, boss)
        offset = len(base['allocations'])
        call(ctor, kind, update, 0, 6, 25063, 2991, 10)
        shot_node, _ = base['allocations'][offset:offset + 2]
        call(contact, shot_node, boss_node)
        weapon_contacts.append({'type': kind, 'initial': before, 'expected': values(boss_node, boss),
                                'points': read(PLAYER + 0x70), 'shotRemoved': cpu.mem_read(shot_node + 1, 1)[0] == 2})

# Keep the real map reader/life bonus, virtualizing file I/O and title/BGM setup.
def stage_output(address, stage):
    if address == 0x43ef80 and stage == 0:
        write(PLAYER + 0x100, 0)

map_support = runpy.run_path(str(Path(__file__).with_name('capture-map-support.py')))
map_loads = map_support['install_map_reader'](graphics, stage_output)
node, data = create()
write(0x461428, 0)
write(0x46142c, 0)
write(data + 0x74, 1)
call(0x422680, data)
death = []
for tick in range(12):
    call(0x4220a0, node, instruction_limit=20_000_000, timeout=15_000_000)
    death.append({'boss': values(node, data), 'stage': read(0x461428), 'player': base['player_values']()})
    if cpu.mem_read(node + 1, 1)[0] == 2:
        break
assert death[-1]['stage'] == 1 and death[-1]['player']['lives'] == 8
assert [read(0x77bf44), read(0x77bf54)] == [1401, 100]
assert death[-1]['player']['x'] == 0 and death[-1]['player']['y'] == 0
write(PLAYER + 0x100, 0)
offset = len(base['allocations'])
call(0x44d4f0, 0x2d, 0x44d540, 0x44d570, 6)
activation_node = base['allocations'][offset]
activation = []
for _ in range(20):
    call(0x44d540, activation_node)
    activation.append({'enabled': bool(read(PLAYER + 0x100)), 'removed': cpu.mem_read(activation_node + 1, 1)[0] == 2})
assert not activation[-2]['enabled'] and activation[-1]['enabled']
result = {'initial': initial, 'images': images, 'body': body, 'movement': movement, 'contacts': contacts,
          'weaponContacts': weapon_contacts, 'death': death, 'mapLoads': map_loads, 'activation': activation,
          'scope': 'native boss and real next-map reader; graphics, file transport and stage title/BGM routines substituted'}
destination = base['base']['ROOT'] / 'test/fixtures/original-boss.json'
destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(f'Captured 520 boss ticks, {len(contacts)} player contacts, six projectile contacts and the native stage 1 to 2 map transition.')
