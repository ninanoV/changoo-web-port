"""Capture stage-five moving wood surfaces, contact rules and native map requeue."""
import json
from pathlib import Path
import runpy
import struct
from unicorn.x86_const import UC_X86_REG_EIP

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, read, write, call, played = (g[key] for key in ['base', 'cpu', 'read', 'write', 'call', 'played'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
fields = {'x': 4, 'y': 8, 'oldX': 44, 'oldY': 48, 'vx': 52, 'vy': 56, 'state': 60, 'width': 68, 'height': 72}
for loader in [0x429230, 0x44a760, 0x419780]: call(loader)
cpu.mem_write(0x476288, struct.pack('<4i', 24, 65, 50, 71))


def create(kind, x=6500, y=1200):
    ctor, update, destructor, code = (0x44a7c0, 0x44a8a0, 0x44a990, 79) if kind == 103 else (0x429290, 0x4293e0, 0x429560, 77)
    offset = len(b['allocations']); call(ctor, code, update, destructor, 6, x, y, kind)
    return b['allocations'][offset:offset + 2]


def values(node, data):
    return {**{key: read(data + offset) for key, offset in fields.items()}, 'removed': cpu.mem_read(node + 1, 1)[0] == 2}


write(CAMERA + 4, 6200); write(CAMERA + 8, 1000)
metadata, movement, contacts, markers, terrain, requeues = {}, [], [], [], [], []
for kind in [96, 97, 98, 99, 100, 103]:
    node, data = create(kind)
    metadata[kind] = {'initial': values(node, data), 'body': [read(data + 12 + i * 4) for i in range(4)],
                      'image': g['surface_names'][read(0x78fb9c if kind == 103 else 0x77c3cc)]}
    trace = []
    for tick in range(90): call(read(node + 4), node); trace.append(values(node, data))
    movement.append({'kind': kind, 'trace': trace})
    for state in [0, 2, 4, 10, 14, 17]:
        for scenario, x, y, vy, on_platform in [('fall', 6500, 1135, 5, False), ('rise', 6500, 1135, -5, False),
                ('side', 6500, 1180, 5, False), ('supported', 6500, 1180, 5, True)]:
            node, data = create(kind); call(read(node + 4), node)
            b['player'](x=x, y=y, state=state, vy=vy); write(PLAYER + 100, int(on_platform))
            before = {**b['player_values'](), 'onPlatform': on_platform}; surface_before = values(node, data)
            call(0x4098f0, NODE, node)
            contacts.append({'kind': kind, 'scenario': scenario, 'before': before, 'surfaceBefore': surface_before,
                             'player': {**b['player_values'](), 'onPlatform': bool(read(PLAYER + 100))}, 'surface': values(node, data)})
    for direction in range(5):
        node, data = create(kind)
        marker_node, marker_data = 0x1405000, 0x1405100
        cpu.mem_write(marker_node, b'\x3f'); write(marker_node + 12, marker_data); cpu.mem_write(marker_data + 64, bytes([direction]))
        call(0x44a9e0 if kind == 103 else 0x4295b0, node, marker_node)
        markers.append({'kind': kind, 'direction': direction, 'state': read(data + 60)})

cpu.mem_write(0x478be8, struct.pack('<5h', -1, -1, -1, 0, 0) * 1500 * 210)
cpu.mem_write(0x478be8 + (10 * 1500 + 10) * 10, struct.pack('<5h', -1, 0, -1, 0, 0))
for pixel in [1, 2]:
    pixels = bytearray(640 * 32)
    for y in range(32): pixels[y * 640:y * 640 + 32] = bytes([pixel]) * 32
    cpu.mem_write(b['base']['MASK'], struct.pack('<II', 640, 32) + pixels)
    for kind in [98, 103]:
        for x, y in [(280, 300), (295, 310), (320, 310), (295, 330), (330, 330)]:
            node, data = create(kind, x, y); write(data + 44, x - 7); write(data + 48, y - 11); write(data + 56, 1)
            before = values(node, data); hit = call(0x431130, data + 12, x, y)
            if hit: call(0x44a9f0 if kind == 103 else 0x429620, node, hit)
            terrain.append({'kind': kind, 'pixel': pixel, 'before': before, 'expected': values(node, data)})

names = (b['base']['ROOT'] / 'Changoo (E)/RESOURCE/CHAR.CFG').read_text().split()
for kind in [3, 4, 5, 49, 50, 96, 97, 98, 99, 100, 103]:
    cpu.mem_write(0x18f2000, names[kind].replace('.raw', '.app').encode() + b'\0'); write(0x461430 + kind * 4, call(0x4402c0, 0x18f2000))
write(0x77bf44, 1500); write(0x77bf54, 210); write(CAMERA + 12, 0); write(CAMERA + 16, 0)
write(CAMERA + 4, 5000)
for kind in [96, 97, 98, 99, 100, 103]:
    node, data = create(kind, 9000, 1200); column, row = 282, 38
    cell = 0x478be8 + (row * 1500 + column) * 10
    cpu.mem_write(cell, struct.pack('<5h', -1, -1, -1, 0, 0)); call(read(node + 4), node)
    queued_kind = int.from_bytes(cpu.mem_read(cell + 4, 2), 'little', signed=True)
    offset = len(b['allocations']); call(0x426380, column, row, CAMERA)
    new_node, new_data = b['allocations'][offset:offset + 2]
    requeues.append({'kind': kind, 'queuedKind': queued_kind, 'original': values(node, data), 'recreated': values(new_node, new_data)})

# Coupled player/terrain/body managers on the real stage5 map.
call(0x41fdf0); call(0x434c10)
cpu.mem_write(0x18f2000, b'block5.app\0'); call(0x4402c0, 0x18f2000)
map_data = g['resources']['stage5.map']; width, height = struct.unpack_from('<II', map_data)
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
write(0x461428, 5); write(0x46142c, 5)
journeys = []
for kind, x, y in [(94, 29690, 1276), (96, 9920, 2528), (103, 15544, 3039)]:
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
    if kind == 94:
        offset = len(b['allocations']); call(0x41fed0, 64, 0x41ffa0, 0x4200d0, 6, x, y, kind)
        node, data = b['allocations'][offset:offset + 2]
    else:
        node, data = create(kind, x, y)
    initial, frames = b['player_values'](), []
    for tick in range(180):
        camera = {'x': x - 250, 'y': max(0, read(PLAYER + 12) - 280)}
        write(CAMERA + 4, camera['x']); write(CAMERA + 8, camera['y'])
        inputs = {'right': kind == 94 and 80 <= tick < 140, 'jump': kind == 96 and tick == 80}
        for key, address in [('right', 0x46d4bc), ('jump', 0x46d4b0)]: write(address, int(inputs[key]))
        for address in [0x46d4b4, 0x46d4b8, 0x46d4e8, 0x46d4ec, 0x46d4d8, 0x46d4f0]: write(address, 0)
        played.clear()
        try:
            call(0x44d3a0)
        except Exception:
            print('Journey failed:', kind, tick, hex(cpu.reg_read(UC_X86_REG_EIP)), b['player_values'](), flush=True)
            raise
        actor = values(node, data) if kind != 94 else {key: read(data + offset) for key, offset in
            {'x': 4, 'y': 8, 'oldX': 64, 'oldY': 68, 'vx': 72, 'vy': 76, 'state': 80, 'width': 96, 'height': 100,
             'frame': 32, 'ticks': 36, 'frameCount': 40, 'period': 44}.items()}
        frames.append({'input': inputs, 'camera': camera, 'player': {**b['player_values'](), 'onPlatform': bool(read(PLAYER + 100))},
                       'surface': actor, 'sounds': list(played)})
    journeys.append({'kind': kind, 'x': x, 'y': y, 'initial': initial, 'trace': frames})

root = b['base']['ROOT']
(root / 'test/fixtures/original-ice-surfaces.json').write_text(json.dumps({'metadata': metadata, 'movement': movement, 'contacts': contacts,
    'markers': markers, 'terrain': terrain, 'requeues': requeues, 'journeys': journeys}, separators=(',', ':')) + '\n')
print('Captured', len(movement), 'surface kinds,', len(contacts), 'contacts and', len(requeues), 'real dispatcher requeues.', flush=True)
