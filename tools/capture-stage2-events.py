"""Capture normal map dialogue controllers, player poses and native atlas draws."""
import json
from pathlib import Path
import runpy

a = runpy.run_path(str(Path(__file__).with_name('capture-atlas-support.py')))
g, b, cpu, write, read, call, played, draws, set_clock = (a[key] if key in a else a['graphics'][key] for key in
    ['graphics', 'base', 'cpu', 'write', 'read', 'call', 'played', 'draws', 'set_clock'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
specs = {
    70: (0x4416e0, 0x4417a0, 0x4418a0, 0x46fd1c, 0x2e, 12320, [(6320, 0x40ef30), (7320, 0x40ef60), (8320, 0x40ef90)]),
    71: (0x4322b0, 0x432370, 0x4324a0, 0x46d27c, 0x2f, 11320, [(1000, 0x40f280), (5760, 0x40f2b0), (6760, 0x40f2e0), (7760, 0x40f310)]),
    72: (0x422720, 0x4227e0, 0x422860, 0x46111c, 0x30, 2760, []),
    74: (0x446670, 0x446730, 0x4467f0, 0x470c60, 0x2d, 8030, [(4660, 0x40fa10)]),
    85: (0x41d060, 0x41d120, 0x41d210, 0x4602ec, 0x2d, 10330, [(3830, 0x411600), (6120, 0x411630)]),
    107: (0x4400b0, 0x440170, 0x4401f0, 0x46f850, 0x2d, 5400, []),
    108: (0x42f5f0, 0x42f6b0, 0x42f7d0, 0x46cef0, 0x2d, 9890, [(4340, 0x411f70), (5730, 0x411fa0), (8480, 0x411fa0)]),
    109: (0x420f30, 0x420ff0, 0x421070, 0x460d78, 0x2d, 1770, []),
    110: (0x402790, 0x402850, 0x402930, 0x45bbf4, 0x2d, 11420, [(2500, 0x412420), (3750, 0x412450)]),
    111: (0x445810, 0x4458d0, 0x4459c0, 0x47096c, 0x2d, 19570, [(3830, None), (13070, 0x4126c0), (15360, 0x4126f0)]),
    113: (0x41e2c0, 0x41e380, 0x41e430, 0x4605b4, 0x2d, 4850, [(2000, 0x412b70)]),
    115: (0x442ab0, 0x442b70, 0x442bf0, 0x47022c, 0x2d, 3950, []),
}
map_data = g['resources']['stage2.map']
width, height = int.from_bytes(map_data[:4], 'little'), int.from_bytes(map_data[4:8], 'little')
for row in range(height):
    cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
cpu.mem_write(0x18f2000, b'block2.app\0'); call(0x4402c0, 0x18f2000)


def start(kind, hurt_entry=False):
    ctor, update, destructor, guard, code, *_ = specs[kind]
    b['player'](x=6500, y=1336)
    if hurt_entry:
        enemy_node, _ = b['create'](0, 6510, 1336)
        call(0x4098f0, NODE, enemy_node)
    write(NODE + 4, 0x405cf0)
    write(guard, 0); write(0x46d4ec, 0); write(0x46d4bc, 0)
    write(CAMERA + 4, 6300); write(CAMERA + 8, 1050)
    write(0x46d4ac, 0); set_clock(1000)
    g['loaded'].clear(); played.clear()
    offset = len(b['allocations']); call(ctor, code, update, destructor, 6)
    node, data = b['allocations'][offset:offset + 2]
    return node, data


def snapshot(node, data):
    return {'phase': read(data + 4), 'removed': cpu.mem_read(node + 1, 1)[0] == 2,
            'player': b['player_values'](), 'count': read(PLAYER + 36), 'period': read(PLAYER + 40)}


metadata, animations, boundaries, sequences, poses = {}, {}, [], [], []
for kind, (_, update, destructor, _, _, end, steps) in specs.items():
    node, data = start(kind)
    images = list(g['loaded']); start_sounds = list(played)
    initial_state = read(PLAYER + 0x5c)
    transitions = []
    for elapsed in [value for boundary in [*[step[0] for step in steps], end] for value in [boundary, boundary + 1]]:
        played.clear(); set_clock(1000 + elapsed); call(update, node)
        state = snapshot(node, data)
        transitions.append([elapsed, state['phase'], state['player']['state'], list(played)])
        boundaries.append({'kind': kind, 'elapsed': elapsed, 'expected': state, 'sounds': list(played)})
    metadata[kind] = {'initialState': initial_state, 'startSounds': start_sounds, 'end': end,
                      'singleStep': kind in [70, 71],
                      'timeline': [[elapsed, state if dict(steps)[elapsed - 1] else None, sounds]
                                   for elapsed, phase, state, sounds in transitions if elapsed in [s[0] + 1 for s in steps]]}
    for step in metadata[kind]['timeline']: step[0] -= 1
    node, data = start(kind)
    entries = [(initial_state, None), *[(None, entry) for _, entry in steps if entry]]
    for _, entry in entries:
        if entry: call(entry, PLAYER)
        state = read(PLAYER + 0x5c); table = read(PLAYER + 24)
        indices = [read(table + i * 4) for i in range(read(PLAYER + 36))]
        animations[state] = {'frames': [images[index].removesuffix('.app') for index in indices],
                             'count': len(indices), 'period': read(PLAYER + 40)}
        write(0x46d4ac, 1)
        trace = []
        for tick in range(40):
            before = b['player_values'](); draws.clear()
            call(read(NODE + 4), NODE)
            hit = call(0x431130, PLAYER + 44, read(PLAYER + 8), read(PLAYER + 12))
            if hit: call(0x40d4c0, NODE, hit)
            trace.append({'before': before, 'expected': b['player_values'](), 'draws': list(draws)})
        poses.append({'state': state, 'trace': trace})
        write(0x46d4ac, 0)
    for scenario in ['natural', 'skip', 'time-jump', 'hit', 'hurt-entry']:
        node, data = start(kind, scenario == 'hurt-entry')
        trace = []
        for tick in range(600):
            elapsed = tick * 1000 // 30 if scenario != 'time-jump' else tick * 20000
            enter = scenario == 'skip' and tick == 9
            write(0x46d4ec, int(enter)); set_clock(1000 + elapsed); played.clear()
            call(update, node)
            removed = cpu.mem_read(node + 1, 1)[0] == 2
            call(read(NODE + 4), NODE)
            hit = call(0x431130, PLAYER + 44, read(PLAYER + 8), read(PLAYER + 12))
            if hit: call(0x40d4c0, NODE, hit)
            contact = None
            if scenario == 'hit' and tick == 30:
                contact = {'x': read(PLAYER + 8) + 10, 'y': read(PLAYER + 12)}
                enemy_node, _ = b['create'](0, contact['x'], contact['y'])
                call(0x4098f0, NODE, enemy_node)
            if removed: call(destructor, node)
            trace.append({'elapsed': elapsed, 'enter': enter, 'contact': contact, 'expected': snapshot(node, data), 'sounds': list(played)})
            if removed: break
        assert trace[-1]['expected']['removed']
        post_exit = []
        if scenario == 'hurt-entry':
            write(0x46d4bc, 1)
            for tick in range(250):
                call(read(NODE + 4), NODE)
                hit = call(0x431130, PLAYER + 44, read(PLAYER + 8), read(PLAYER + 12))
                if hit: call(0x40d4c0, NODE, hit)
                post_exit.append(snapshot(node, data))
            assert post_exit[-1]['player']['state'] == (1 if kind == 70 else 4)
            assert post_exit[-1]['count'] == (4 if kind == 70 else 1)
        sequences.append({'kind': kind, 'scenario': scenario, 'trace': trace, 'postExit': post_exit})
        print(kind, scenario, len(trace), flush=True)

root = b['base']['ROOT']
(root / 'test/fixtures/original-stage2-events.json').write_text(json.dumps({'metadata': metadata, 'animations': animations, 'boundaries': boundaries, 'poses': poses, 'sequences': sequences}, separators=(',', ':')) + '\n')
(root / 'web/stage2-event-data.js').write_text('// Original normal-map dialogue state, animation and audio data; capture-stage2-events.py.\n'
    + 'export const STAGE2_EVENTS = ' + json.dumps(metadata, separators=(',', ':')) + ';\n'
    + 'export const STAGE2_POSES = ' + json.dumps(animations, separators=(',', ':')) + ';\n')
