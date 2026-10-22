"""Capture the native final movie, moving overlay, credits and menu request."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE

m = runpy.run_path(str(Path(__file__).with_name('capture-minigame-support.py')))
g, b, cpu, read, write, call, draws, set_clock = (m[key] for key in ['graphics', 'base', 'cpu', 'read', 'write', 'call', 'draws', 'set_clock'])
menu_requests = []


def menu(uc, *_):
    menu_requests.append(True); g['return_from'](uc)


cpu.hook_add(UC_HOOK_CODE, menu, begin=0x43f1d0, end=0x43f1d0)


def text(address):
    return bytes(cpu.mem_read(address, 80)).split(b'\0')[0].decode().replace('.raw', '.app')


def movie_values(node, data):
    return {**{key: read(data + offset) for key, offset in [('phase', 16), ('ticks', 20), ('startedAt', 24), ('now', 28), ('floatX', 32), ('floatY', 36)]},
            'removed': cpu.mem_read(node + 1, 1)[0] == 2}


traces, credits = [], []
for strategy in ['natural', 'skip-first', 'skip-overlay', 'large-time-jump']:
    for priority in range(10):
        write(0x1601000 + priority * 64 + 24, 0); write(0x471920 + priority * 4, int(priority not in [2, 6, 7, 8]))
    set_clock(1000); write(0x46d4ac, 1); write(0x46d4e8, 0)
    m['audio_events'].clear(); m['cd_commands'].clear(); g['loaded'].clear()
    offset = len(b['allocations']); call(0x449350, 14, 0x4493e0, 0x449570, 5)
    node, data = b['allocations'][offset:offset + 2]
    # The original allocates a full-size surface for a smaller overlay and copies this asset into it.
    g['surface_names'][read(0x78f8a8)] = text(0x471388)
    if not traces:
        ending = {'sequence': [read(0x4712e8 + i * 4) for i in range(23)],
                  'durations': [read(0x471348 + i * 4) for i in range(9)],
                  'images': [text(0x471230 + i * 20) for i in range(9)], 'background': text(0x45ea34),
                  'overlay': text(0x471388), 'startSounds': list(m['audio_events']), 'startCd': list(m['cd_commands'])}
    initial, frames = movie_values(node, data), []
    for tick in range(1, 2000):
        now = 1000 + tick * (10000 if strategy == 'large-time-jump' else 1000) // (1 if strategy == 'large-time-jump' else 30)
        skip = strategy == 'skip-first' or strategy == 'skip-overlay' and read(data + 16) >= 8
        set_clock(now); write(0x46d4e8, int(skip)); draws.clear(); m['audio_events'].clear(); m['cd_commands'].clear()
        call(0x4493e0, node)
        frames.append({'now': now, 'skip': skip, 'expected': movie_values(node, data), 'draws': list(draws),
                       'sounds': list(m['audio_events']), 'cd': list(m['cd_commands'])})
        if frames[-1]['expected']['removed']: break
    assert frames[-1]['expected']['removed']
    credit_node, credit_data = b['allocations'][-2:]
    assert read(credit_node + 4) == 0x441450
    if not traces: ending['credits'] = [g['surface_names'][read(pointer)] for pointer in [0x78e078, 0x78e07c, 0x78e074]]
    call(0x449570, node)
    traces.append({'strategy': strategy, 'initial': initial, 'trace': frames})
    print('movie', strategy, len(frames), flush=True)
    if strategy != 'natural': continue
    menu_requests.clear()
    for tick in range(4001):
        now = 100000 + tick * 1000 // 30
        set_clock(now); write(0x46d4e8, int(tick % 2 == 0)); draws.clear(); m['audio_events'].clear(); m['cd_commands'].clear()
        call(0x441450, credit_node)
        row = {'now': now, 'skip': tick % 2 == 0, 'ticks': read(credit_data + 16), 'finished': cpu.mem_read(credit_node + 1, 1)[0] == 2,
               'menuRequests': len(menu_requests), 'draws': list(draws), 'sounds': list(m['audio_events']), 'cd': list(m['cd_commands'])}
        credits.append(row)
        if row['finished']: break
    assert len(credits) == 4001 and credits[-1]['menuRequests'] == 1
    call(0x441540, credit_node)
root = b['base']['ROOT']
(root / 'web/ending-data.js').write_text('// Original final movie 0x449350/0x4493e0 and credits 0x4413e0/0x441450.\nexport const ENDING = ' + json.dumps(ending, separators=(',', ':')) + ';\n')
(root / 'test/fixtures/original-ending.json').write_text(json.dumps({'ending': ending, 'movies': traces, 'credits': credits,
    'scope': 'Native movie, overlay drawing and 4001 credits ticks; next-menu constructor is observed but not executed.'}, separators=(',', ':')) + '\n')
print(ending, flush=True)
