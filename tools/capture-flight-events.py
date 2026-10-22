"""Capture shooting map dialogues 76/77 with native script motion and return to flight."""
import json
from pathlib import Path
import runpy

a = runpy.run_path(str(Path(__file__).with_name('capture-atlas-support.py')))
g, b, cpu, write, read, call, draws, set_clock = (a[key] for key in ['graphics', 'base', 'cpu', 'write', 'read', 'call', 'draws', 'set_clock'])
played = g['played']; PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
specs = {
    76: (0x42ec80, 0x42ed40, 0x42eec0, 0x46cca0, 19860,
         [(3100, 0x40ffe0), (4100, 0x410010), (6510, 0x410040), (7510, 0x410070), (13360, 0x4100a0), (14360, 0x4100d0), (14860, 0x410100)], 0x476218),
    77: (0x4201b0, 0x420260, 0x420320, 0x460cb4, 6810, [(1810, 0x410340)], 0x4762a0),
}


def start(kind, state=18):
    ctor, update, destructor, guard, *_ = specs[kind]
    b['player'](x=60, y=40)
    call(0x40daa0 if state == 18 else 0x40dad0, PLAYER)
    write(NODE + 4, 0x406ff0); write(0x46d4ac, 0)
    for address in [0x46d4b0, 0x46d4b4, 0x46d4b8, 0x46d4bc, 0x46d4e8, 0x46d4ec, 0x46d4d8, 0x46d4f0, 0x461754, guard]: write(address, 0)
    write(CAMERA + 4, 0); write(CAMERA + 8, 0); write(CAMERA + 68, 1400); write(CAMERA + 72, 20)
    set_clock(1000); played.clear()
    offset = len(b['allocations']); call(ctor, 0x2d, update, destructor, 6)
    return b['allocations'][offset:offset + 2]


def values(node, data):
    return {'phase': read(data + 4), 'removed': cpu.mem_read(node + 1, 1)[0] == 2,
            'player': b['player_values'](), 'count': read(PLAYER + 36), 'period': read(PLAYER + 40),
            'stopped': bool(read(0x461754))}


metadata, poses, sequences, animations = {}, [], [], {}
for kind, (_, update, destructor, _, end, steps, surface) in specs.items():
    node, data = start(kind)
    images = list(a['atlases'][read(surface)].values())
    metadata[kind] = {'initialState': read(PLAYER + 92), 'startSounds': list(played), 'end': end,
                      'singleStep': False, 'canSkip': True, 'timeline': []}
    for elapsed, _ in steps:
        played.clear(); set_clock(1001 + elapsed); call(update, node)
        metadata[kind]['timeline'].append([elapsed, read(PLAYER + 92), list(played)])
    node, data = start(kind)
    for setter in [None, *[entry for _, entry in steps]]:
        if setter: call(setter, PLAYER)
        state = read(PLAYER + 92)
        indices = [read(read(PLAYER + 24) + i * 4) for i in range(read(PLAYER + 36))]
        animation = {'frames': [images[index].removesuffix('.app') for index in indices], 'count': len(indices), 'period': read(PLAYER + 40)}
        animations[state] = animation
        write(0x46d4ac, 1); trace = []
        for tick in range(60):
            before = b['player_values'](); draws.clear(); call(read(NODE + 4), NODE)
            after = b['player_values']()
            if tick == 0: animation['velocity'] = [after['vx'], after['vy']]
            trace.append({'before': before, 'expected': after, 'draws': list(draws)})
        poses.append({'state': state, 'trace': trace}); write(0x46d4ac, 0)
    for scenario in ['natural', 'enter', 'time-jump', 'hurt-entry']:
        node, data = start(kind, 19 if scenario == 'hurt-entry' else 18)
        initial = values(node, data); frames = []
        for tick in range(800):
            elapsed = tick * (30000 if scenario == 'time-jump' else 1000) // (1 if scenario == 'time-jump' else 30)
            enter = scenario == 'enter' and tick == 9
            write(0x46d4ec, int(enter)); set_clock(1000 + elapsed); played.clear()
            call(update, node); call(read(NODE + 4), NODE)
            removed = cpu.mem_read(node + 1, 1)[0] == 2
            if removed: call(destructor, node)
            frames.append({'elapsed': elapsed, 'enter': enter, 'expected': values(node, data), 'sounds': list(played)})
            if removed: break
        assert removed
        sequences.append({'kind': kind, 'scenario': scenario, 'initial': initial, 'trace': frames})
        print(kind, scenario, len(frames), flush=True)

root = b['base']['ROOT']
(root / 'test/fixtures/original-flight-events.json').write_text(json.dumps({'metadata': metadata, 'animations': animations, 'poses': poses, 'sequences': sequences}, separators=(',', ':')) + '\n')
(root / 'web/flight-event-data.js').write_text('// Original shooting dialogues 0x42ec80/0x4201b0 and script poses.\n'
    + 'export const FLIGHT_EVENTS = ' + json.dumps(metadata, separators=(',', ':')) + ';\n'
    + 'export const FLIGHT_POSES = ' + json.dumps(animations, separators=(',', ':')) + ';\n')
