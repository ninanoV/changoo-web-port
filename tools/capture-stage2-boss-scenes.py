"""Run the second boss introduction and defeat dialogue with their native actor callbacks."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE

a = runpy.run_path(str(Path(__file__).with_name('capture-atlas-support.py')))
g, b, cpu, write, read, call, draws, set_clock = (a[key] for key in ['graphics', 'base', 'cpu', 'write', 'read', 'call', 'draws', 'set_clock'])
played = g['played']; PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
suppress_intro, exit_requested = False, False


def story_hook(uc, address, size, _):
    global exit_requested
    if address == 0x43e610:
        exit_requested = True
        g['return_from'](uc)
    elif suppress_intro:
        g['return_from'](uc)


for address in [0x404320, 0x43e610]: cpu.hook_add(UC_HOOK_CODE, story_hook, begin=address, end=address)
call(0x437d10)
map_data = g['resources']['stage2.map']
width, height = int.from_bytes(map_data[:4], 'little'), int.from_bytes(map_data[4:8], 'little')
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
cpu.mem_write(0x18f2000, b'block2.app\0'); call(0x4402c0, 0x18f2000)
specs = {
    'boss2Intro': (0x404320, 0x4043f0, 0x404480, 0x45c044, 0x31, 6190, [(3180, 0x40f780)], 0x473d44),
    'boss2Death': (0x43c140, 0x43c200, 0x43c310, 0x46e908, 0x2d, 6400,
                   [(1000, 0x40fc80), (2000, 0x40fcb0), (3000, 0x40fce0), (4000, 0x40fd10)], 0x47624c),
}


def start(kind):
    global suppress_intro, exit_requested
    ctor, update, destructor, guard, code, *_ = specs[kind]
    exit_requested = False; suppress_intro = True
    b['player'](x=22800, y=3032)
    write(NODE + 4, 0x405cf0); write(0x46d4ec, 0); write(0x46d4ac, 0)
    write(CAMERA + 4, 22500); write(CAMERA + 8, 2719)
    for priority in [2, 6, 7, 8]: write(0x471920 + priority * 4, 1)
    set_clock(1000)
    offset = len(b['allocations']); call(0x437ef0, 0x73, 0x438020, 0x438390, 6, 23018, 2912, 32)
    boss_node, boss = b['allocations'][offset:offset + 2]
    suppress_intro = False; write(guard, 0); played.clear()
    offset = len(b['allocations']); call(ctor, code, update, destructor, 6)
    node, data = b['allocations'][offset:offset + 2]
    return node, data, boss_node, boss


def boss_values(boss_node, boss):
    fields = {'x': 4, 'y': 8, 'frame': 16, 'ticks': 20, 'count': 24, 'period': 28, 'oldX': 64, 'oldY': 68,
              'vx': 72, 'vy': 76, 'state': 80, 'timer': 88, 'previousState': 92, 'facing': 96, 'width': 100, 'height': 104, 'health': 108}
    result = {key: read(boss + offset) for key, offset in fields.items()}
    result['spriteIndex'] = read(read(boss + 12) + result['frame'] * 4)
    result['scripted'] = read(boss_node + 4) == 0x438790
    return result


def snapshot(kind, node, data, boss_node, boss):
    return {'phase': read(data + 4), 'removed': cpu.mem_read(node + 1, 1)[0] == 2,
            'player': b['player_values'](), 'count': read(PLAYER + 36), 'period': read(PLAYER + 40),
            'boss': boss_values(boss_node, boss) if kind == 'boss2Intro' else None, 'exitRequested': exit_requested}


metadata, animations, sequences, poses = {}, {}, [], []
for kind, (_, update, destructor, _, _, end, steps, surface_pointer) in specs.items():
    node, data, boss_node, boss = start(kind)
    initial_state = read(PLAYER + 92)
    player_images = list(a['atlases'][read(surface_pointer)].values())
    metadata[kind] = {'initialState': initial_state, 'startSounds': list(played), 'end': end, 'singleStep': False,
                      'canSkip': kind != 'boss2Intro', 'exitMovie': kind == 'boss2Death', 'timeline': []}
    if kind == 'boss2Intro':
        talk = {'images': list(a['atlases'][read(0x77e704)].values()), 'states': {}}
        for entry in [0x4388b0, 0x4388e0]:
            call(entry, boss)
            talk['states'][read(boss + 80)] = {'frames': [read(read(boss + 12) + i * 4) for i in range(read(boss + 24))], 'period': read(boss + 28)}
        metadata[kind]['enemy'] = talk
    node, data, boss_node, boss = start(kind)
    for elapsed, _ in steps:
        played.clear(); set_clock(1001 + elapsed); call(update, node)
        metadata[kind]['timeline'].append([elapsed, read(PLAYER + 92), list(played), read(boss + 80) if kind == 'boss2Intro' else None])
    node, data, boss_node, boss = start(kind)
    for entry in [None, *[entry for _, entry in steps]]:
        if entry: call(entry, PLAYER)
        state = read(PLAYER + 92)
        indices = [read(read(PLAYER + 24) + i * 4) for i in range(read(PLAYER + 36))]
        animations[state] = {'frames': [player_images[index].removesuffix('.app') for index in indices], 'count': len(indices), 'period': read(PLAYER + 40)}
        write(0x46d4ac, 1); trace = []
        for tick in range(40):
            before = b['player_values'](); draws.clear(); call(read(NODE + 4), NODE)
            hit = call(0x431130, PLAYER + 44, read(PLAYER + 8), read(PLAYER + 12))
            if hit: call(0x40d4c0, NODE, hit)
            trace.append({'before': before, 'expected': b['player_values'](), 'draws': list(draws)})
        poses.append({'state': state, 'trace': trace}); write(0x46d4ac, 0)
    for scenario in ['natural', 'enter', 'time-jump']:
        node, data, boss_node, boss = start(kind)
        initial = snapshot(kind, node, data, boss_node, boss); frames = []
        for tick in range(500):
            elapsed = tick * (20000 if scenario == 'time-jump' else 1000) // (1 if scenario == 'time-jump' else 30)
            enter = scenario == 'enter' and tick == 9
            write(0x46d4ec, int(enter)); set_clock(1000 + elapsed); played.clear()
            if kind == 'boss2Intro': call(read(boss_node + 4), boss_node)
            call(update, node)
            if not exit_requested: call(read(NODE + 4), NODE)
            hit = call(0x431130, PLAYER + 44, read(PLAYER + 8), read(PLAYER + 12))
            if hit: call(0x40d4c0, NODE, hit)
            if kind == 'boss2Intro':
                hit = call(0x431130, boss + 32, read(boss + 4), read(boss + 8))
                if hit: call(0x438470, boss_node, hit)
            removed = cpu.mem_read(node + 1, 1)[0] == 2
            if removed: call(destructor, node)
            frames.append({'elapsed': elapsed, 'enter': enter, 'expected': snapshot(kind, node, data, boss_node, boss), 'sounds': list(played)})
            if removed: break
        assert removed
        sequences.append({'kind': kind, 'scenario': scenario, 'initial': initial, 'trace': frames})
        print(kind, scenario, len(frames), flush=True)

root = b['base']['ROOT']
(root / 'test/fixtures/original-stage2-boss-scenes.json').write_text(json.dumps({'metadata': metadata, 'animations': animations, 'sequences': sequences, 'poses': poses}, separators=(',', ':')) + '\n')
(root / 'web/stage2-boss-scene-data.js').write_text('// Original stage-two boss dialogue and poses, extracted by capture-stage2-boss-scenes.py.\n'
    + 'export const BOSS2_SCENES = ' + json.dumps(metadata, separators=(',', ':')) + ';\n'
    + 'export const BOSS2_POSES = ' + json.dumps(animations, separators=(',', ':')) + ';\n')
