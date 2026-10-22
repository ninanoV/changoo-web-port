"""Capture map-kind 92's native forced fall, landing poses and return to control."""
import json
from pathlib import Path
import runpy

a = runpy.run_path(str(Path(__file__).with_name('capture-atlas-support.py')))
g, b, cpu, write, read, call = (a[key] for key in ['graphics', 'base', 'cpu', 'write', 'read', 'call'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
data = g['resources']['stage4.map']
width, height = int.from_bytes(data[:4], 'little'), int.from_bytes(data[4:8], 'little')
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, data[8 + row * width * 10:8 + (row + 1) * width * 10])
cpu.mem_write(0x18f2000, b'block4.app\0'); call(0x4402c0, 0x18f2000)
write(CAMERA + 68, width); write(CAMERA + 72, height)
write(0x461428, 4); write(0x46142c, 4)
b['player'](x=0, y=0); call(0x40ded0, NODE)
images = list(a['atlases'][read(0x473d48)].values())
poses = {}
for state, setter in [(95, 0x40df00), (96, 0x40df30), (97, 0x40df60)]:
    call(setter, PLAYER)
    indices = [read(read(PLAYER + 24) + i * 4) for i in range(read(PLAYER + 36))]
    poses[state] = {'frames': [images[index].removesuffix('.app') for index in indices], 'count': len(indices), 'period': read(PLAYER + 40)}

traces = []
for scenario, x, y, vy in [('origin', 0, 0, 0), ('near-ground', 100, 6160, -8)]:
    for priority in range(10):
        write(0x1601000 + priority * 64 + 24, 0); write(0x471920 + priority * 4, 1)
    write(0x1601404, 0); write(0x1601504, 0)
    b['player'](x=x, y=y, vy=vy, invulnerable=20)
    write(PLAYER + 76, x); write(PLAYER + 80, y)
    write(NODE + 4, 0x405cf0); write(NODE + 20, 0x1601200); write(NODE + 24, 0)
    write(0x1601218, NODE); cpu.mem_write(NODE + 1, b'\0')
    call(0x431050, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x40d4c0)
    offset = len(b['allocations']); call(0x430fd0, 3, 0x431000, 0x4310f0, 9)
    cpu.mem_write(b['allocations'][offset] + 1, b'\0')
    offset = len(b['allocations']); call(0x445290, 45, 0x4452e0, 0x445300, 6)
    marker = b['allocations'][offset]
    assert read(b['base']['MASK'] + 4) == int.from_bytes(g['resources']['block4.app'][4:8], 'little')
    initial, frames, finished = b['player_values'](), [], 0
    for tick in range(900):
        camera = {'x': max(0, read(PLAYER + 8) - 200), 'y': max(0, read(PLAYER + 12) - 200)}
        write(CAMERA + 4, camera['x']); write(CAMERA + 8, camera['y'])
        for address in [0x46d4b0, 0x46d4bc, 0x46d4e8, 0x46d4ec]: write(address, 1)
        for address in [0x46d4b4, 0x46d4b8, 0x46d4d8, 0x46d4f0]: write(address, 0)
        write(0x46d4ac, int(read(NODE + 4) == 0x40dd30)); a['draws'].clear()
        call(0x44d3a0)
        falling = read(NODE + 4) == 0x40dd30
        frames.append({'camera': camera, 'expected': b['player_values'](), 'falling': falling,
                       'markerRemoved': cpu.mem_read(marker + 1, 1)[0] == 2, 'draws': list(a['draws'])})
        if tick > 1 and not falling:
            finished += 1
            if finished == 20: break
    assert finished == 20 and any(row['expected']['state'] == 97 for row in frames)
    traces.append({'scenario': scenario, 'initial': initial, 'trace': frames})
    print(scenario, len(frames), 'ticks, final', b['player_values'](), flush=True)

root = b['base']['ROOT']
(root / 'web/fall-data.js').write_text('// Native 0x40dc80 atlas and 0x40df00/30/60 animation tables.\nexport const FALL_POSES = ' + json.dumps(poses, separators=(',', ':')) + ';\n')
(root / 'test/fixtures/original-fall.json').write_text(json.dumps({'poses': poses, 'traces': traces}, separators=(',', ':')) + '\n')
