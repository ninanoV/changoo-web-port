"""Run the stage5 ending cast and real stage6 map transition in the native scheduler."""
import json
from pathlib import Path
import runpy
import struct
from unicorn.x86_const import UC_X86_REG_EIP

a = runpy.run_path(str(Path(__file__).with_name('capture-atlas-support.py')))
g, b, cpu, read, write, call, draws, set_clock = (a[key] for key in ['graphics', 'base', 'cpu', 'read', 'write', 'call', 'draws', 'set_clock'])
played = g['played']; PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
for loader in [0x432770, 0x43b6c0, 0x4206e0, 0x404600, 0x43c580, 0x42bd50, 0x41d2a0,
               0x442290, 0x442d60, 0x42a2e0, 0x41f030, 0x404a80, 0x444250, 0x445330,
               0x43dc70, 0x42d5e0, 0x42fc00]: call(loader)
for kind, name in enumerate((b['base']['ROOT'] / 'Changoo (E)/RESOURCE/CHAR.CFG').read_text().split()):
    cpu.mem_write(0x18f2000, name.replace('.raw', '.app').encode() + b'\0')
    write(0x461430 + kind * 4, call(0x4402c0, 0x18f2000))


def stage_output(address, stage):
    if address == 0x43ee50:
        for priority in [2, 6, 7, 8]: write(0x471920 + priority * 4, 0)


reader = runpy.run_path(str(Path(__file__).with_name('capture-map-support.py')))
loads = reader['install_map_reader'](g, stage_output)
actor_specs = [(59, 0x78ebb4, 0x78eba4, [0x443b50, 0x443b80], 300),
               (41, 0x77c524, 0x77ca00, [0x42b220, 0x42b250], 360),
               (39, 0x4739a4, 0x473ac8, [0x405850], -300),
               (40, 0x78eeb4, 0x78ee24, [0x444f80], -340)]


def actor_values(kind, data):
    large = kind == 59
    fields = {'x': 4, 'y': 8, 'frame': 24 if large else 16, 'ticks': 28 if large else 20,
              'count': 32 if large else 24, 'period': 36 if large else 28, 'oldX': 72 if large else 64,
              'oldY': 76 if large else 68, 'vx': 80 if large else 72, 'vy': 84 if large else 76,
              'state': 88 if large else 80, 'width': 12 if large else 100, 'height': 16 if large else 104}
    result = {key: read(data + offset) for key, offset in fields.items()}
    result['spriteIndex'] = read(read(data + (20 if large else 12)) + result['frame'] * 4)
    return result


def start(x=40720, y=2584, state=0):
    for priority in range(10):
        write(0x1601000 + priority * 64 + 24, 0); write(0x471920 + priority * 4, 1)
    write(0x1601404, 0); write(0x1601504, 0); write(0x461428, 5); write(0x46142c, 5)
    b['player'](x=x, y=y, state=state)
    write(NODE + 4, 0x405cf0); write(NODE + 20, 0x1601200); write(NODE + 24, 0)
    write(0x1601218, NODE); cpu.mem_write(NODE + 1, b'\0')
    for address in [0x46d4b0, 0x46d4b4, 0x46d4b8, 0x46d4bc, 0x46d4e8, 0x46d4ec, 0x46d4d8, 0x46d4f0]: write(address, 0)
    write(0x46d4ac, 1)
    map_data = g['resources']['stage5.map']; width, height = struct.unpack_from('<II', map_data)
    for row in range(height): cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
    cpu.mem_write(0x18f2000, b'block5.app\0'); call(0x4402c0, 0x18f2000)
    write(CAMERA + 4, x - 300); write(CAMERA + 8, y - 280)
    call(0x431050, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x40d4c0)
    call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x4098f0)
    for ctor, code, update, destructor in [(0x430fd0, 3, 0x431000, 0x4310f0), (0x434a20, 2, 0x434a50, 0x434be0)]:
        offset = len(b['allocations']); call(ctor, code, update, destructor, 9); cpu.mem_write(b['allocations'][offset] + 1, b'\0')
    set_clock(1000); played.clear(); g['loaded'].clear(); loads.clear()
    offset = len(b['allocations']); call(0x4378e0, 45, 0x437a80, 0x437ba0, 6)
    node, data = b['allocations'][offset:offset + 2]
    return node, data, {kind: read(pointer) for kind, pointer, *_ in actor_specs}


