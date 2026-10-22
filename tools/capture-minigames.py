"""Capture native racing/flag minigames with virtual graphics and unlock saves."""
import json
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE

mini = runpy.run_path(str(Path(__file__).with_name('capture-minigame-support.py')))
for key in ['base', 'cpu', 'write', 'read', 'call', 'loaded', 'draws', 'surfaces', 'audio_names', 'palettes', 'audio_events', 'cd_commands', 'set_clock', 'get_save_data']:
    globals()[key] = mini[key]
outcome = None

def finish(uc, address, size, _):
    global outcome
    outcome = 'won' if address == 0x401e63 or (address == 0x41c19a and read(0x45ffe0) >= 3) else 'lost'


for address in [0x401e63, 0x40202e, 0x41c19a]:
    cpu.hook_add(UC_HOOK_CODE, finish, begin=address, end=address)

car_fields = dict(zip(['frame', 'lane', 'row', 'stepAt', 'firstAt', 'stepReady', 'canMove', 'exitRequested',
                       'crashed', 'leftHeld', 'rightHeld', 'canCrash', 'crashSoundReady'], range(0x45bb28, 0x45bb5c, 4)))
car_fields.update({'hitAt': 0x47314c, 'musicAt': 0x78f788, 'musicNow': 0x78f810})
flag_fields = dict(zip(['pose', 'inputActive', 'issue', 'commandAt', 'previousNow', 'answerAt', 'awaiting', 'unused',
                        'round', 'roundIntro', 'introAt', 'showIntro', 'lives', 'feedback', 'feedbackAt', 'wrong'], range(0x45ffc0, 0x460000, 4)))
flag_fields['command'] = 0x45f9f0
defaults = {address: read(address) for address in [*car_fields.values(), *flag_fields.values()]}
road = [[read(0x45a228 + (row * 8 + lane) * 4) for lane in range(8)] for row in range(200)]
commands = [[[read(0x45f9f8 + round_index * 480 + row * 16 + field * 4) for field in range(4)] for row in range(30)] for round_index in range(3)]


def names(pointer, count):
    result = [surfaces.get(read(pointer + i * 4)) for i in range(count)]
    assert all(result), result
    return result


def setup(kind):
    global outcome
    outcome = None
    for address, value in defaults.items():
        write(address, value)
    for address in [0x46d4b0, 0x46d4b4, 0x46d4b8, 0x46d4bc]:
        write(address, 0)
    write(0x46d4ac, 1)  # Flag inputActive is cleared inside the original rendering branch.
    write(0x78f75c, 1)
    for address in [0x471928, 0x471938, 0x47193c, 0x471940]:
        write(address, 0)
    loaded.clear(); palettes.clear(); audio_events.clear(); cd_commands.clear(); draws.clear()
    offset = len(base['allocations'])
    ctor, update, destructor = (0x401d10, 0x401de0, 0x4021e0) if kind == 'car' else (0x41ba30, 0x41bb00, 0x41c240)
    call(ctor, 0x2b, update, destructor, 5)
    node, data = base['allocations'][offset:offset + 2]
    return node, data, update, destructor


def snapshot(kind, node, data):
    fields = car_fields if kind == 'car' else flag_fields
    return {**{key: read(address) for key, address in fields.items()}, 'ticks': read(data + 16),
            'finished': cpu.mem_read(node + 1, 1)[0] == 2, 'outcome': outcome}


def reachable(row, lane):
    if road[row + 1][lane]:
        return []
    lo = hi = lane
    while lo > 0 and not road[row + 1][lo - 1]:
        lo -= 1
    while hi < 7 and not road[row + 1][hi + 1]:
        hi += 1
    return list(range(lo, hi + 1))


viable = [[False] * 8 for _ in range(179)]
viable[178] = [not cell for cell in road[179]]
for row in range(177, -1, -1):
    for lane in range(8):
        viable[row][lane] = any(viable[row + 1][n] for n in reachable(row, lane))
assert viable[0][0]

