"""Capture map kinds 52/53, their separate counters and the pickup popup."""
import json
from pathlib import Path
import runpy

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, read, write, call, loaded, played = (g[key] for key in ['base', 'cpu', 'read', 'write', 'call', 'loaded', 'played'])
PLAYER, NODE = b['PLAYER'], b['NODE']
cpu.mem_write(0x18f2000, b'BONUS.WAV\0'); call(0x42d4b0, 0, 0x475200, 0x18f2000)
specs = {52: (0x447c80, 0x447d10, 0x447de0, 0x447f00, 74), 53: (0x43e160, 0x43e1f0, 0x43e2c0, 0x43e3e0, 75),
         120: (0x42e8c0, 0x42e950, 0x42ea20, 0x42eb40, 80)}


def create(kind):
    _, ctor, update, destructor, code = specs[kind]
    offset = len(b['allocations']); call(ctor, code, update, destructor, 6, 6500, 1200, kind)
    return b['allocations'][offset:offset + 2]


def values(node, data):
    return {'screenX': read(data + 36), 'screenY': read(data + 40), 'vy': read(data + 56),
            'collected': bool(read(data + 60)), 'removed': cpu.mem_read(node + 1, 1)[0] == 2}


def player():
    return {**b['player_values'](), 'jungleItems': [read(PLAYER + 240), read(PLAYER + 244)], 'bananas': read(PLAYER + 248)}


metadata, contacts, popups = {}, [], []
for kind, (loader, *_) in specs.items():
    loaded.clear(); call(loader); name = loaded[-1]
    node, data = create(kind); b['player'](); played.clear(); call(0x4098f0, NODE, node)
    metadata[kind] = {'name': name, 'width': read(data + 76), 'height': read(data + 80),
                      'body': [read(data + 12 + i * 4) for i in range(4)], 'sounds': list(played)}
    for state in [0, 2, 4, 10, 14, 17]:
        for points in [0, 99]:
            node, data = create(kind); b['player'](x=6500, y=1200, state=state, points=points)
            initial, snapshots = player(), []
            for _ in range(2):
                played.clear(); call(0x4098f0, NODE, node)
                snapshots.append({'player': player(), 'actor': values(node, data), 'sounds': list(played)})
            contacts.append({'kind': kind, 'initial': initial, 'snapshots': snapshots})
    for dog_x, dog_y in [(10, 400), (66, 360)]:
        node, data = create(kind); b['player']()
        write(0x1601630, dog_x); write(0x1601634, dog_y)
        call(0x4098f0, NODE, node); initial = values(node, data); trace = []
        for tick in range(100):
            call(read(node + 4), node); trace.append(values(node, data))
            if trace[-1]['removed']: break
        assert trace[-1]['removed']
        popups.append({'kind': kind, 'initial': initial, 'trace': trace})
    write(0x1601630, 10); write(0x1601634, 400)
    print(kind, metadata[kind], flush=True)

root = b['base']['ROOT']
(root / 'web/jungle-item-data.js').write_text('// Original 0x447c80/0x43e160 loaders and native pickup contacts.\nexport const JUNGLE_ITEMS = ' + json.dumps(metadata, separators=(',', ':')) + ';\n')
(root / 'test/fixtures/original-jungle-items.json').write_text(json.dumps({'metadata': metadata, 'contacts': contacts, 'popups': popups}, separators=(',', ':')) + '\n')