node, data, actors = start()
scene = {'initialState': read(PLAYER + 92), 'startSounds': list(played), 'canSkip': False, 'end': 2000,
         'timeline': [[1000, None, []]], 'cast': []}
images = list(a['atlases'][read(0x475e64)].values())
indices = [read(read(PLAYER + 24) + i * 4) for i in range(read(PLAYER + 36))]
pose = {'frames': [images[i].removesuffix('.app') for i in indices], 'count': len(indices), 'period': read(PLAYER + 40)}
for kind, _, surface, entries, offset_x in actor_specs:
    actor = actors[kind]; initial = actor_values(kind, actor); states = {}
    for entry in entries:
        call(entry, actor); value = actor_values(kind, actor)
        states[value['state']] = {'frames': [read(read(actor + (20 if kind == 59 else 12)) + i * 4) for i in range(value['count'])],
                                 'period': value['period'], 'vx': -4 if value['state'] == 10 else 0 if value['state'] == 11 else 2}
    body_offset = 40 if kind == 59 else 32
    scene['cast'].append({'kind': kind, 'offsetX': offset_x, 'offsetY': -200, 'initial': initial,
                          'body': [read(actor + body_offset + i * 4) for i in range(4)],
                          'images': list(a['atlases'][read(surface)].values()), 'states': states})

traces = []
for scenario, x, y, state in [('natural', 40720, 2584, 0), ('enter', 40720, 2584, 0), ('hurt', 40720, 2584, 4),
                             ('large-time-jump', 40720, 2584, 0), ('second-marker', 2320, 2616, 0)]:
    node, data, actors = start(x, y, state)
    initial = b['player_values'](); frames = []
    for tick in range(100):
        elapsed = tick * 1000 // 30 if scenario != 'large-time-jump' else tick * 3000
        write(0x46d4ec, int(scenario == 'enter' and tick == 9)); set_clock(1000 + elapsed)
        played.clear(); draws.clear()
        try:
            call(0x44d3a0, instruction_limit=20_000_000, timeout=15_000_000)
        except Exception:
            print('Ending failed:', scenario, tick, hex(cpu.reg_read(UC_X86_REG_EIP)), read(0x461428), b['player_values'](), flush=True)
            raise
        transitioned = read(0x461428) == 6
        frame = {'elapsed': elapsed, 'enter': scenario == 'enter' and tick == 9,
                 'player': b['player_values'](), 'phase': read(data + 4), 'transitioned': transitioned,
                 'cast': {} if transitioned else {kind: actor_values(kind, actor) for kind, actor in actors.items()},
                 'sounds': list(played)}
        if tick % 11 == 0 and not transitioned: frame['draws'] = list(draws)
        frames.append(frame)
        if transitioned: break
    assert transitioned
    assert frames[-1]['player']['lives'] == 8
    assert [item for item in loads if item['function'] == '0x43ee50'] == [{'function': '0x43ee50', 'stage': 6}]
    traces.append({'scenario': scenario, 'previousState': state, 'initial': initial, 'camera': {'x': x - 300, 'y': y - 280}, 'trace': frames, 'loads': list(loads)})
    print(scenario, len(frames), frames[-1]['player'], flush=True)
root = b['base']['ROOT']
(root / 'web/stage6-exit-data.js').write_text('// Original ending112: 0x4378e0/0x437a80 and its four scripted actor routines.\n'
    + 'export const STAGE6_EXIT = ' + json.dumps(scene, separators=(',', ':')) + ';\n'
    + 'export const STAGE6_EXIT_POSE = ' + json.dumps(pose, separators=(',', ':')) + ';\n')
(root / 'test/fixtures/original-stage6-exit.json').write_text(json.dumps({'scene': scene, 'pose': pose, 'traces': traces,
    'scope': 'Actual native scheduler, terrain/body callbacks and 0x427900 map reader. Next stage resources/title/entry creation virtualized with the native pause flags.'}, separators=(',', ':')) + '\n')
