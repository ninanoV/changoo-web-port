"""Record original item/enemy/projectile functions; requires unicorn==2.1.4."""
import json
from pathlib import Path
import runpy
import struct

from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_EIP, UC_X86_REG_ESP

base = runpy.run_path(str(Path(__file__).with_name('capture-original.py')))
cpu, write, read, call = (base[key] for key in ['cpu', 'write', 'read', 'call'])
PLAYER, NODE, CAMERA = (base[key] for key in ['PLAYER', 'NODE', 'CAMERA'])
cpu.mem_map(0x1600000, 0x200000)
heap = 0x1610000
allocations, shots = [], []


def allocate(uc, address, size, _):
    global heap
    stack = uc.reg_read(UC_X86_REG_ESP)
    length, output = read(stack + 4), read(stack + 8)
    result = heap
    heap += (length + 31) // 32 * 32
    assert heap < 0x1800000
    write(output, result)
    allocations.append(result)
    uc.reg_write(UC_X86_REG_EAX, result)
    uc.reg_write(UC_X86_REG_ESP, stack + 4)
    uc.reg_write(UC_X86_REG_EIP, read(stack))


def observe_shot(uc, address, size, _):
    stack = uc.reg_read(UC_X86_REG_ESP)
    shots.append({'type': read(stack + 4), 'x': read(stack + 20), 'y': read(stack + 24), 'vx': read(stack + 28), 'vy': read(stack + 32)})


cpu.hook_add(UC_HOOK_CODE, allocate, begin=0x42a170, end=0x42a170)
for address in [0x4365c0, 0x42d2a0]:
    cpu.hook_add(UC_HOOK_CODE, observe_shot, begin=address, end=address)
# Only allocation and DirectSound Play are substituted; gameplay instructions are unchanged.
write(0x1600000, 0x1600100)
write(0x1600130, 0x1600200)
cpu.mem_write(0x1600200, b'\x31\xc0\xc2\x10\x00')
for address in [0x4767e0, 0x4767d8, 0x77ef54, 0x77ef58, 0x475200, 0x4752e8, 0x473770, 0x4738fc, 0x78f35c, 0x78f234, 0x77e918, 0x77ea40]:
    write(address, 0x1600000)
for priority in range(10):
    write(0x4718f8 + priority * 4, 0x1601000 + priority * 64)
write(0x46da40, 0x1601400)
write(0x46d0bc, 0x1601500)
write(0x77eb78, 0x1601600)
write(0x1601630, 10)
write(0x1601634, 400)
write(0x77bf48, CAMERA)
write(CAMERA + 4, 6400)
write(CAMERA + 8, 2719)
write(0x46d4ac, 0)
write(0x473d20, PLAYER)
write(NODE + 12, PLAYER)
cpu.mem_write(NODE, b'\x64')
for address, value in {0x473844: 76, 0x4738f8: 72, 0x78f358: 76, 0x78f478: 72, 0x77ea48: 76, 0x77eb68: 72, 0x4767dc: 32, 0x4767e8: 32, 0x77ef5c: 25, 0x77ef64: 39, 0x77e0c4: 16, 0x77e0c8: 16, 0x77d0ac: 18, 0x77d0b4: 7}.items():
    write(address, value)

specs = {
    0: (0x4038e0, 0x4039e0, 0x403bc0, 0x403c80, 0x403c30, 0x28),
    1: (0x445ca0, 0x445db0, 0x4460d0, 0x446190, 0x446140, 0x20),
    2: (0x438d10, 0x438e10, 0x439110, 0x4391d0, 0x439180, 0x20),
    10: (0x43bc00, 0x43bcf0, 0x43bee0, 0, 0, 0xc),
    45: (0x4145c0, 0x414690, 0x4147b0, 0, 0, 0xc),
}


def player(**overrides):
    cpu.mem_write(PLAYER, bytes(0x110))
    values = {4: NODE, 8: 6500, 12: 3032, 16: 76, 20: 72, 0x2c: 24, 0x30: 14, 0x34: 50, 0x38: 71, 0x88: 1, 0x8c: 5, 0x100: 1}
    fields = {'x': 8, 'y': 12, 'state': 0x5c, 'vy': 0x58, 'points': 0x70, 'invulnerable': 0xb8}
    for offset, value in values.items():
        write(PLAYER + offset, value)
    call(0x40d730, PLAYER)
    for key, value in overrides.items():
        write(PLAYER + fields[key], value)


def create(kind, x=6608, y=3032):
    start = len(allocations)
    ctor, update, destructor, *_ = specs[kind]
    call(ctor, {10: 0x51, 45: 0x49}.get(kind, 0x65 + kind), update, destructor, 6, x, y, kind)
    node, data = allocations[start:start + 2]
    return node, data


def enemy_values(kind, node, data):
    fields = {'x': 4, 'y': 8, 'vx': 0x50 if kind == 0 else 0x48, 'vy': 0x54 if kind == 0 else 0x4c,
              'state': 0x58 if kind == 0 else 0x50, 'frame': 0x18 if kind == 0 else 0x10,
              'ticks': 0x1c if kind == 0 else 0x14, 'period': 0x24 if kind == 0 else 0x1c,
              'facing': 0x60 if kind == 1 else 0x68}
    if kind:
        fields['timer'] = 0x58 if kind == 1 else 0x60
    return {**{key: read(data + offset) for key, offset in fields.items()}, 'removed': cpu.mem_read(node + 1, 1)[0] == 2}


