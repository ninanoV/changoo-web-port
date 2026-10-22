"""Capture original mole controller, packed digit drawing, RNG and portal metadata."""
import json
from pathlib import Path
import runpy
import struct

mini = runpy.run_path(str(Path(__file__).with_name('capture-minigame-support.py')))
for key in ['base', 'cpu', 'write', 'read', 'call', 'loaded', 'draws', 'surfaces', 'audio_names',
            'palettes', 'audio_events', 'cd_commands', 'set_clock', 'get_save_data']:
    globals()[key] = mini[key]

fields = {'leftHeld': 0x77f318, 'rightHeld': 0x77f2d0, 'upHeld': 0x77f694, 'downHeld': 0x77f664,
          'striking': 0x77f46c, 'x': 0x77f338, 'y': 0x77f33c, 'targetX': 0x77f340, 'targetY': 0x77f344,
          'column': 0x77f348, 'row': 0x77f34c, 'frame': 0x77f350, 'score': 0x77f354,
          'remaining': 0x77f358, 'countdown': 0x77f35c, 'musicTicks': 0x77f470, 'interval': 0x77f474,
          'musicAt': 0x78f788, 'musicNow': 0x78f810}
hole_fields = ['x', 'y', 'targetX', 'targetY', 'remaining', 'hit', 'ticks']
keys = {'left': 0x46d4b8, 'right': 0x46d4bc, 'up': 0x46d4b0, 'down': 0x46d4b4,
        'fire': 0x46d4e8, 'exit': 0x46d4dc}
initial_seed = read(0x471d70)
# Decode the native Windows key-down jump table, rather than guessing the exit key.
exit_keys = [key for key in range(13, 121)
             if read(0x433c44 + cpu.mem_read(0x433c84 + key - 13, 1)[0] * 4) == 0x433a98]
assert exit_keys == [117], exit_keys  # VK_F6.


def snapshot(node, data):
    return {**{key: read(address) for key, address in fields.items()}, 'ticks': read(data + 16),
            'randomSeed': read(0x471d70) & 0xffffffff,
            'holes': [{key: read(0x77f368 + i * 28 + j * 4) for j, key in enumerate(hole_fields)} for i in range(9)],
            'finished': cpu.mem_read(node + 1, 1)[0] == 2}


def names(pointer, count, stride=4):
    result = [surfaces[read(pointer + i * stride)] for i in range(count)]
    assert all(result), result
    return result


