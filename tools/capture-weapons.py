"""Capture native ammo pickups, player throws, weapon collisions and inventory input."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP

base = runpy.run_path(str(Path(__file__).with_name('capture-objects.py')))
cpu, write, read, call = (base[key] for key in ['cpu', 'write', 'read', 'call'])
PLAYER, NODE, CAMERA = (base[key] for key in ['PLAYER', 'NODE', 'CAMERA'])
shots, splashes = [], []


def observe(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    target = splashes if address == 0x42b300 else shots
    row = {'x': read(sp + 20), 'y': read(sp + 24)}
    if address != 0x42b300:
        row.update({'type': read(sp + 4), 'vx': read(sp + 28), 'vy': -10})
    target.append(row)


for address in [0x42d640, 0x42fc60, 0x42b300]:
    cpu.hook_add(UC_HOOK_CODE, observe, begin=address, end=address)
for address in [0x7903b4, 0x7903b0, 0x478b08, 0x478b00]:
    write(address, 0x1600000)
for address, value in {0x7903ac: 16, 0x7903b8: 16, 0x478b04: 34, 0x478b0c: 36,
                       0x77d0b8: 16, 0x77d0c0: 16, 0x77d460: 34, 0x77d464: 36,
                       0x77ca5c: 116, 0x77ca60: 71}.items():
    write(address, value)
# Only DirectDraw output is replaced for the inventory, which draws unconditionally.
write(0x77dc6c, 0x1600000)
write(0x77d1b8, 0x1600000)
write(0x160011c, 0x1600320)
cpu.mem_write(0x1600320, b'\x31\xc0\xc2\x18\x00')


def player_values():
    return {**base['player_values'](), 'balls': read(PLAYER + 0xe0), 'waterBombs': read(PLAYER + 0xe4),
            'fireHeld': bool(read(PLAYER + 0xe8)), 'menuHeld': bool(read(PLAYER + 0x98))}


def shot_values(node, data):
    fields = {'x': 4, 'y': 8, 'vx': 0x3c, 'vy': 0x40, 'bounces': 0x44}
    return {**{key: read(data + offset) for key, offset in fields.items()}, 'removed': cpu.mem_read(node + 1, 1)[0] == 2}


pickups = []
for kind, ctor, update, code in [(43, 0x44dbf0, 0x44dcc0, 0x47), (44, 0x424040, 0x424110, 0x48)]:
    base['player'](points=99)
    offset = len(base['allocations'])
    call(ctor, code, update, 0, 6, 6500, 3032, kind)
    node, data = base['allocations'][offset:offset + 2]
    call(0x4098f0, NODE, node)
    expected = player_values()
    call(0x4098f0, NODE, node)
    assert player_values() == expected and expected['points'] == 100
    frames = []
    for _ in range(80):
        call(read(node + 4), node)
        removed = cpu.mem_read(node + 1, 1)[0] == 2
        frames.append({'screenX': read(data + 0x24), 'screenY': read(data + 0x28), 'vy': read(data + 0x38), 'removed': removed})
        if removed:
            break
    pickups.append({'kind': kind, 'expected': expected, 'trace': frames})

entries = {0: 0x40d730, 1: 0x40d760, 2: 0x40d790, 5: 0x40d7c0, 6: 0x40d830, 11: 0x40d860,
           7: 0x40d890, 8: 0x40d8c0, 9: 0x40d8f0, 10: 0x40d920, 12: 0x40d950,
           13: 0x40d980, 14: 0x40d9b0, 15: 0x40d9e0, 16: 0x40da10, 17: 0x40da70, 94: 0x40da40}
firing = []
for state, entry in entries.items():
    for selected in [0, 1]:
        for facing in [0, 1]:
            base['player'](x=6500, y=3032)
            call(entry, PLAYER)
            write(PLAYER + 0x88, facing)
            write(PLAYER + 0xe0, 2)
            write(PLAYER + 0xe4, 2)
            write(0x46cd04, selected)
            frames = []
            for fire in [True, True, True, False, True, False, True]:
                shots.clear()
                write(0x46d4e8, int(fire))
                call(0x405cf0, NODE)
                hit = call(0x431130, PLAYER + 0x2c, read(PLAYER + 8), read(PLAYER + 12))
                if hit:
                    call(0x40d4c0, NODE, hit)
                frames.append({'input': {'fire': fire}, 'expected': player_values(), 'shots': list(shots)})
            firing.append({'state': state, 'selected': selected, 'facing': facing, 'trace': frames})
write(0x46d4e8, 0)

specs = [(65, 0x42d640, 0x42d730, 0x42d810, 0x42e130), (66, 0x42fc60, 0x42fd50, 0x42fe30, 0x430a50)]
projectiles, contacts = [], []
for kind, ctor, update, contact, terrain in specs:
    for vx in [-10, 10]:
        offset = len(base['allocations'])
        call(ctor, kind, update, 0, 6, 6500, 3032, vx)
        node, data = base['allocations'][offset:offset + 2]
        frames = []
        for _ in range(200):
            splashes.clear()
            call(update, node)
            hit = call(0x431130, data + 0x14, read(data + 4), read(data + 8))
            if hit:
                call(terrain, node, hit)
            expected = shot_values(node, data)
            frames.append({'expected': expected, 'splashes': list(splashes)})
            if expected['removed']:
                break
        assert frames[-1]['expected']['removed']
        projectiles.append({'type': kind, 'vx': vx, 'trace': frames})
    for enemy_kind in [0, 1, 2]:
        base['player'](points=99)
        enemy_node, enemy = base['create'](enemy_kind)
        offset = len(base['allocations'])
        call(ctor, kind, update, 0, 6, 6608, 3062, 10)
        node, data = base['allocations'][offset:offset + 2]
        splashes.clear()
        call(contact, node, enemy_node)
        contacts.append({'type': kind, 'enemyKind': enemy_kind, 'player': player_values(),
                         'enemy': base['enemy_values'](enemy_kind, enemy_node, enemy), 'shot': shot_values(node, data), 'splashes': list(splashes)})

# Run the real collision dispatcher: the splash can contact the same dying enemy on later ticks.
splashes_trace = []
for kind in [0, 1, 2]:
    write(0x1601404, 0)
    base['player']()
    enemy_node, enemy = base['create'](kind)
    cpu.mem_write(enemy_node + 1, b'\0')
    offset = len(base['allocations'])
    call(0x42b300, 66, 0x42b3d0, 0, 8, 6608, 3062)
    node, data = base['allocations'][offset:offset + 2]
    cpu.mem_write(node + 1, b'\0')
    frames = []
    for _ in range(11):
        call(base['specs'][kind][1], enemy_node)
        hit = call(0x431130, enemy + base['specs'][kind][5], read(enemy + 4), read(enemy + 8))
        if hit:
            call(base['specs'][kind][3], enemy_node, hit)
        call(0x42b3d0, node)
        call(0x434a50)
        frames.append({'enemy': base['enemy_values'](kind, enemy_node, enemy), 'points': read(PLAYER + 0x70),
                       'ticks': read(data + 0x48), 'removed': cpu.mem_read(node + 1, 1)[0] == 2})
    splashes_trace.append({'enemyKind': kind, 'trace': frames})

menus = []
for selected in [0, 1, 7]:
    base['player']()
    write(0x46cd04, selected)
    for address in [0x46cdac, 0x46cdb0, 0x46cdb4, 0x46d4ec, 0x46d4b0, 0x46d4b4]:
        write(address, 0)
    offset = len(base['allocations'])
    call(0x42eff0, 0x16, 0x42f060, 0, 9)
    node, data = base['allocations'][offset:offset + 2]
    frames = []
    for inputs in [{'up': True}, {'up': True}, {}, {'down': True}, {}, {'down': True}, {}, {'enter': True}, {}]:
        for key, address in [('up', 0x46d4b0), ('down', 0x46d4b4), ('enter', 0x46d4ec)]:
            write(address, int(inputs.get(key, False)))
        call(0x42f060, node)
        frames.append({'input': inputs, 'cursor': read(data + 4), 'selected': read(0x46cd04),
                       'upHeld': bool(read(0x46cdb0)), 'downHeld': bool(read(0x46cdb4)),
                       'enterHeld': bool(read(0x46cdac)), 'removed': cpu.mem_read(node + 1, 1)[0] == 2})
    menus.append({'initial': selected, 'trace': frames})

result = {'pickups': pickups, 'firing': firing, 'projectiles': projectiles, 'contacts': contacts,
          'splashes': splashes_trace, 'menus': menus}
destination = base['base']['ROOT'] / 'test/fixtures/original-weapons.json'
destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
assert len(firing) == 68 and len(contacts) == 6
print('Captured two pickups, 68 firing sequences, four trajectories, six hits, splash dispatcher traces and inventory input.')
