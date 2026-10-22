"""Capture the native eight-puzzle shuffle, key edges, solved delay and portal."""
import heapq
import json
from pathlib import Path
import runpy
import struct

m = runpy.run_path(str(Path(__file__).with_name('capture-minigame-support.py')))
for key in ['base', 'cpu', 'read', 'write', 'call', 'loaded', 'surfaces', 'audio_names', 'palettes',
            'audio_events', 'cd_commands', 'draws', 'set_clock', 'get_save_data']:
    globals()[key] = m[key]
fields = {'blank': 0x4613c4, 'solved': 0x4613c8, 'exitRequested': 0x4613cc, 'canMove': 0x4613d0,
          'shuffleAt': 0x4613d4, 'wonAt': 0x4613d8, 'missingAtSide': 0x4613dc, 'unused': 0x4613e0,
          'upReady': 0x478b44, 'downReady': 0x478b5c, 'leftReady': 0x478b34, 'rightReady': 0x478b3c, 'lastDirection': 0x478b4c}
keys = {'up': 0x46d4b0, 'down': 0x46d4b4, 'left': 0x46d4b8, 'right': 0x46d4bc, 'fire': 0x46d4e8, 'exit': 0x46d4dc}
initial_globals = {address: read(address) for address in fields.values()}
initial_board = [read(0x461378 + i * 4) for i in range(9)]
goal = tuple(read(0x4613a0 + i * 4) for i in range(9))


def snapshot(node, data):
    return {**{key: read(address) for key, address in fields.items()}, 'ticks': read(data + 16),
            'board': [read(0x461378 + i * 4) for i in range(9)], 'randomSeed': read(0x471d70) & 0xffffffff,
            'finished': cpu.mem_read(node + 1, 1)[0] == 2}


