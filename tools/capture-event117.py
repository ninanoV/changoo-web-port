"""Capture the second stage-one dialogue and its return to enemy gameplay."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE

support = runpy.run_path(str(Path(__file__).with_name('capture-event-support.py')))
base, cpu, write, read, call, set_clock, played, graphics_loader = (support[key] for key in
    ['base', 'cpu', 'write', 'read', 'call', 'set_clock', 'played', 'graphics_loader'])
PLAYER, NODE, CAMERA = (support[key] for key in ['PLAYER', 'NODE', 'CAMERA'])
for address in [0x40ea10, 0x40ebc0, 0x403ec0, 0x404050, 0x42a210]:
    cpu.hook_add(UC_HOOK_CODE, graphics_loader, begin=address, end=address)
cpu.mem_write(0x1600310, b'\x31\xc0\xc2\x04\x00')
write(0x1600108, 0x1600310)


def start():
    set_clock(0)
    write(0x46dee4, 0)
    write(0x46d4ec, 0)
    base['player'](x=5520, y=2680)
    write(CAMERA + 4, 5320)
    write(CAMERA + 8, 2400)
    played.clear()
    offset = len(base['allocations'])
    call(0x436030, 0x2d, 0x436130, 0x4362c0, 6)
    return base['allocations'][offset:offset + 2]


def sprite_name(table, pointer, frame):
    index = read(read(pointer) + frame * 4)
    return bytes(cpu.mem_read(table + index * 20, 20)).split(b'\0')[0].decode().replace('.raw', '.app')


def snapshot(node, data):
    enemy = read(0x473824)
    return {'phase': read(data + 4), 'playerState': read(PLAYER + 0x5c),
            'enemyState': read(enemy + 0x58), 'enemyUpdate': hex(read(read(enemy + 0x6c) + 4)),
            'removed': cpu.mem_read(node + 1, 1)[0] == 2, 'sounds': list(played)}


node, data = start()
initial = snapshot(node, data)
assert initial['sounds'] == ['43.WAV'] and initial['playerState'] == 107 and initial['enemyState'] == 4
trace = []
for i, boundary in enumerate([740, 2790, 4470, 7480, 8480, 12160]):
    for clock in [boundary, boundary + 1]:
        set_clock(clock)
        played.clear()
        call(0x436130, node)
        expected = snapshot(node, data)
        assert expected['phase'] == min(5, i + (clock > boundary))
        trace.append({'elapsed': clock, 'expected': expected})
assert trace[-1]['expected']['removed'] and trace[-1]['expected']['enemyState'] == 0

node, data = start()
skip = []
for enter in [True, False]:
    played.clear()
    write(0x46d4ec, int(enter))
    call(0x436130, node)
    skip.append({'enter': enter, 'expected': snapshot(node, data)})
assert skip[-1]['expected']['removed'] and skip[-1]['expected']['enemyUpdate'] == '0x4039e0'

restored = []
for state in [0, 1, 2, 7, 12]:
    node, data = start()
    write(0x46dee0, state)
    set_clock(12161)
    call(0x436130, node)
    call(0x4362c0, node)
    expected = base['player_values']()
    assert expected['state'] == state and read(NODE + 4) == 0x405cf0
    restored.append({'savedState': state, 'expected': expected, 'period': read(PLAYER + 0x28)})

poses = []
for state, entry in enumerate([0x40ec00, 0x40ec30, 0x40ec60, 0x40ec90, 0x40ecc0], 107):
    base['player'](x=5520, y=2680)
    call(entry, PLAYER)
    frames = []
    for _ in range(50):
        call(0x40eac0, NODE)
        hit = call(0x431130, PLAYER + 0x2c, read(PLAYER + 8), read(PLAYER + 12))
        if hit:
            call(0x40d4c0, NODE, hit)
        expected = base['player_values']()
        expected['sprite'] = sprite_name(0x45d438, PLAYER + 0x18, expected['frame'])
        frames.append(expected)
    poses.append({'state': state, 'trace': frames})

enemies = []
for state, entry in [(4, 0x404090), (5, 0x4040c0)]:
    node, data = base['create'](0, 5920, 2650)
    call(0x404060, node)
    call(entry, data)
    frames = []
    for _ in range(80):
        call(0x403f70, node)
        hit = call(0x431130, data + 0x28, read(data + 4), read(data + 8))
        if hit:
            call(0x403c80, node, hit)
        expected = base['enemy_values'](0, node, data)
        expected['sprite'] = sprite_name(0x45bfb8, data + 0x14, expected['frame'])
        frames.append(expected)
    call(0x4040f0, data)
    resumed = base['enemy_values'](0, node, data)
    assert resumed['state'] == 0 and resumed['period'] == 100 and read(node + 4) == 0x4039e0
    enemies.append({'state': state, 'trace': frames, 'resumed': resumed})

result = {'controller': '0x436130', 'initial': initial, 'boundaries': trace, 'skip': skip,
          'restored': restored, 'poses': poses, 'enemies': enemies,
          'scope': 'isolated native controller/cleanup/actors; graphics/allocation/clock/DirectSound substituted'}
destination = base['base']['ROOT'] / 'test/fixtures/original-event117.json'
destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print('Captured 12 boundaries, skip, 5 cleanup states, 250 player ticks, 160 enemy ticks and combat return.')
