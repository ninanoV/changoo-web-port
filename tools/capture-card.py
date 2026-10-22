"""Capture original memory-card controller, shuffle, drawing, input and return."""
import json
from pathlib import Path
import runpy
import struct

m = runpy.run_path(str(Path(__file__).with_name('capture-minigame-support.py')))
for key in ['base', 'cpu', 'read', 'write', 'call', 'loaded', 'surfaces', 'audio_names', 'palettes',
            'audio_events', 'cd_commands', 'draws', 'set_clock', 'get_save_data']:
    globals()[key] = m[key]
fields = {'cursor': 0x4602a0, 'firstOpen': 0x4602a4, 'secondOpen': 0x4602a8, 'judging': 0x4602ac,
          'canInput': 0x4602b0, 'preview': 0x4602b4, 'now': 0x4602b8, 'judgeAt': 0x4602bc,
          'previewAt': 0x4602c0, 'lives': 0x4602c4, 'firstCard': 0x47789c, 'secondCard': 0x4778f8,
          'firstPosition': 0x4778b4, 'secondPosition': 0x4778f4,
          'leftReady': 0x4778a0, 'rightReady': 0x4778b8, 'upReady': 0x4778c0,
          'downReady': 0x477910, 'fireReady': 0x4778b0, 'musicAt': 0x78f788, 'musicNow': 0x78f810}
keys = {'left': 0x46d4b8, 'right': 0x46d4bc, 'up': 0x46d4b0, 'down': 0x46d4b4, 'fire': 0x46d4e8, 'exit': 0x46d4dc}
initial_globals = {address: read(address) for address in fields.values()}
initial_order = [read(0x4601a8 + i * 4) for i in range(18)]


def snapshot(node, data):
    return {**{key: read(address) for key, address in fields.items()}, 'ticks': read(data + 16),
            'order': [read(0x4601a8 + i * 4) for i in range(18)],
            'remaining': [read(0x460160 + i * 4) for i in range(18)],
            'randomSeed': read(0x471d70) & 0xffffffff, 'finished': cpu.mem_read(node + 1, 1)[0] == 2}


