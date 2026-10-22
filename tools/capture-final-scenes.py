"""Capture final dialogue114 and the unskippable hang116 boss introduction."""
import json
from pathlib import Path
import runpy
import struct
from unicorn.x86_const import UC_X86_REG_EIP

m = runpy.run_path(str(Path(__file__).with_name('capture-minigame-support.py')))
a, g, b, cpu, read, write, call, draws, set_clock = (m[key] for key in ['atlas', 'graphics', 'base', 'cpu', 'read', 'write', 'call', 'draws', 'set_clock'])
played, PLAYER, NODE, CAMERA = g['played'], b['PLAYER'], b['NODE'], b['CAMERA']
for loader in [0x4059c0, 0x432770, 0x43b6c0, 0x42a2e0, 0x442d60, 0x41f030, 0x4140f0, 0x447ff0, 0x446420]: call(loader)
map_data = g['resources']['stage6.map']; width, height = struct.unpack_from('<II', map_data)
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
cpu.mem_write(0x18f2000, b'block6.app\0'); call(0x4402c0, 0x18f2000)
specs = {114: (0x44df10, 0x44e010, 0x44e0f0, 0x471bc0, 4360, [(1950, 0x412dd0)]),
         116: (0x434110, 0x4341d0, 0x434460, 0x46d684, 37690,
               [(3690, 0x413260), (4690, None), (5690, None), (6690, None), (11690, None),
                (16690, 0x413290), (17690, 0x4132c0), (27690, 0x413290)])}
actor_pointers = {34: 0x77dc30, 41: 0x77c524, 59: 0x78ebb4}


def actor_values(kind, data):
    large = kind in [59, 'prop']
    fields = {'x': 4, 'y': 8, 'oldX': 72 if large else 64, 'oldY': 76 if large else 68,
              'vx': 80 if large else 72, 'vy': 84 if large else 76, 'frame': 24 if large else 16,
              'ticks': 28 if large else 20, 'count': 32 if large else 24, 'period': 36 if large else 28,
              'state': 88 if large else 80, 'facing': 104 if large else 96,
              'width': 12 if large else 100, 'height': 16 if large else 104}
    if kind != 'prop': fields['timer'] = 108 if large else 88
    if kind in [41, 59]: fields['health'] = 116 if large else 108
    result = {key: read(data + offset) for key, offset in fields.items()}
    node = read(data + (108 if kind in [34, 'prop'] else 112))
    result['removed'] = cpu.mem_read(node + 1, 1)[0] == 2
    result['spriteIndex'] = read(read(data + (20 if large else 12)) + result['frame'] * 4)
    result['scripted'] = read(node + 4) in [0x4330b0, 0x42ae50, 0x443750]
    return result


def start(kind, hurt=False):
    for priority in range(10):
        write(0x1601000 + priority * 64 + 24, 0); write(0x471920 + priority * 4, 1)
    write(0x1601404, 0); write(0x1601504, 0); write(0x461428, 6); write(0x46142c, 6)
    for address in [*actor_pointers.values(), 0x4782ac, 0x46c500, 0x45c0a8]: write(address, 2 if address in [0x46c500, 0x45c0a8] else 0)
    b['player'](x=44350 if kind == 114 else 18080, y=3000 if kind == 114 else 3032, state=4 if hurt else 0)
    write(NODE + 4, 0x405cf0); write(NODE + 20, 0x1601200); write(NODE + 24, 0)
    write(0x1601218, NODE); cpu.mem_write(NODE + 1, b'\0')
    for address in [0x46d4b0, 0x46d4b4, 0x46d4b8, 0x46d4bc, 0x46d4e8, 0x46d4ec, 0x46d4d8, 0x46d4f0]: write(address, 0)
    write(0x46d4ac, 1); write(specs[kind][3], 0)
    write(CAMERA + 4, read(PLAYER + 8) - 300); write(CAMERA + 8, 2719)
    call(0x431050, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x40d4c0)
    call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x4098f0)
    for ctor, code, update, destructor in [(0x430fd0, 3, 0x431000, 0x4310f0), (0x434a20, 2, 0x434a50, 0x434be0)]:
        offset = len(b['allocations']); call(ctor, code, update, destructor, 9); cpu.mem_write(b['allocations'][offset] + 1, b'\0')
    set_clock(1000); played.clear(); m['cd_commands'].clear(); prior_atlases = set(a['atlases'])
    offset = len(b['allocations']); call(specs[kind][0], 45, specs[kind][1], specs[kind][2], 6)
    node, data = b['allocations'][offset:offset + 2]
    player_surface = next(surface for surface in a['atlases'] if surface not in prior_atlases)
    return node, data, player_surface


