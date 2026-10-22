"""Run original stage-entry and stage-exit cutscenes, including native atlas packing and draw commands."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE

atlas = runpy.run_path(str(Path(__file__).with_name('capture-atlas-support.py')))
graphics, base, cpu, write, read, call, audio_names, draws, sounds, set_clock = (atlas[key] for key in
    ['graphics', 'base', 'cpu', 'write', 'read', 'call', 'audio_names', 'draws', 'sounds', 'set_clock'])

# Observe exit-scene stage requests without loading the next scene or clearing the fixture actors.
for address in [0x44d440, 0x4321f0, 0x427900]:
    cpu.hook_add(UC_HOOK_CODE, lambda uc, *_: graphics['return_from'](uc), begin=address, end=address)

specs = [
    (1, 0x43fdf0, 0x43fe50, 0x440000, 0x46f6c8, 41, 0x46f770, 23, 0x46f4f8,
     [(4, 0x77ff84), (12, 0x77fd50), (13, 0x77fcec), (17, 0x77ff80), (29, 0x77fce8), (33, 0x77ff8c)]),
    (2, 0x41ed80, 0x41ede0, 0x41efa0, 0x4608b0, 78, 0x4609e8, 29, 0x460668,
     [(19, 0x478150), (27, 0x478150), (47, 0x477e14), (51, 0x478158), (53, 0x477e10), (77, 0x477e90)]),
    (3, 0x413de0, 0x413e40, 0x413f90, 0x45e9a0, 16, 0x45e9e0, 10, 0x45e8d8,
     [(0, 0x476758), (6, 0x476760)]),
    (4, 0x435b80, 0x435be0, 0x435d10, 0x46de68, 12, 0x46de98, 3, 0x46de28, [(0, 0x77e038)]),
    (5, 0x434740, 0x4347a0, 0x434910, 0x46d8e0, 46, 0x46d998, 21, 0x46d738,
     [(0, 0x77def8), (18, 0x77df00), (34, 0x77dc98), (40, 0x77dcf8)]),
    (6, 0x43dfa0, 0x43e010, 0x43e110, 0x46f1e0, 20, 0x46f230, 20, 0x46f050, []),
    (7, 0x429990, 0x4299f0, 0x429b40, 0x461f70, 23, 0x461fd0, 7, 0x461ee0,
     [(0, 0x77c400), (17, 0x77c3d8)]),
    ('boosterExit', 0x421680, 0x4216e0, 0x421900, 0x460f00, 19, 0x460f50, 9, 0x460e48, [(0, 0x4786ec)]),
    ('stage2Exit', 0x43e610, 0x43e670, 0x43e8c0, 0x46f350, 36, 0x46f3e0, 6, 0x46f2d8,
     [(0, 0x77fc44), (6, 0x77fbac), (24, 0x77fc40)]),
]


def text(pointer):
    return bytes(cpu.mem_read(pointer, 80)).split(b'\0')[0].decode().replace('.raw', '.app')


def snapshot(node, data):
    return {**{key: read(data + offset) for key, offset in [('phase', 16), ('ticks', 20), ('startedAt', 24), ('now', 28)]},
            'finished': cpu.mem_read(node + 1, 1)[0] == 2}


entries, traces = {}, []
for stage, ctor, update, destructor, table, count, durations, image_count, image_names, cues in specs:
    for strategy in ['natural', 'skip-first', 'skip-middle', 'large-time-jumps', *(['skip-final-boundary'] if isinstance(stage, str) else [])]:
        set_clock(1000)
        write(0x461428, 1)
        for priority in [2, 6, 7, 8]:
            write(0x471920 + priority * 4, 0)
        write(0x46d4ac, 1)
        write(0x46d4e8, 0)
        draws.clear()
        if not isinstance(stage, str): call(0x4337b0, stage - 1)
        title = list(draws)
        offset = len(base['allocations'])
        call(ctor, 0xe, update, destructor, 5)
        node, data = base['allocations'][offset:offset + 2]
        if strategy == 'skip-final-boundary':
            write(data + 16, count - 1); write(data + 24, 1)
        entry = {'sequence': [read(table + i * 4) for i in range(count)],
                 'durations': [read(durations + i * 4) for i in range(image_count)],
                 'images': [text(image_names + i * 20) for i in range(image_count)],
                 'background': text(0x45ea34), 'title': title,
                 'cues': {str(phase): audio_names[read(pointer)] for phase, pointer in cues}}
        entries[stage] = entry
        if stage == 6: entry['clockAtCreation'] = True
        if isinstance(stage, str): entry.update(cueTicks={'0': 1}, changesStage=True)
        if stage == 'boosterExit': entry['returnOnSkip'] = True
        initial = snapshot(node, data)
        trace = []
        for tick in range(1, 10000):
            now = 1000 + tick * (10000 if strategy == 'large-time-jumps' else 1000) // (1 if strategy == 'large-time-jumps' else 30)
            skip = strategy in ['skip-first', 'skip-final-boundary'] or (strategy == 'skip-middle' and read(data + 16) >= count // 2)
            write(0x46d4e8, int(skip)); set_clock(now)
            draws.clear(); sounds.clear()
            call(update, node)
            state = snapshot(node, data)
            if isinstance(stage, str): state['transitions'] = read(0x461428) - 1
            assert all(command['name'] for command in draws)
            trace.append({'now': now, 'skip': skip, 'state': state, 'draws': list(draws), 'sounds': list(sounds)})
            if state['finished']:
                assert all(read(0x471920 + priority * 4) == 1 for priority in [2, 6, 7, 8])
                break
        assert trace[-1]['state']['finished']
        if strategy == 'skip-final-boundary': assert trace[-1]['state']['transitions'] == (2 if stage == 'stage2Exit' else 1)
        call(destructor, node)
        traces.append({'stage': stage, 'strategy': strategy, 'initial': initial, 'trace': trace})
        print(stage, strategy, len(trace), flush=True)

coupled = []
for spec in specs:
    stage, ctor, update, destructor = spec[:4]
    if stage not in [1, 2]: continue
    for priority in range(10):
        write(0x1601000 + priority * 64 + 24, 0)
        write(0x471920 + priority * 4, int(priority not in [2, 6, 7, 8]))
    write(0x1601404, 0); write(0x1601504, 0)
    player, player_node = base['PLAYER'], base['NODE']
    base['player'](x=0, y=0)
    write(player + 0x100, 0)
    write(player_node + 4, 0x405cf0); write(player_node + 8, 0x407760)
    write(player_node + 20, 0x1601200); write(player_node + 24, 0)
    write(0x1601218, player_node); cpu.mem_write(player_node + 1, b'\0')
    call(0x434b40, player_node, player + 0x2c, player + 8, player + 12, 0x4098f0)
    call(0x431050, player_node, player + 0x2c, player + 8, player + 12, 0x40d4c0)
    for ctor_manager, kind, tick_manager, exit_manager in [(0x430fd0, 3, 0x431000, 0x4310f0), (0x434a20, 2, 0x434a50, 0x434be0)]:
        offset = len(base['allocations'])
        call(ctor_manager, kind, tick_manager, exit_manager, 9)
        cpu.mem_write(base['allocations'][offset] + 1, b'\0')
    offset = len(base['allocations']); call(ctor, 0xe, update, destructor, 5)
    node, data = base['allocations'][offset:offset + 2]
    cpu.mem_write(node + 1, b'\0')
    write(0x46d4ac, 0)
    map_data = graphics['resources'][f'stage{stage}.map']
    width = int.from_bytes(map_data[:4], 'little'); height = int.from_bytes(map_data[4:8], 'little')
    for row in range(height):
        cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
    cpu.mem_write(0x18f2000, f'block{stage}.app\0'.encode()); call(0x4402c0, 0x18f2000)
    trace, finished = [], False
    for tick in range(1, 1152 if stage == 1 else 201):
        now = 1000 + tick * 1000 // 30
        skip = stage == 2 and tick == 1
        for address in [0x46d4b0, 0x46d4b8, 0x46d4bc, 0x46d4ec]:
            write(address, 0)
        write(0x46d4bc, 1)
        write(0x46d4e8, int(skip)); set_clock(now)
        call(0x44d3a0)
        finished = finished or cpu.mem_read(node + 1, 1)[0] == 2
        trace.append({'now': now, 'skip': skip, 'right': True, 'finished': finished,
                      'player': {**base['player_values'](), 'moveEnabled': bool(read(player + 0x100))}})
    assert finished and trace[-1]['player']['y'] > 1000
    coupled.append({'stage': stage, 'camera': {'x': read(base['CAMERA'] + 4), 'y': read(base['CAMERA'] + 8)}, 'trace': trace})
    print(stage, 'coupled player/scheduler', len(trace), flush=True)

root = base['base']['ROOT']
(root / 'test/fixtures/original-stage-entry.json').write_text(json.dumps({'entries': entries, 'traces': traces, 'coupled': coupled}, separators=(',', ':')) + '\n')
(root / 'web/stage-entry-data.js').write_text('// SHIN.EXE stage-entry tables and native image/audio loaders. Generated by capture-stage-entry.py.\n'
                                            + 'export const STAGE_ENTRIES = ' + json.dumps(entries, separators=(',', ':')) + ';\n')
