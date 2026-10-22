"""Record original chicken/roach transformations and special movement."""
import json
from pathlib import Path
import runpy

base = runpy.run_path(str(Path(__file__).with_name('capture-objects.py')))
cpu, write, read, call = (base[key] for key in ['cpu', 'write', 'read', 'call'])
PLAYER, NODE, CAMERA = (base[key] for key in ['PLAYER', 'NODE', 'CAMERA'])
entries = {0: 0x40d730, 6: 0x40d830, 7: 0x40d890, 8: 0x40d8c0, 9: 0x40d8f0, 10: 0x40d920,
           11: 0x40d860, 12: 0x40d950, 13: 0x40d980, 14: 0x40d9b0, 15: 0x40d9e0,
           16: 0x40da10, 17: 0x40da70, 94: 0x40da40}
extra = {'jumpHeld': 0x94, 'flapHeld': 0x68, 'flightTicks': 0x6c, 'dashTicks': 0xc4,
         'recoverTicks': 0x104, 'fireHeld': 0xe8, 'onPlatform': 0x64}
booleans = {'jumpHeld', 'flapHeld', 'fireHeld', 'onPlatform'}
exe = base['base']['exe']
sprite_names = [exe[0x45c3e0 - 0x402000 + i * 20:0x45c3e0 - 0x402000 + (i + 1) * 20].split(b'\0')[0].decode().replace('.raw', '.app') for i in range(41)]


def values():
    result = base['player_values']()
    for name, offset in extra.items():
        result[name] = bool(read(PLAYER + offset)) if name in booleans else read(PLAYER + offset)
    index = read(read(PLAYER + 0x18) + read(PLAYER + 0x1c) * 4)
    assert 0 <= index < len(sprite_names)
    result['sprite'] = sprite_names[index]
    return result


def start(state, x=100, y=3032, vy=0):
    base['player'](x=x, y=y)
    call(entries[state], PLAYER)
    write(PLAYER + 0x58, vy)
    for address in [0x46d4b8, 0x46d4bc, 0x46d4b0, 0x46d4e8]:
        write(address, 0)


sequences = [
    ('normal-idle', 0, 3032, 0, [(120, {}), (15, {'jump': True}), (30, {'right': True}), (120, {})]),
    ('chicken-walk-jump', 7, 3032, 0, [(10, {}), (25, {'right': True}), (3, {'right': True, 'jump': True}), (12, {'right': True, 'fire': True}), (8, {'right': True}), (5, {'right': True, 'fire': True}), (70, {})]),
    ('chicken-flap', 10, 2700, -15, [(5, {'fire': True}), (5, {})] * 38),
    ('roach-walk-jump', 12, 3032, 0, [(10, {}), (20, {'right': True}), (4, {'right': True, 'jump': True}), (40, {'left': True, 'fire': True}), (20, {}), (4, {'jump': True}), (60, {})]),
    ('roach-dash', 12, 3032, 0, [(10, {}), (130, {'fire': True}), (30, {})]),
    ('roach-idle', 12, 3032, 0, [(240, {})]),
    ('chicken-wall', 10, 2980, 5, [(60, {'right': True})]),
    ('roach-wall', 14, 2980, 5, [(60, {'right': True})]),
]
traces = []
for name, state, y, vy, segments in sequences:
    start(state, x=1680 if name.endswith('wall') else 100, y=y, vy=vy)
    initial = values()
    trace = []
    for ticks, inputs in segments:
        for _ in range(ticks):
            for key, address in [('left', 0x46d4b8), ('right', 0x46d4bc), ('jump', 0x46d4b0), ('fire', 0x46d4e8)]:
                write(address, int(inputs.get(key, False)))
            write(CAMERA + 8, max(0, read(PLAYER + 12) - 280))
            call(0x405cf0, NODE)
            hit = call(0x431130, PLAYER + 0x2c, read(PLAYER + 8), read(PLAYER + 12))
            if hit:
                call(0x40d4c0, NODE, hit)
            trace.append({'input': inputs, 'expected': values()})
    traces.append({'name': name, 'initial': initial, 'trace': trace})

pickups = []
for kind, ctor, update, code in [(11, 0x401910, 0x4019e0, 0x52), (12, 0x435dd0, 0x435ea0, 0x56)]:
    start(0)
    count = len(base['allocations'])
    call(ctor, code, update, 0, 6, 100, 3032, kind)
    node, data = base['allocations'][count:count + 2]
    call(0x4098f0, NODE, node)
    pickups.append({'kind': kind, 'expected': values(), 'removed': cpu.mem_read(node + 1, 1)[0] == 2})

contacts = []
for state in [7, 10, 12, 14, 17, 94]:
    for kind in [0, 1, 2]:
        for scenario, y, vy in [('side', 3032, 0), ('descending', 2980, 5)]:
            start(state, x=6608, y=y, vy=vy)
            node, data = base['create'](kind)
            initial = values()
            call(0x4098f0, NODE, node)
            contacts.append({'kind': kind, 'scenario': scenario, 'initial': initial, 'expected': values(),
                             'enemyState': read(data + (0x58 if kind == 0 else 0x50))})

result = {'traces': traces, 'pickups': pickups, 'contacts': contacts}
assert all(p['removed'] for p in pickups) and len(contacts) == 36
destination = base['base']['ROOT'] / 'test/fixtures/original-forms.json'
destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(f"Captured {sum(len(t['trace']) for t in traces)} movement ticks, 2 transformations and 36 enemy contacts.")