def snapshot(node, data):
    actors = {kind: actor_values(kind, read(pointer)) for kind, pointer in actor_pointers.items() if read(pointer)}
    return {'phase': read(data + 4), 'removed': cpu.mem_read(node + 1, 1)[0] == 2,
            'player': b['player_values'](), 'count': read(PLAYER + 36), 'period': read(PLAYER + 40),
            'actors': actors, 'prop': actor_values('prop', read(0x4782ac)) if read(0x4782ac) else None}


scenes, poses = {}, {}
for kind, (_, update, _, _, end, steps) in specs.items():
    node, data, surface = start(kind); images = list(a['atlases'][surface].values())
    scenes[kind] = {'initialState': read(PLAYER + 92), 'startSounds': list(played), 'canSkip': kind == 114,
                    'end': end, 'timeline': [], 'enemies': {}}
    for entry in [None, *dict.fromkeys(entry for _, entry in steps if entry)]:
        if entry: call(entry, PLAYER)
        state = read(PLAYER + 92)
        indices = [read(read(PLAYER + 24) + i * 4) for i in range(read(PLAYER + 36))]
        poses[state] = {'frames': [images[i].removesuffix('.app') for i in indices], 'count': len(indices), 'period': read(PLAYER + 40)}
    node, data, _ = start(kind)
    for boundary, entry in steps:
        set_clock(1001 + boundary); played.clear(); m['cd_commands'].clear(); call(update, node)
        scenes[kind]['timeline'].append([boundary, read(PLAYER + 92) if entry else None, list(played)])
        if m['cd_commands']: scenes[kind].setdefault('cd', {})[boundary] = list(m['cd_commands'])
    entries = [(34, 0x77d950, [0x4331d0], 360)] if kind == 114 else [
        (59, 0x78edd0, [0x443890, 0x4438c0, 0x4438f0, 0x443920], 360),
        (41, 0x77c830, [0x42af90, 0x42afc0, 0x42aff0], 320)]
    for actor_kind, image_pointer, setters, offset_x in entries:
        actor = read(actor_pointers[actor_kind]); states = {}
        for setter in setters:
            call(setter, actor); current = actor_values(actor_kind, actor)
            states[current['state']] = {'frames': [read(read(actor + (20 if actor_kind == 59 else 12)) + i * 4) for i in range(current['count'])],
                                        'period': current['period'], 'vx': -4 if current['state'] == 6 else 0}
        scenes[kind]['enemies'][actor_kind] = {'offsetX': offset_x, 'offsetY': -200, 'initialState': 5 if actor_kind == 34 else 6,
            'images': list(a['atlases'][read(image_pointer)].values()), 'states': states}
    if kind == 116:
        actor = read(0x4782ac); current = actor_values('prop', actor)
        scenes[kind]['prop'] = {'initial': current, 'offsetX': 50, 'offsetY': -500, 'dynamicOld': True,
            'body': [read(actor + 40 + i * 4) for i in range(4)], 'images': list(a['atlases'][read(0x4783a0)].values()),
            'states': {0: {'frames': [read(read(actor + 20) + i * 4) for i in range(current['count'])], 'period': current['period'], 'vx': 0}}}

sequences = []
for kind in specs:
    for scenario in ['natural', 'enter', 'large-time-jump', 'hurt-entry']:
        node, data, _ = start(kind, scenario == 'hurt-entry'); initial = snapshot(node, data); frames = []
        for tick in range(1400):
            elapsed = tick * (50000 if scenario == 'large-time-jump' else 1000) // (1 if scenario == 'large-time-jump' else 30)
            enter = scenario == 'enter' and tick == 9
            set_clock(1000 + elapsed); write(0x46d4ec, int(enter)); played.clear(); draws.clear(); m['cd_commands'].clear()
            try:
                call(0x44d3a0)
            except Exception:
                print('Native scene failure', kind, scenario, tick, hex(cpu.reg_read(UC_X86_REG_EIP)), b['player_values'](), flush=True)
                raise
            expected = snapshot(node, data)
            row = {'elapsed': elapsed, 'enter': enter, 'expected': expected, 'sounds': list(played), 'cd': list(m['cd_commands'])}
            if tick % 41 == 0 and scenario != 'hurt-entry': row['draws'] = list(draws)
            frames.append(row)
            if expected['removed']: break
        assert frames[-1]['expected']['removed']
        sequences.append({'kind': kind, 'scenario': scenario, 'initial': initial, 'trace': frames})
        print(kind, scenario, len(frames), flush=True)
root = b['base']['ROOT']
(root / 'web/final-scene-data.js').write_text('// Original final dialogues114/116 and actor/player animation tables.\n'
    + 'export const FINAL_SCENES = ' + json.dumps(scenes, separators=(',', ':')) + ';\n'
    + 'export const FINAL_POSES = ' + json.dumps(poses, separators=(',', ':')) + ';\n')
(root / 'test/fixtures/original-final-scenes.json').write_text(json.dumps({'scenes': scenes, 'poses': poses, 'sequences': sequences}, separators=(',', ':')) + '\n')
