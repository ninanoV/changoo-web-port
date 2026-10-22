"""Capture event 65 controller, cleanup and actor functions from SHIN.EXE."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE

support = runpy.run_path(str(Path(__file__).with_name('capture-event-support.py')))
base, cpu, write, read, call, set_clock, played, graphics_loader = (support[key] for key in
    ['base', 'cpu', 'write', 'read', 'call', 'set_clock', 'played', 'graphics_loader'])
PLAYER, NODE, CAMERA = (support[key] for key in ['PLAYER', 'NODE', 'CAMERA'])
for address in [0x40e6c0, 0x40e890, 0x44ec80, 0x428cb0, 0x42e340]:
    cpu.hook_add(UC_HOOK_CODE, graphics_loader, begin=address, end=address)


def start():
    set_clock(0)
    write(0x47060c, 0)
    write(0x46d4ec, 0)
    base['player'](x=4223, y=2680)
    write(CAMERA + 4, 4000)
    write(CAMERA + 8, 2400)
    played.clear()
    offset = len(base['allocations'])
    call(0x443cd0, 0x2d, 0x443e30, 0x444170, 6)
    return base['allocations'][offset:offset + 2]


def sprite_name(table, pointer, frame):
    index = read(read(pointer) + frame * 4)
    return bytes(cpu.mem_read(table + index * 20, 20)).split(b'\0')[0].decode().replace('.raw', '.app')


def snapshot(node, data):
    return {'phase': read(data + 4), 'playerState': read(PLAYER + 0x5c),
            'npcStates': [read(read(address) + 0x58) for address in [0x79057c, 0x77c354, 0x77d0d0]],
            'removed': cpu.mem_read(node + 1, 1)[0] == 2, 'sounds': list(played)}


node, data = start()
initial = snapshot(node, data)
assert initial['sounds'] == ['29.WAV', '30.WAV'] and initial['playerState'] == 20
boundaries = [3930, 7010, 13930, 19450, 25830, 33450, 36060, 37650, 39650]
trace = []
for i, boundary in enumerate(boundaries):
    for clock in [boundary, boundary + 1]:
        set_clock(clock)
        played.clear()
        call(0x443e30, node)
        row = snapshot(node, data)
        assert row['phase'] == i + (clock > boundary) if i < 8 else row['phase'] == 8
        trace.append({'elapsed': clock, 'expected': row})
assert trace[-1]['expected']['removed'] and trace[-1]['expected']['playerState'] == 0

node, data = start()
skip = []
for pressed in [True, False]:
    played.clear()
    write(0x46d4ec, int(pressed))
    call(0x443e30, node)
    skip.append({'enter': pressed, 'expected': snapshot(node, data)})
assert not skip[0]['expected']['removed'] and skip[1]['expected']['removed']

# Follow the destructor too: it restores the old state after installing the idle animation.
cpu.hook_add(UC_HOOK_CODE, graphics_loader, begin=0x42a210, end=0x42a210)
cpu.mem_write(0x1600310, b'\x31\xc0\xc2\x04\x00')
write(0x1600108, 0x1600310)
restored = []
for state in [0, 1, 2, 7, 12]:
    node, data = start()
    write(0x470608, state)
    call(0x40e9f0, PLAYER)
    call(0x444170, node)
    restored.append({'savedState': state, 'state': read(PLAYER + 0x5c), 'frame': read(PLAYER + 0x1c),
                     'ticks': read(PLAYER + 0x20), 'period': read(PLAYER + 0x28),
                     'animation': hex(read(PLAYER + 0x18)), 'update': hex(read(NODE + 4))})
    assert restored[-1]['state'] == state and restored[-1]['update'] == '0x405cf0'

poses = []
for state, entry in enumerate([0x40e8d0, 0x40e900, 0x40e930, 0x40e960, 0x40e990, 0x40e9c0], 20):
    base['player'](x=4223, y=2680)
    call(entry, PLAYER)
    frames = []
    for _ in range(50):
        call(0x40e770, NODE)
        hit = call(0x431130, PLAYER + 0x2c, read(PLAYER + 8), read(PLAYER + 12))
        if hit:
            call(0x40d4c0, NODE, hit)
        values = base['player_values']()
        values['sprite'] = sprite_name(0x45d2f8, PLAYER + 0x18, values['frame'])
        frames.append(values)
    poses.append({'state': state, 'trace': frames})

npcs = []
specs = [(0x79057c, 0x44eda0, 0x44eea0, 0x44f040, 0x44f1d0, 0x471d10),
         (0x77c354, 0x428dd0, 0x428ed0, 0x429070, 0x429200, 0x461e20),
         (0x77d0d0, 0x42e460, 0x42e560, 0x42e700, 0x42e890, 0x46cc30)]
for index, (global_ptr, ctor, update, collision, talk, names) in enumerate(specs):
    for state in [0, 1]:
        offset = len(base['allocations'])
        call(ctor, 0x39 + index, update, 0, 6, 4640 + index * 80, 2650)
        node, data = base['allocations'][offset:offset + 2]
        if state:
            call(talk, data)
        frames = []
        for _ in range(80):
            call(update, node)
            hit = call(0x431130, data + 0x28, read(data + 4), read(data + 8))
            if hit:
                call(collision, node, hit)
            fields = {'x': 4, 'y': 8, 'vx': 0x50, 'vy': 0x54, 'state': 0x58, 'frame': 0x18, 'ticks': 0x1c}
            values = {key: read(data + offset) for key, offset in fields.items()}
            values['sprite'] = sprite_name(names, data + 0x14, values['frame'])
            frames.append(values)
        npcs.append({'index': index, 'state': state, 'trace': frames})

result = {'controller': '0x443e30', 'initial': initial, 'boundaries': trace, 'skip': skip,
          'restored': restored, 'poses': poses, 'npcs': npcs,
          'scope': 'isolated controller, destructor, player and NPC updates; graphics/allocation/clock/DirectSound are substituted'}
destination = base['base']['ROOT'] / 'test/fixtures/original-event65.json'
destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print('Captured 18 timer boundaries, skip, 5 destructor states, 300 player and 480 NPC ticks for event 65.')
