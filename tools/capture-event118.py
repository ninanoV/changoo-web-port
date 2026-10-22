"""Capture the native chocobi scene for differential web-port tests."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE

support = runpy.run_path(str(Path(__file__).with_name('capture-event-support.py')))
base, cpu, write, read, call, set_clock, played, graphics_loader = (support[key] for key in
    ['base', 'cpu', 'write', 'read', 'call', 'set_clock', 'played', 'graphics_loader'])
PLAYER, NODE, CAMERA = (support[key] for key in ['PLAYER', 'NODE', 'CAMERA'])
for address in [0x40dfb0, 0x40e5e0, 0x436360]:
    cpu.hook_add(UC_HOOK_CODE, graphics_loader, begin=address, end=address)
# Replace the graphics-heavy initializer, retaining its six audio loads and clock initialization.
for output, path in [(0x475df0, 0x45a0f4), (0x473d08, 0x45a0e0), (0x47572c, 0x45a0cc),
                     (0x475e60, 0x45a0b8), (0x475300, 0x45a0a4), (0x47581c, 0x45a090)]:
    call(0x42d4b0, 0, output, path)


def names(address, count):
    return [bytes(cpu.mem_read(address + i * 20, 20)).split(b'\0')[0].decode().replace('.raw', '.app') for i in range(count)]


def start():
    set_clock(0)
    write(0x45cfd8, 0)
    write(0x45cfdc, 0)
    write(0x46d4ec, 0)
    base['player'](x=670, y=3032)
    call(0x40d760, PLAYER)
    write(PLAYER + 0x54, 7)
    write(PLAYER + 0x108, 0)
    write(CAMERA + 4, 400)
    write(CAMERA + 8, 2719)
    offset = len(base['allocations'])
    call(0x4363c0, 0x45, 0x436480, 0x4364d0, 6, 765, 3085)
    node, data = base['allocations'][offset:offset + 2]
    call(0x436520, node, NODE)
    assert read(NODE + 4) == 0x40e270 and read(data + 0x70) == 1
    played.clear()
    return node, data


def snapshot(node):
    values = base['player_values']()
    values.update({'firstRecallFrame': read(PLAYER + 0x9c), 'firstRecallTicks': read(PLAYER + 0xa0),
                   'secondRecallFrame': read(PLAYER + 0xa4), 'secondRecallTicks': read(PLAYER + 0xa8),
                   'recallDone': read(PLAYER + 0xac), 'frameStartedAt': read(PLAYER + 0x108),
                   'removed': cpu.mem_read(node + 1, 1)[0] == 2, 'finished': read(NODE + 4) == 0x405cf0})
    return values


def update(node, clock, enter=False):
    set_clock(clock)
    write(0x46d4ec, int(enter))
    played.clear()
    call(0x40e270, NODE)
    hit = call(0x431130, PLAYER + 0x2c, read(PLAYER + 8), read(PLAYER + 12))
    if hit:
        call(0x40d4c0, NODE, hit)
    return {'elapsed': clock, 'enter': enter, 'expected': snapshot(node), 'sounds': list(played)}


node, data = start()
trace = []
for tick in range(1, 2000):
    row = update(node, tick * 1000 // 30)
    trace.append(row)
    if row['expected']['finished']:
        break
assert trace[-1]['expected']['finished'] and trace[-1]['expected']['removed']
assert [name for row in trace for name in row['sounds']] == [f'{i}.WAV' for i in range(21, 27)]
assert any(row['expected']['recallDone'] == 1 for row in trace)

node, data = start()
skip = [update(node, 300), update(node, 301, True), update(node, 302, False)]
assert not skip[-2]['expected']['finished'] and skip[-1]['expected']['finished']
assert not skip[-1]['expected']['removed'], 'The original skip leaves the chocobi prop visible'

result = {'update': '0x40e270', 'initial': {'x': 670, 'y': 3032, 'vx': 7, 'state': 1},
          'images': names(0x45ca60, 39), 'frames': [read(0x45cd70 + i * 4) for i in range(51)],
          'durations': [read(0x45ce40 + i * 4) for i in range(51)],
          'recallImages': [names(0x45cf10, 4), names(0x45cf68, 5)],
          'recallFrames': [list(cpu.mem_read(0x45cf60, 6)), list(cpu.mem_read(0x45cfd0, 6))],
          'trace': trace, 'skip': skip,
          'scope': 'native contact/update; graphics init/free omitted, audio init retained and clock/DirectSound substituted'}
destination = base['base']['ROOT'] / 'test/fixtures/original-event118.json'
destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(f'Captured {len(trace)} chocobi-scene ticks, 51 frames, 6 audio cues, recall animation and Enter skip.')