traces = []
for strategy, seed in [('idle', initial_seed), ('hit', 1997), ('held-keys', 0xffffffff), ('cancel', 7)]:
    for address in [*keys.values(), 0x78f788, 0x78f810, 0x471928, 0x471938, 0x47193c, 0x471940]:
        write(address, 0)
    write(0x471d70, seed); write(0x46d4ac, 1); write(0x78f75c, 1)
    write(base['CAMERA'] + 0x2c, 1)
    loaded.clear(); palettes.clear(); draws.clear(); audio_events.clear(); cd_commands.clear()
    offset = len(base['allocations'])
    call(0x43d120, 0x2b, 0x43d400, 0x43d9c0, 5)
    node, data = base['allocations'][offset:offset + 2]
    if not traces:
        assets = {'palette': palettes[-1], 'moles': names(0x77f310, 2), 'backgrounds': names(0x77f320, 4),
                  'hammer': names(0x77f300, 3), 'timeDigits': loaded[9:19], 'scoreDigits': loaded[19:29],
                  'timeDigitWidth': read(0x77f2f8), 'scoreDigitWidth': read(0x77f464),
                  'hitSound': audio_names[read(0x77f690)],
                  'musicCommand': bytes(cpu.mem_read(0x4602c8, 80)).split(b'\0')[0].decode()}
        assert len(loaded) == 29, loaded
    initial = snapshot(node, data)
    assert initial['remaining'] == 60 and initial['ticks'] == 0
    frames = []
    for tick in range(1, 1201):
        before = snapshot(node, data)
        input_value = {}
        if strategy == 'held-keys':
            # Simultaneous keys, boundaries, release during hammer descent, and moving during impact.
            sequence = [dict(left=True, up=True, fire=True), {}, dict(right=True, down=True),
                        dict(left=True, right=True, up=True, down=True, fire=True), {}, dict(fire=True), {}]
            input_value = sequence[(tick // 7) % len(sequence)]
        elif strategy == 'hit':
            choices = [i for i, hole in enumerate(before['holes']) if hole['remaining'] > 3 and not hole['hit']]
            if choices:
                target = choices[0]
                dx, dy = target % 3 - before['column'], target // 3 - before['row']
                for direction, delta in [('left', -dx), ('right', dx), ('up', -dy), ('down', dy)]:
                    if delta > 0 and not before[direction + 'Held']:
                        input_value[direction] = True
                if dx == 0 and dy == 0 and before['frame'] == 0:
                    input_value['fire'] = True
        elif strategy == 'cancel' and tick == 3:
            input_value['exit'] = True
        for key, address in keys.items():
            write(address, int(input_value.get(key, False)))
        now = 1000 + tick * 1000 // 30 if strategy != 'cancel' else tick * 59001
        set_clock(now); draws.clear(); audio_events.clear(); cd_commands.clear()
        call(0x43d400, node)
        expected = snapshot(node, data)
        row = {'now': now, 'input': input_value, 'expected': expected, 'sounds': list(audio_events), 'cd': list(cd_commands)}
        if tick % 19 == 0 or expected['score'] != before['score'] or tick < 3 or expected['finished']:
            assert all(draw['name'] for draw in draws), draws
            row['draws'] = list(draws)
        frames.append(row)
        if expected['finished']:
            break
    assert frames[-1]['expected']['finished']
    assert read(base['CAMERA'] + 0x2c) == 0
    if strategy == 'hit':
        assert frames[-1]['expected']['score'] > 30
    assert all(read(address) == 1 for address in [0x471928, 0x471938, 0x47193c, 0x471940])
    call(0x43d9c0, node)
    assert palettes[-1] == 'shin.pal'
    unlocks = list(struct.unpack('<5I', get_save_data()))
    assert unlocks == [0, 0, 0, 1, 0]
    traces.append({'strategy': strategy, 'initial': initial, 'trace': frames, 'unlocks': unlocks})
    print(strategy, len(frames), 'score', frames[-1]['expected']['score'], flush=True)

call(0x43aaf0)
portal = {'kind': 87, 'name': surfaces[read(0x77ebc8)], 'width': read(0x77ebc4), 'height': read(0x77ebcc)}
call(0x434c10)
contacts = []
for state in [0, 4, 10, 14, 17]:
    base['player'](x=17864, y=613, state=state, points=99)
    before = base['player_values']()
    offset = len(base['allocations'])
    call(0x43ab50, 0x4c, 0x43ac20, 0x43ace0, 6, 17864, 613, 87)
    node, data = base['allocations'][offset:offset + 2]
    body = [read(data + 12 + i * 4) for i in range(4)]
    for address in [0x471928, 0x471938, 0x47193c, 0x471940]:
        write(address, 1)
    offset = len(base['allocations'])
    call(0x4098f0, base['NODE'], node)
    game_node = base['allocations'][offset]
    after = base['player_values']()
    assert before == after
    assert cpu.mem_read(node + 1, 1)[0] == 2
    assert read(game_node + 4) == 0x43d400
    assert all(read(address) == 0 for address in [0x471928, 0x471938, 0x47193c, 0x471940])
    contacts.append({'before': before, 'after': after, 'body': body, 'removed': True})
    write(keys['exit'], 1); call(0x43d400, game_node); call(0x43d9c0, game_node)
    assert base['player_values']() == before
result = {'assets': assets, 'portal': portal, 'initialSeed': initial_seed, 'exitKey': 'F6', 'traces': traces, 'contacts': contacts,
          'scope': 'Original 0x43d120/0x43d400/0x43d9c0, 0x44f660 RNG and packed digit drawing. Clock, DirectDraw, audio and game.dat I/O virtualized. No score-based win/loss or rewards in this controller.'}
root = base['base']['ROOT']
(root / 'test/fixtures/original-mole.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
(root / 'web/mole-data.js').write_text('// Extracted from native mole loader 0x43ce00 and portal loader 0x43aaf0.\n'
    + 'export const MOLE_ASSETS = ' + json.dumps(assets, separators=(',', ':')) + ';\n'
    + 'export const MOLE_PORTAL = ' + json.dumps(portal, separators=(',', ':')) + ';\n')