def solve(board):
    board = tuple(board)
    def distance(value):
        return sum(abs(i // 3 - tile // 3) + abs(i % 3 - tile % 3) for i, tile in enumerate(value) if tile >= 0)
    queue, costs = [(distance(board), 0, board, [])], {board: 0}
    while queue:
        _, cost, value, path = heapq.heappop(queue)
        if cost != costs[value]: continue
        if value == goal: return path
        blank = value.index(-1)
        for key, target in [('up', blank + 3), ('down', blank - 3), ('left', blank + 1), ('right', blank - 1)]:
            if not 0 <= target < 9 or abs(target - blank) == 1 and target // 3 != blank // 3: continue
            changed = list(value); changed[blank], changed[target] = changed[target], changed[blank]; changed = tuple(changed)
            if cost + 1 >= costs.get(changed, 999): continue
            costs[changed] = cost + 1
            heapq.heappush(queue, (cost + 1 + distance(changed), cost + 1, changed, path + [key]))
    raise AssertionError('Native shuffle produced an unsolvable board')


traces = []
for strategy, seed in [('solve', 1), ('reentry', None), ('held', 1997), ('clock-boundary', 0xffffffff)]:
    if seed is not None:
        for address, value in initial_globals.items(): write(address, value)
        for i, value in enumerate(initial_board): write(0x461378 + i * 4, value)
        write(0x471d70, seed)
    else: seed = read(0x471d70) & 0xffffffff
    for address in keys.values(): write(address, 0)
    for address in [0x471928, 0x471938, 0x47193c, 0x471940]: write(address, 0)
    write(0x46d4ac, 1); write(0x78f75c, 1); write(base['CAMERA'] + 44, 1)
    loaded.clear(); palettes.clear(); draws.clear(); audio_events.clear(); cd_commands.clear()
    offset = len(base['allocations']); call(0x4245a0, 43, 0x4246a0, 0x4249e0, 5)
    node, data = base['allocations'][offset:offset + 2]
    if not traces:
        assets = {'palette': palettes[-1], 'background': surfaces[read(0x478b38)],
                  'pieces': [surfaces[read(0x478b10 + i * 4)] for i in range(9)],
                  'positions': [[read(0x461330 + i * 8), read(0x461334 + i * 8)] for i in range(9)],
                  'moveSound': audio_names[read(0x478b54)], 'winSound': audio_names[read(0x478b58)]}
        assert all(assets['pieces']) and goal == tuple([*range(8), -1])
    initial = snapshot(node, data); frames, solution = [], None
    for tick in range(1, 801):
        before = snapshot(node, data); controls = {}
        if strategy in ['solve', 'reentry'] and before['canMove']:
            if solution is None: solution = solve(before['board'])
            if solution and before[solution[0] + 'Ready']: controls[solution.pop(0)] = True
        elif strategy == 'held':
            sequence = [{'up': True, 'left': True}, {}, {'down': True, 'right': True}, {'up': True, 'down': True, 'left': True, 'right': True}, {}, {'exit': True, 'fire': True}]
            controls = sequence[(tick // 7) % len(sequence)]
        for key, address in keys.items(): write(address, int(controls.get(key, False)))
        if strategy == 'clock-boundary':
            times = [0, 0, 1, 5000, 5001, 5002, 9000, 9001]
            now = times[tick - 1]
        else: now = 1000 + tick * 1000 // 30
        set_clock(now); draws.clear(); audio_events.clear(); cd_commands.clear(); call(0x4246a0, node)
        expected = snapshot(node, data)
        row = {'now': now, 'input': controls, 'expected': expected, 'sounds': list(audio_events), 'cd': list(cd_commands)}
        if tick % 17 == 0 or tick < 3 or before['solved'] != expected['solved'] or expected['finished']:
            assert all(draw['name'] for draw in draws); row['draws'] = list(draws)
        frames.append(row)
        if expected['finished'] or strategy == 'held' and tick == 360 or strategy == 'clock-boundary' and tick == len(times): break
    if strategy in ['solve', 'reentry']:
        assert expected['finished']
        assert read(base['CAMERA'] + 44) == 0
        assert all(read(address) == 1 for address in [0x471928, 0x471938, 0x47193c, 0x471940])
    call(0x4249e0, node); assert palettes[-1] == 'shin.pal'
    unlocks = list(struct.unpack('<5I', get_save_data())); assert unlocks == [0, 0, 0, 0, 1], unlocks
    traces.append({'strategy': strategy, 'seed': seed, 'initial': initial, 'trace': frames, 'unlocks': unlocks})
    print(strategy, len(frames), 'finished', expected['finished'], flush=True)

call(0x43dc70)
offset = len(base['allocations']); call(0x43dcd0, 48, 0x43dda0, 0x43de60, 6, 17760, 2561, 125)
node, data = base['allocations'][offset:offset + 2]
header = m['resources']['gamepuzl.app']
portal = {'kind': 125, 'name': 'gamepuzl.app', 'body': [read(data + 12 + i * 4) for i in range(4)],
          'width': int.from_bytes(header[:4], 'little'), 'height': int.from_bytes(header[4:8], 'little')}
contacts = []
for state in [0, 4, 10, 14, 17]:
    base['player'](x=17760, y=2561, state=state, points=99); before = base['player_values']()
    cpu.mem_write(node + 1, b'\0'); offset = len(base['allocations']); call(0x4098f0, base['NODE'], node)
    game_node = base['allocations'][offset]
    assert before == base['player_values']() and read(game_node + 4) == 0x4246a0
    assert cpu.mem_read(node + 1, 1)[0] == 2
    contacts.append({'player': before, 'removed': True}); call(0x4249e0, game_node)
root = base['base']['ROOT']
(root / 'web/puzzle-data.js').write_text('// Original puzzle125 loader/controller 0x4243f0/0x4246a0 and portal 0x43dc70.\n'
    + 'export const PUZZLE_ASSETS = ' + json.dumps(assets, separators=(',', ':')) + ';\n'
    + 'export const PUZZLE_PORTAL = ' + json.dumps(portal, separators=(',', ':')) + ';\n')
(root / 'test/fixtures/original-puzzle.json').write_text(json.dumps({'assets': assets, 'portal': portal, 'initialBoard': initial_board,
    'initialGlobals': {key: initial_globals[address] for key, address in fields.items()}, 'goal': goal, 'traces': traces, 'contacts': contacts,
    'scope': 'Native shuffle, RNG, direction keys, sound/draw calls, solved delay, game.dat and portal. Clock and graphics/audio transports virtualized.'}, separators=(',', ':')) + '\n')
print(assets, portal, flush=True)
