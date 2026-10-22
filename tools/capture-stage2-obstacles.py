"""Capture native stage-two projectile, dropper, life pickup and spring behavior."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, write, read, call, loaded, played = (g[key] for key in ['base', 'cpu', 'write', 'read', 'call', 'loaded', 'played'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
specs = {
    35: (0x438950, 0x4389c0, 0x438a70, 0x438b70, 0x3d),
    42: (0x440720, 0x4407b0, 0x440880, 0x4409a0, 0x5a),
    69: (0x413310, 0x4133f0, 0x4134c0, 0x4135f0, 0x40),
    68: (0x401360, 0x401440, 0x401510, 0x401640, 0x40),
    91: (0x441f10, 0x441ff0, 0x4420c0, 0x4421f0, 0x40),
    94: (0x41fdf0, 0x41fed0, 0x41ffa0, 0x4200d0, 0x40),
    89: (0x44c660, 0x44c740, 0x44c810, 0x44c940, 0x40),
    93: (0x449f20, 0x44a040, 0x44a130, 0x44a2d0, 0x5d),
    98: (0x44e170, 0x44e2c0, 0x44e3b0, 0x44e4f0, 0x62),
}
fields = {
    35: {'x': 4, 'y': 8, 'width': 68, 'height': 72, 'frame': 76, 'ticks': 80, 'count': 84, 'period': 88},
    42: {'x': 4, 'y': 8, 'width': 76, 'height': 80, 'screenX': 36, 'screenY': 40, 'vx': 52, 'vy': 56},
    69: {'x': 4, 'y': 8, 'oldX': 64, 'oldY': 68, 'width': 96, 'height': 100, 'vx': 72, 'vy': 76, 'state': 80,
         'frame': 32, 'ticks': 36, 'frameCount': 40, 'period': 44},
    93: {'x': 4, 'y': 8, 'width': 12, 'height': 16, 'frame': 24, 'ticks': 28, 'count': 32, 'period': 36,
         'oldX': 72, 'oldY': 76, 'vx': 80, 'vy': 84, 'state': 88, 'facing': 104},
    98: {'x': 4, 'y': 8, 'width': 12, 'height': 16, 'frame': 24, 'ticks': 28, 'count': 32, 'period': 36,
         'oldX': 72, 'oldY': 76, 'vx': 80, 'vy': 84, 'facing': 104},
}
fields[89] = fields[69]
fields[68] = fields[91] = fields[94] = fields[69]
springs = [68, 69, 89, 91, 94]
spawns = []


def observe(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    spawns.append({'type': 98, 'x': read(sp + 20), 'y': read(sp + 24), 'vx': 0, 'vy': 6})


cpu.hook_add(UC_HOOK_CODE, observe, begin=0x44e2c0, end=0x44e2c0)
call(0x434c10)
for loader, *_ in specs.values(): call(loader)
cpu.mem_write(0x476288, b''.join(i.to_bytes(4, 'little') for i in [24, 65, 50, 71]))
write(CAMERA + 4, 6200); write(CAMERA + 8, 1000)
map_data = g['resources']['stage2.map']
width, height = int.from_bytes(map_data[:4], 'little'), int.from_bytes(map_data[4:8], 'little')
for row in range(height):
    cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
cpu.mem_write(0x18f2000, b'block2.app\0'); call(0x4402c0, 0x18f2000)


def create(kind, x=6500, y=1200):
    _, ctor, update, destructor, code = specs[kind]
    offset = len(b['allocations'])
    call(ctor, code, update, destructor, 6, x, y, *([-10, -10] if kind == 93 else [kind]))
    return b['allocations'][offset:offset + 2]


def values(kind, node, data):
    result = {key: read(data + offset) for key, offset in fields[kind].items()}
    result['removed'] = cpu.mem_read(node + 1, 1)[0] == 2
    if kind in springs: result['spriteIndex'] = read(read(data + 28) + result['frame'] * 4)
    if kind == 93: result['spriteIndex'] = read(read(data + 20) + result['frame'] * 4)
    if kind == 42: result['collected'] = read(data + 60) == 1
    return result


metadata, traces, contacts = {}, [], []
for kind, (loader, _, update, destructor, _) in specs.items():
    loaded.clear(); call(loader)
    images = list(loaded)
    node, data = create(kind)
    body_offset = 40 if kind in [93, 98] else 12
    initial = values(kind, node, data)
    body = [read(data + body_offset + i * 4) for i in range(4)]
    metadata[kind] = {'initial': initial, 'body': body, 'images': images}
    trace = []
    if kind in springs:
        b['player'](x=6500, y=1135, state=2, vy=5); call(0x4098f0, NODE, node)
    if kind == 42:
        b['player'](); call(0x4098f0, NODE, node)
    start = values(kind, node, data)
    for tick in range(200 if kind in [35, 93] else 64):
        played.clear(); spawns.clear()
        call(read(node + 4), node)
        if kind == 93:
            hit = call(0x431130, data + body_offset, read(data + 4), read(data + 8))
            if hit: call(0x44a340, node, hit)
        state = values(kind, node, data)
        trace.append({'expected': state, 'spawns': list(spawns)})
        if state['removed']: break
    played.clear(); call(destructor, node)
    metadata[kind]['exitSounds'] = list(played)
    traces.append({'kind': kind, 'initial': start, 'trace': trace})
    if kind == 35: continue
    for state in [0, 2, 4, 10, 14, 17]:
        for scenario in ['side', 'fall', 'rise', 'immune', 'bonus']:
            node, data = create(kind)
            b['player'](x=6500, y=1135 if scenario in ['fall', 'rise'] else 1200,
                        state=state, vy=-5 if scenario == 'rise' else 5,
                        invulnerable=20 if scenario == 'immune' else 0, points=99 if scenario == 'bonus' else 0)
            before = b['player_values'](); played.clear(); call(0x4098f0, NODE, node)
            contacts.append({'kind': kind, 'scenario': scenario, 'before': before, 'player': b['player_values'](),
                             'onPlatform': bool(read(PLAYER + 0x64)), 'actor': values(kind, node, data), 'sounds': list(played)})
    print(kind, images, metadata[kind]['exitSounds'], len(trace), flush=True)

root = b['base']['ROOT']
(root / 'test/fixtures/original-stage2-obstacles.json').write_text(json.dumps({'metadata': metadata, 'traces': traces, 'contacts': contacts}, separators=(',', ':')) + '\n')
(root / 'web/stage2-obstacle-data.js').write_text('// Extracted by capture-stage2-obstacles.py from SHIN.EXE.\n'
    + 'export const STAGE2_OBSTACLES = ' + json.dumps(metadata, separators=(',', ':')) + ';\n')