traces, assets = [], {}
for kind in ['car', 'flag']:
    for strategy in (['idle', 'survive', 'finish-boundary'] if kind == 'car' else ['idle', 'win']):
        node, data, update, destructor = setup(kind)
        if strategy == 'finish-boundary':
            write(car_fields['row'], 192)
            write(car_fields['stepAt'], 1)
        if kind == 'car':
            assets[kind] = {'palette': palettes[-1], 'cars': names(0x473140, 2), 'backgrounds': names(0x473130, 2), 'obstacle': names(0x473138, 1)[0]}
        else:
            assets[kind] = {'palette': palettes[-1], 'characters': names(0x4776c8, 5), 'backgrounds': names(0x4776a0, 3),
                            'life': names(0x4776b8, 1)[0], 'feedback': names(0x477688, 2), 'introBackground': names(0x4776e0, 1)[0],
                            'intro': names(0x4776e4, 1)[0], 'lifePositions': [[read(0x45ff98 + i * 8), read(0x45ff9c + i * 8)] for i in range(5)],
                            'voices': [audio_names[read(0x4776f8 + i * 4)] for i in range(60)],
                            'correct': audio_names[read(0x4777f0)], 'incorrect': audio_names[read(0x4776f0)]}
        initial = snapshot(kind, node, data)
        frames = []
        for tick in range(1, 10000):
            state = snapshot(kind, node, data)
            input_value = {}
            if strategy == 'survive' and kind == 'car' and state['row'] < 178:
                row, lane = state['row'], min(7, max(0, state['lane']))
                options = [n for n in reachable(row, lane) if viable[row + 1][n]]
                assert options, (row, lane)
                target = min(options, key=lambda n: abs(n - lane))
                if target < lane and not state['leftHeld']:
                    input_value['left'] = True
                if target > lane and not state['rightHeld']:
                    input_value['right'] = True
            elif strategy == 'win' and kind == 'flag' and state['awaiting'] and not state['roundIntro']:
                expected = commands[0][state['command'] - 1][2]
                if expected != 2:
                    input_value[{0: 'right', 1: 'down', 3: 'up', 4: 'left'}[expected]] = True
            for key, address in [('left', 0x46d4b8), ('right', 0x46d4bc), ('up', 0x46d4b0), ('down', 0x46d4b4)]:
                write(address, int(input_value.get(key, False)))
            now = 1000 + tick * 1000 // 30
            set_clock(now)
            audio_events.clear(); cd_commands.clear(); draws.clear()
            call(update, node)
            expected = snapshot(kind, node, data)
            row = {'now': now, 'input': input_value, 'expected': expected, 'sounds': list(audio_events), 'cd': list(cd_commands)}
            if tick % 31 == 0 or (kind == 'car' and expected['row'] != state['row']) or (kind == 'flag' and expected['command'] != state['command']):
                assert all(draw['name'] for draw in draws), draws
                row['draws'] = list(draws)
            frames.append(row)
            if expected['finished']:
                break
        assert frames[-1]['expected']['finished'], (kind, strategy, frames[-1])
        assert outcome == ('won' if strategy in ['win', 'finish-boundary'] else 'lost'), (kind, strategy, outcome)
        call(destructor, node)
        assert all(read(address) == 1 for address in [0x471928, 0x471938, 0x47193c, 0x471940])
        traces.append({'kind': kind, 'strategy': strategy, 'initial': initial, 'trace': frames, 'unlocks': list(struct.unpack('<5I', get_save_data()))})
        print(kind, strategy, len(frames), outcome, flush=True)

result = {'assets': assets, 'road': road, 'commands': commands, 'traces': traces,
          'carFinishLimit': 'Rows 180-199 block all lanes, so ordinary input cannot reach the row>192 finish branch. finish-boundary starts at row 192 only to test that native branch.',
          'scope': 'native constructors/controllers/destructors with rendered branch enabled; graphics output, palette application, clock, CD audio and game.dat I/O virtualized'}
destination = base['base']['ROOT'] / 'test/fixtures/original-minigames.json'
destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
runtime = base['base']['ROOT'] / 'web/minigame-data.js'
runtime.write_text('// Extracted from SHIN.EXE: road 0x45a228; flag commands 0x45f9f8 and native asset loaders.\n'
                   + 'export const CAR_ROAD = ' + json.dumps(road, separators=(',', ':')) + ';\n'
                   + 'export const FLAG_COMMANDS = ' + json.dumps(commands, separators=(',', ':')) + ';\n'
                   + 'export const MINIGAME_ASSETS = ' + json.dumps(assets, separators=(',', ':')) + ';\n')
print('Captured native win/loss paths and exported the original game tables.')