def input_for(before, strategy, tick):
    if strategy == 'controls':
        sequence = [{'left': True, 'up': True, 'fire': True}, {}, {'right': True, 'down': True},
                    {'left': True, 'right': True, 'up': True, 'down': True, 'fire': True}, {}, {'fire': True}, {}, {'exit': True}]
        return sequence[(tick // 9) % len(sequence)]
    if tick < 75 or not before['canInput']:
        return {}
    choices = [i for i, value in enumerate(before['remaining']) if value and (not before['firstOpen'] or i != before['firstPosition'])]
    if before['firstOpen']:
        choices = [i for i in choices if (before['order'][i] // 2 == before['firstCard'] // 2) == (strategy != 'lose')]
    target = choices[0]
    cursor = before['cursor']
    for direction, condition in [('down', target // 6 > cursor // 6), ('up', target // 6 < cursor // 6),
                                  ('right', target % 6 > cursor % 6), ('left', target % 6 < cursor % 6)]:
        if condition:
            return {direction: True} if before[direction + 'Ready'] else {}
    return {'fire': True} if before['fireReady'] else {}


traces = []
for strategy, seed in [('win', 1), ('reentry', None), ('lose', 1997), ('controls', 0xffffffff)]:
    if seed is not None:
        for address, value in initial_globals.items(): write(address, value)
        for i in range(18): write(0x4601a8 + i * 4, initial_order[i]); write(0x460160 + i * 4, 1)
        write(0x471d70, seed)
    else:
        seed = read(0x471d70) & 0xffffffff
    for address in keys.values(): write(address, 0)
    for address in [0x471928, 0x471938, 0x47193c, 0x471940]: write(address, 0)
    write(0x46d4ac, 1); write(0x78f75c, 1); write(base['CAMERA'] + 44, 1)
    loaded.clear(); palettes.clear(); draws.clear(); audio_events.clear(); cd_commands.clear()
    offset = len(base['allocations']); call(0x41c810, 43, 0x41c920, 0x41ced0, 5)
    node, data = base['allocations'][offset:offset + 2]
    if not traces:
        assets = {'palette': palettes[-1], 'background': surfaces[read(0x4778a4)],
                  'cards': [surfaces[read(0x4778c8 + i * 4)] for i in range(9)],
                  'back': surfaces[read(0x4778f0)], 'cursor': surfaces[read(0x47792c)],
                  'life': surfaces[read(0x4778bc)], 'correct': audio_names[read(0x477928)], 'incorrect': audio_names[read(0x477900)],
                  'positions': [[read(0x4601f0 + i * 8), read(0x4601f4 + i * 8)] for i in range(18)],
                  'lifePositions': [[read(0x460280 + i * 8), read(0x460284 + i * 8)] for i in range(4)]}
        assert all(assets['cards'])
    initial = snapshot(node, data); frames = []
    for tick in range(1, 1001):
        before = snapshot(node, data)
        controls = input_for(before, strategy, tick)
        for key, address in keys.items(): write(address, int(controls.get(key, False)))
        now = (60000 if strategy == 'controls' else 1000) + tick * 1000 // 30
        set_clock(now); draws.clear(); audio_events.clear(); cd_commands.clear()
        call(0x41c920, node)
        expected = snapshot(node, data)
        row = {'now': now, 'input': controls, 'expected': expected, 'sounds': list(audio_events), 'cd': list(cd_commands)}
        if tick % 11 == 0 or tick < 3 or before['remaining'] != expected['remaining'] or before['lives'] != expected['lives']:
            assert all(draw['name'] for draw in draws)
            row['draws'] = list(draws)
        frames.append(row)
        if expected['finished'] or strategy == 'controls' and tick == 160: break
    if strategy != 'controls':
        assert expected['finished'], strategy
        assert read(base['CAMERA'] + 44) == 0
        assert all(read(address) == 1 for address in [0x471928, 0x471938, 0x47193c, 0x471940])
    call(0x41ced0, node); assert palettes[-1] == 'shin.pal'
    unlocks = list(struct.unpack('<5I', get_save_data())); assert unlocks == [0, 1, 0, 0, 0], unlocks
    traces.append({'strategy': strategy, 'seed': seed, 'initial': initial, 'trace': frames, 'unlocks': unlocks})
    print(strategy, len(frames), 'finished', expected['finished'], flush=True)

call(0x414970)
offset = len(base['allocations']); call(0x4149d0, 49, 0x414aa0, 0x414b60, 6, 26894, 3008, 126)
node, data = base['allocations'][offset:offset + 2]
portal = {'kind': 126, 'name': 'gamecard.app', 'body': [read(data + 12 + i * 4) for i in range(4)],
          'width': int.from_bytes(m['resources']['gamecard.app'][:4], 'little'), 'height': int.from_bytes(m['resources']['gamecard.app'][4:8], 'little')}
contacts = []
for state in [0, 4, 10, 14, 17]:
    base['player'](x=26894, y=3008, state=state, points=99)
    before = base['player_values'](); cpu.mem_write(node + 1, b'\0')
    for address in [0x471928, 0x471938, 0x47193c, 0x471940]: write(address, 1)
    offset = len(base['allocations']); call(0x4098f0, base['NODE'], node)
    game_node = base['allocations'][offset]
    assert before == base['player_values']() and read(game_node + 4) == 0x41c920
    assert cpu.mem_read(node + 1, 1)[0] == 2
    assert all(read(address) == 0 for address in [0x471928, 0x471938, 0x47193c, 0x471940])
    contacts.append({'player': before, 'removed': True})
    call(0x41ced0, game_node)
root = base['base']['ROOT']
(root / 'web/card-data.js').write_text('// Extracted from SHIN.EXE card loader 0x41c510 and portal 0x414970.\n'
    + 'export const CARD_ASSETS = ' + json.dumps(assets, separators=(',', ':')) + ';\n'
    + 'export const CARD_PORTAL = ' + json.dumps(portal, separators=(',', ':')) + ';\n')
(root / 'test/fixtures/original-card.json').write_text(json.dumps({'assets': assets, 'portal': portal, 'initialOrder': initial_order, 'traces': traces, 'contacts': contacts,
    'scope': 'Original card controller, shuffle RNG, draw calls and player portal contacts; clock, DirectDraw, CD/audio and game.dat I/O virtualized.'}, separators=(',', ':')) + '\n')
print(assets, portal, flush=True)