def player_values():
    fields = {'x': 8, 'y': 12, 'vx': 0x54, 'vy': 0x58, 'state': 0x5c, 'frame': 0x1c, 'ticks': 0x20,
              'facing': 0x88, 'lives': 0x8c, 'points': 0x70, 'chocobi': 0x74, 'cans': 0xec, 'invulnerable': 0xb8}
    return {key: read(PLAYER + offset) for key, offset in fields.items()}


def capture():
    enemies = []
    for kind in [0, 1, 2]:
        player()
        node, data = create(kind)
        trace = []
        initial = enemy_values(kind, node, data)
        for tick in range(260):
            shots.clear()
            call(specs[kind][1], node)
            hit = call(0x431130, data + specs[kind][5], read(data + 4), read(data + 8))
            if hit:
                call(specs[kind][3], node, hit)
            trace.append({'expected': enemy_values(kind, node, data), 'shots': list(shots)})
        enemies.append({'kind': kind, 'initial': initial, 'trace': trace})

    contacts = []
    for kind in [10, 45, 0, 1, 2]:
        for scenario in (['pickup', 'bonus'] if kind in [10, 45] else ['side', 'stomp', 'rising', 'immune']):
            initial_player = {'x': 6608, 'y': 2980 if scenario == 'stomp' else 3032,
                              'state': 2 if scenario in ['stomp', 'rising'] else 0,
                              'vy': 5 if scenario == 'stomp' else -5 if scenario == 'rising' else 0,
                              'points': 99 if scenario == 'bonus' else 0,
                              'invulnerable': 30 if scenario == 'immune' else 0}
            player(**initial_player)
            node, data = create(kind)
            call(0x4098f0, NODE, node)
            expected = player_values()
            object_state = read(data + (0x3c if kind in [10, 45] else 0x58 if kind == 0 else 0x50))
            # Repeat the contact: collected/defeated objects and hurt players must not be rewarded twice.
            call(0x4098f0, NODE, node)
            assert player_values() == expected
            contacts.append({'kind': kind, 'scenario': scenario, 'initial': initial_player, 'expected': expected, 'objectState': object_state})

    player(x=6608)
    node, data = create(0)
    call(0x4098f0, NODE, node)
    damage = []
    for _ in range(30):
        call(0x405cf0, NODE)
        hit = call(0x431130, PLAYER + 0x2c, read(PLAYER + 8), read(PLAYER + 12))
        if hit:
            call(0x40d4c0, NODE, hit)
        damage.append(player_values())

    markers = []
    marker_node, marker_data = 0x1601800, 0x1601900
    cpu.mem_write(marker_node, b'\x3f')
    write(marker_node + 12, marker_data)
    for kind in [0, 1, 2]:
        node, data = create(kind)
        for direction in [2, 0, 1]:
            cpu.mem_write(marker_data + 0x40, bytes([direction]))
            call(specs[kind][4], node, marker_node)
            markers.append({'kind': kind, 'direction': direction, 'expected': enemy_values(kind, node, data)})

    projectiles = []
    for kind, ctor, update, collision, rect in [(91, 0x4365c0, 0x4366b0, 0x4367a0, 0x14), (95, 0x42d2a0, 0x42d380, 0x42d4a0, 0x14)]:
        start = len(allocations)
        call(ctor, kind, update, 0, 6, 6608, 3062, -4, -16 if kind == 91 else 0)
        node, data = allocations[start:start + 2]
        trace = []
        for _ in range(160):
            call(update, node)
            hit = call(0x431130, data + rect, read(data + 4), read(data + 8))
            if hit:
                call(collision, node, hit)
            removed = cpu.mem_read(node + 1, 1)[0] == 2
            trace.append({'x': read(data + 4), 'y': read(data + 8), 'vx': read(data + 0x3c), 'vy': read(data + 0x40), 'bounces': read(data + 0x44), 'removed': removed})
            if removed:
                break
        projectiles.append({'kind': kind, 'trace': trace})

    defeats, pickups = [], []
    for kind in [0, 1, 2, 10, 45]:
        player(x=6608, y=2980, state=2, vy=5)
        node, data = create(kind)
        call(0x4098f0, NODE, node)
        trace = []
        for _ in range(80):
            call(read(node + 4), node)
            removed = cpu.mem_read(node + 1, 1)[0] == 2
            if kind <= 2:
                if not removed:
                    hit = call(0x431130, data + specs[kind][5], read(data + 4), read(data + 8))
                    if hit:
                        call(specs[kind][3], node, hit)
                trace.append(enemy_values(kind, node, data))
            else:
                trace.append({'screenX': read(data + 0x24), 'screenY': read(data + 0x28), 'vy': read(data + 0x38), 'removed': removed})
            if removed:
                break
        (defeats if kind <= 2 else pickups).append({'kind': kind, 'trace': trace})

    result = {'enemies': enemies, 'contacts': contacts, 'damage': damage, 'markers': markers, 'projectiles': projectiles, 'defeats': defeats, 'pickups': pickups}
    destination = base['ROOT'] / 'test/fixtures/original-objects.json'
    assert len(contacts) == 16 and any(frame['shots'] for enemy in enemies for frame in enemy['trace'])
    destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(f'Captured {len(enemies)} enemy traces, {len(contacts)} contacts, hurt recovery, markers and projectile traces.')


if __name__ == '__main__':
    capture()
