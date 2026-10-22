"""Record original companion loaders and updates with native gameplay instructions."""
import json
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ESP

graphics = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
base, cpu, write, read, call, played, loaded = (graphics[key] for key in
    ['base', 'cpu', 'write', 'read', 'call', 'played', 'loaded'])
PLAYER, CAMERA = base['PLAYER'], base['CAMERA']
rabbits = []


def observe_rabbit(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    rabbits.append({key: read(sp + offset) for key, offset in [('x', 20), ('y', 24), ('vx', 28), ('vy', 32)]})


cpu.hook_add(UC_HOOK_CODE, observe_rabbit, begin=0x413a90, end=0x413a90)


def start(with_enemies=True):
    for priority in range(10):
        write(0x1601000 + priority * 64 + 0x18, 0)
    write(0x1601404, 0)
    for address in [0x45ef68, 0x45ef6c, 0x45ee58, 0x461224, 0x470d20, 0x46cda8, 0x45e8a8]:
        write(address, 0)
    base['player']()
    write(CAMERA + 4, 6400)
    write(CAMERA + 8, 2719)
    return [base['create'](kind, 6608 + kind * 100, 3032) for kind in range(3)] if with_enemies else []


def values(node, data):
    fields = {'x': 4, 'y': 8, 'frame': 0x18, 'ticks': 0x1c, 'count': 0x20, 'period': 0x24,
              'screenX': 0x40, 'screenY': 0x44, 'vx': 0x50, 'vy': 0x54, 'state': 0x58, 'departing': 0x6c}
    result = {key: read(data + offset) for key, offset in fields.items()}
    result.update({'frameTable': hex(read(data + 0x14)), 'removed': cpu.mem_read(node + 1, 1)[0] == 2,
                   'busy': bool(read(0x46cda8)), 'sounds': list(played)})
    if read(data + 0x14):
        result['spriteIndex'] = read(read(data + 0x14) + result['frame'] * 4)
    return result


specs = [(2, 1, 0x417c20, 0x417f00, 0x418160, 0x36), (2, 2, 0x417c20, 0x417d20, 0x418160, 0x36),
         (3, 1, 0x44e660, 0x44e760, 0x44e920, 0x34), (5, 1, 0x422c10, 0x422d10, 0x422f90, 0x37),
         (6, 1, 0x4168a0, 0x4169a0, 0x416ac0, 0x33), (7, 1, 0x446f20, 0x447020, 0x447100, 0x38)]
traces = []
animations = {}
for (slot, count, ctor, update, destructor, code), with_enemies in [(spec, True) for spec in specs] + [(specs[i], False) for i in [0, 3]]:
    enemies = start(with_enemies)
    loaded.clear()
    played.clear()
    offset = len(base['allocations'])
    call(ctor, code, update, destructor, 6)
    node, data = base['allocations'][offset:offset + 2]
    initial = values(node, data)
    body = [read(data + 0x28 + i * 4) for i in range(4)]
    contact = read(read(data + 0x38) + 12)
    frames = []
    for tick in range(700):
        played.clear()
        rabbits.clear()
        call(update, node)
        row = values(node, data)
        if row['frameTable'] != '0x0':
            animations[row['frameTable']] = [read(int(row['frameTable'], 16) + i * 4) for i in range(row['count'])]
        row['enemies'] = [base['enemy_values'](kind, *enemy) for kind, enemy in enumerate(enemies)]
        row['points'] = read(PLAYER + 0x70)
        row['rabbits'] = list(rabbits)
        frames.append(row)
        if row['removed']:
            break
    assert frames[-1]['removed'], (slot, count, frames[-1])
    played.clear()
    call(destructor, node)
    assert read(0x46cda8) == 0
    traces.append({'slot': slot, 'cost': count, 'withEnemies': with_enemies, 'initial': initial, 'body': body, 'contact': hex(contact), 'images': list(loaded), 'trace': frames})
    print(f'Slot {slot}, cost {count}: {len(frames)} ticks, {len(loaded)} images', flush=True)

contacts = []
for slot, count, ctor, update, destructor, code in specs:
    for state in {2: [0, 1, 2, 3], 3: [0, 1, 2], 5: [0, 1, 3, 4], 6: [0, 1, 2], 7: [0]}[slot]:
        for enemy_kind in range(3):
            enemies = start()
            offset = len(base['allocations'])
            call(ctor, code, update, destructor, 6)
            node, data = base['allocations'][offset:offset + 2]
            write(data + 0x58, state)
            contact = read(read(data + 0x38) + 12)
            call(contact, node, enemies[enemy_kind][0])
            first = {'enemy': base['enemy_values'](enemy_kind, *enemies[enemy_kind]), 'points': read(PLAYER + 0x70)}
            call(contact, node, enemies[enemy_kind][0])
            second = {'enemy': base['enemy_values'](enemy_kind, *enemies[enemy_kind]), 'points': read(PLAYER + 0x70)}
            contacts.append({'slot': slot, 'cost': count, 'state': state, 'enemyKind': enemy_kind, 'first': first, 'second': second})

enemies = start()
loaded.clear()
call(0x439440)
offset = len(base['allocations'])
call(0x439500, 0x35, 0x4395f0, 0x4397c0, 8, 10, 400)
node, data = base['allocations'][offset:offset + 2]
call(0x43a330, data)
dog_frames = []
for tick in range(240):
    call(0x4395f0, node)
    fields = {'x': 4, 'y': 8, 'frame': 0x10, 'ticks': 0x14, 'count': 0x18, 'period': 0x1c,
              'screenX': 0x30, 'screenY': 0x34, 'state': 0x48}
    row = {key: read(data + offset) for key, offset in fields.items()}
    row['spriteIndex'] = read(read(data + 12) + row['frame'] * 4)
    row['busy'] = bool(read(0x46cda8))
    dog_frames.append(row)
assert dog_frames[-1]['state'] == 0 and not dog_frames[-1]['busy']
dog = {'images': list(loaded), 'trace': dog_frames}
dog_contacts = []
for state in range(5):
    for kind in range(3):
        enemies = start()
        write(data + 0x48, state)
        call(0x439820, node, enemies[kind][0])
        first = {'enemy': base['enemy_values'](kind, *enemies[kind]), 'points': read(PLAYER + 0x70)}
        call(0x439820, node, enemies[kind][0])
        second = {'enemy': base['enemy_values'](kind, *enemies[kind]), 'points': read(PLAYER + 0x70)}
        dog_contacts.append({'state': state, 'enemyKind': kind, 'first': first, 'second': second})

start()
offset = len(base['allocations'])
call(0x413a90, 0x5c, 0x413b60, 0x413c70, 6, 6500, 2831, 5, -15)
node, data = base['allocations'][offset:offset + 2]
rabbit_frames = []
for _ in range(30):
    call(0x413b60, node)
    fields = {'x': 4, 'y': 8, 'vx': 0x50, 'vy': 0x54, 'frame': 0x18, 'ticks': 0x1c}
    row = {key: read(data + offset) for key, offset in fields.items()}
    row['removed'] = cpu.mem_read(node + 1, 1)[0] == 2
    rabbit_frames.append(row)
    if row['removed']:
        break
assert rabbit_frames[-1]['removed']

pickups = []
pickup_specs = [(24, 0x55, 0x43a790, 0x43a820, 0x43a8e0), (25, 0x53, 0x428850, 0x4288e0, 0x4289a0),
                (26, 0x57, 0x41f510, 0x41f5a0, 0x41f660), (27, 0x59, 0x420380, 0x420410, 0x4204d0),
                (28, 0x54, 0x401000, 0x401090, 0x401150), (38, 0x58, 0x440fb0, 0x441040, 0x441100)]
for index, (kind, code, loader, ctor, update) in enumerate(pickup_specs):
    start()
    write(0x77eb78, 0x1601600)
    loaded.clear()
    played.clear()
    call(loader)
    offset = len(base['allocations'])
    call(ctor, code, update, 0, 6, 6500, 3032, kind)
    node, data = base['allocations'][offset:offset + 2]
    call(0x4098f0, base['NODE'], node)
    counts = [read(PLAYER + 0xc8 + i * 4) for i in range(6)]
    assert counts == [int(i == index) for i in range(6)]
    frames = []
    for _ in range(80):
        call(read(node + 4), node)
        removed = cpu.mem_read(node + 1, 1)[0] == 2
        frames.append({'screenX': read(data + 0x24), 'screenY': read(data + 0x28), 'vy': read(data + 0x38), 'removed': removed})
        if removed:
            break
    pickups.append({'kind': kind, 'counts': counts, 'points': read(PLAYER + 0x70), 'images': list(loaded), 'sounds': list(played), 'trace': frames})

consumption = []
for slot in range(2, 8):
    for count in [0, 1, 2]:
        for busy in [False, True]:
            start()
            write(0x77eb78, 0x1601600)
            write(PLAYER + 0xc8 + (slot - 2) * 4, count)
            write(0x46cd04, slot)
            write(0x46cda8, int(busy))
            for address in [0x46cdac, 0x46cdb0, 0x46cdb4, 0x46d4ec, 0x46d4b0, 0x46d4b4]:
                write(address, 0)
            offset = len(base['allocations'])
            call(0x42eff0, 0x16, 0x42f060, 0, 9)
            node, data = base['allocations'][offset:offset + 2]
            write(0x46d4ec, 1)
            call(0x42f060, node)
            write(0x46d4ec, 0)
            call(0x42f060, node)
            left = read(PLAYER + 0xc8 + (slot - 2) * 4)
            assert left == count - (min(2, count) if slot == 2 else min(1, count)) if not busy else left == count
            consumption.append({'slot': slot, 'count': count, 'busy': busy, 'remaining': left,
                                'selected': read(0x46cd04), 'busyAfter': bool(read(0x46cda8))})

result = {'traces': traces, 'animations': animations, 'contacts': contacts, 'dog': dog, 'dogContacts': dog_contacts,
          'rabbit': rabbit_frames, 'pickups': pickups,
          'consumption': consumption,
          'scope': 'native constructors/loaders/updates/destructors and contacts; image headers, surfaces and audio output substituted; general enemies held stationary in movement traces'}
destination = base['base']['ROOT'] / 'test/fixtures/original-companions.json'
destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print('Captured eight companion scenarios, dog, rabbit, pickups, contact guards and 36 inventory consumption cases.')
