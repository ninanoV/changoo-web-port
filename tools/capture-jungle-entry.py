"""Run native fall, opening dialogue and first pickup together on the real jungle map."""
import json
from pathlib import Path
import runpy
import struct

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, read, write, call, played = (g[key] for key in ['base', 'cpu', 'read', 'write', 'call', 'played'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
map_data = g['resources']['stage4.map']; width, height = struct.unpack_from('<II', map_data)
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
write(0x461428, 4); write(0x46142c, 4)
write(CAMERA + 68, width); write(CAMERA + 72, height)
call(0x447c80)

traces = []
for scenario in ['natural', 'skip']:
    for priority in range(10):
        write(0x1601000 + priority * 64 + 24, 0); write(0x471920 + priority * 4, 1)
    write(0x1601404, 0); write(0x1601504, 0); write(0x4602ec, 0)
    b['player'](x=0, y=0)
    write(NODE + 4, 0x405cf0); write(NODE + 20, 0x1601200); write(NODE + 24, 0)
    write(0x1601218, NODE); cpu.mem_write(NODE + 1, b'\0')
    call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x4098f0)
    call(0x431050, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x40d4c0)
    for ctor, code, update, destructor in [(0x430fd0, 3, 0x431000, 0x4310f0), (0x434a20, 2, 0x434a50, 0x434be0)]:
        offset = len(b['allocations']); call(ctor, code, update, destructor, 9); cpu.mem_write(b['allocations'][offset] + 1, b'\0')
    assert read(b['base']['MASK'] + 4) == 2464
    call(0x445290, 45, 0x4452e0, 0x445300, 6)
    call(0x441e10, 69, 0x441ea0, 0x441eb0, 6, 418, 6234, 85)
    call(0x447d10, 74, 0x447de0, 0x447f00, 6, 442, 6268, 52)
    frames, event_ticks = [], 0
    for tick in range(1150):
        active = read(NODE + 4) == 0x4114a0
        if active: event_ticks += 1
        inputs = {'right': tick >= 650 and read(PLAYER + 8) < 480, 'enter': scenario == 'skip' and event_ticks == 9}
        camera = {'x': max(0, read(PLAYER + 8) - 200), 'y': max(0, read(PLAYER + 12) - 280)}
        write(CAMERA + 4, camera['x']); write(CAMERA + 8, camera['y'])
        write(0x46d4bc, int(inputs['right'])); write(0x46d4ec, int(inputs['enter']))
        for address in [0x46d4b0, 0x46d4b4, 0x46d4b8, 0x46d4e8, 0x46d4d8, 0x46d4f0, 0x46d4ac]: write(address, 0)
        g['support']['set_clock'](tick * 1000 // 30); played.clear(); call(0x44d3a0)
        frames.append({'input': inputs, 'camera': camera, 'player': {**b['player_values'](), 'jungleItems': [read(PLAYER + 240), read(PLAYER + 244)]},
                       'falling': read(NODE + 4) == 0x40dd30, 'event': read(NODE + 4) == 0x4114a0, 'sounds': list(played)})
        if event_ticks and read(PLAYER + 8) >= 480 and not active: break
    assert read(PLAYER + 112) == 1 and read(PLAYER + 140) == 5 and read(PLAYER + 240) == 1
    traces.append({'scenario': scenario, 'trace': frames})
    print(scenario, len(frames), 'ticks', flush=True)

(b['base']['ROOT'] / 'test/fixtures/original-jungle-entry.json').write_text(json.dumps({'traces': traces,
    'scope': 'Native priority scheduler, fall, event85 and first item on stage4.map/block4. Three map nodes are instantiated up front; initial map factory/camera rendering are not emulated.'}, separators=(',', ':')) + '\n')
