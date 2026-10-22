"""Capture falling bridge 101/102 and real jungle spring/bridge scheduler journeys."""
import json
from pathlib import Path
import runpy
import struct

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, read, write, call, played = (g[key] for key in ['base', 'cpu', 'read', 'write', 'call', 'played'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
specs = {68: (0x401360, 0x401440, 0x401510, 0x401640, 64),
         91: (0x441f10, 0x441ff0, 0x4420c0, 0x4421f0, 64),
         101: (0x4176b0, 0x417710, 0x417820, 0x417930, 78),
         102: (0x4176b0, 0x417710, 0x417820, 0x417930, 78)}
bridge_fields = {'x': 4, 'y': 8, 'oldX': 44, 'oldY': 48, 'vx': 52, 'vy': 56, 'state': 60, 'width': 68, 'height': 72}
spring_fields = {'x': 4, 'y': 8, 'oldX': 64, 'oldY': 68, 'vx': 72, 'vy': 76, 'state': 80, 'width': 96, 'height': 100,
                 'frame': 32, 'ticks': 36, 'frameCount': 40, 'period': 44}
for loader, *_ in specs.values(): call(loader)
call(0x434c10)
cpu.mem_write(0x476288, struct.pack('<4i', 24, 65, 50, 71))
write(0x461428, 4); write(0x46142c, 4)
write(CAMERA + 4, 6200); write(CAMERA + 8, 1000)


def create(kind, x=6500, y=1200):
    _, ctor, update, destructor, code = specs[kind]
    offset = len(b['allocations']); call(ctor, code, update, destructor, 6, x, y, kind)
    return b['allocations'][offset:offset + 2]


def values(kind, node, data):
    result = {key: read(data + offset) for key, offset in (spring_fields if kind < 100 else bridge_fields).items()}
    result['removed'] = cpu.mem_read(node + 1, 1)[0] == 2
    if kind < 100: result['spriteIndex'] = read(read(data + 28) + result['frame'] * 4)
    return result


metadata, movement, contacts, terrain, journeys = {}, [], [], [], []
for kind in [101, 102]:
    node, data = create(kind)
    metadata[kind] = {'initial': values(kind, node, data), 'body': [read(data + 12 + i * 4) for i in range(4)], 'image': g['surface_names'][read(0x476e00)]}
    trace = []
    for tick in range(100):
        if tick == 20: call(0x417980, node, NODE)
        call(0x417820, node); trace.append(values(kind, node, data))
    movement.append({'kind': kind, 'trace': trace})
    for state in [0, 2, 4, 10, 14, 17]:
        for scenario, px, py, vy, supported in [('fall', 6500, 1135, 5, False), ('rise', 6500, 1135, -5, False),
                ('side', 6500, 1180, 5, False), ('edge', 6532, 1135, 5, False), ('supported', 6500, 1180, 5, True)]:
            node, data = create(kind); b['player'](x=px, y=py, state=state, vy=vy)
            write(PLAYER + 100, int(supported))
            before = {**b['player_values'](), 'onPlatform': supported}
            played.clear(); call(0x4098f0, NODE, node); call(0x417980, node, NODE)
            contacts.append({'kind': kind, 'scenario': scenario, 'before': before, 'expected': {**b['player_values'](), 'onPlatform': bool(read(PLAYER + 100))},
                             'actor': values(kind, node, data), 'sounds': list(played)})

# Isolated type-1/type-2 contacts include the bridge's vertical +2 correction.
cpu.mem_write(0x478be8, struct.pack('<5h', -1, -1, -1, 0, 0) * 1500 * 210)
cpu.mem_write(0x478be8 + (10 * 1500 + 10) * 10, struct.pack('<5h', -1, 0, -1, 0, 0))
for pixel in [1, 2]:
    pixels = bytearray(640 * 32)
    for y in range(32): pixels[y * 640:y * 640 + 32] = bytes([pixel]) * 32
    cpu.mem_write(b['base']['MASK'], struct.pack('<II', 640, 32) + pixels)
    for x, y in [(280, 300), (295, 310), (320, 310), (295, 330), (330, 330)]:
        node, data = create(102, x, y)
        write(data + 44, x - 7); write(data + 48, y - 11); write(data + 56, 1)
        before = values(102, node, data); hit = call(0x431130, data + 12, x, y)
        if hit: call(0x4179a0, node, hit)
        terrain.append({'pixel': pixel, 'before': before, 'expected': values(102, node, data)})

map_data = g['resources']['stage4.map']; width, height = struct.unpack_from('<II', map_data)
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
for kind, x, y in [(68, 3039, 6240), (91, 11375, 5046), (101, 19840, 5215)]:
    for priority in range(10):
        write(0x1601000 + priority * 64 + 24, 0); write(0x471920 + priority * 4, 1)
    write(0x1601404, 0); write(0x1601504, 0)
    b['player'](x=x, y=y - 150, state=2, vy=5); call(0x40d790, PLAYER); write(PLAYER + 88, 5)
    write(NODE + 4, 0x405cf0); write(NODE + 20, 0x1601200); write(NODE + 24, 0)
    write(0x1601218, NODE); cpu.mem_write(NODE + 1, b'\0')
    call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x4098f0)
    call(0x431050, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x40d4c0)
    for ctor, code, update, destructor in [(0x430fd0, 3, 0x431000, 0x4310f0), (0x434a20, 2, 0x434a50, 0x434be0)]:
        offset = len(b['allocations']); call(ctor, code, update, destructor, 9); cpu.mem_write(b['allocations'][offset] + 1, b'\0')
    assert read(b['base']['MASK'] + 4) == 2464
    node, data = create(kind, x, y)
    initial, frames = b['player_values'](), []
    for tick in range(180):
        camera = {'x': x - 250, 'y': max(0, read(PLAYER + 12) - 280)}
        write(CAMERA + 4, camera['x']); write(CAMERA + 8, camera['y'])
        inputs = {'right': kind == 68 and 27 <= tick < 70, 'jump': kind == 101 and tick == 80}
        for key, address in [('right', 0x46d4bc), ('jump', 0x46d4b0)]: write(address, int(inputs[key]))
        for address in [0x46d4b4, 0x46d4b8, 0x46d4e8, 0x46d4ec, 0x46d4d8, 0x46d4f0]: write(address, 0)
        played.clear(); call(0x44d3a0)
        frames.append({'input': inputs, 'camera': camera, 'player': {**b['player_values'](), 'onPlatform': bool(read(PLAYER + 100))},
                       'surface': values(kind, node, data), 'sounds': list(played)})
    journeys.append({'kind': kind, 'x': x, 'y': y, 'initial': initial, 'trace': frames})
    print(kind, 'scheduler', len(frames), 'ticks', flush=True)

root = b['base']['ROOT']
(root / 'test/fixtures/original-jungle-surfaces.json').write_text(json.dumps({'metadata': metadata, 'movement': movement, 'contacts': contacts, 'terrain': terrain, 'journeys': journeys}, separators=(',', ':')) + '\n')
