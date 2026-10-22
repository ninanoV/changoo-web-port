"""Capture the original stage3.map booster controls, attack poses and terrain resolution."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, write, read, call = (g[key] for key in ['base', 'cpu', 'write', 'read', 'call'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
shots = []
call(0x44afe0)


def emit(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    shots.append({'type': 35, 'x': read(sp + 20), 'y': read(sp + 24), 'vx': read(sp + 28), 'vy': 0})


cpu.hook_add(UC_HOOK_CODE, emit, begin=0x44b040, end=0x44b040)
animations = {}
for state, address in [(26, 0x40db10), (27, 0x40db40), (28, 0x40db80)]:
    b['player'](); call(address, PLAYER)
    indices = [read(read(PLAYER + 24) + i * 4) for i in range(read(PLAYER + 36))]
    animations[state] = {'frames': [bytes(cpu.mem_read(0x45c3e0 + i * 20, 20)).split(b'\0')[0].decode().replace('.raw', '') for i in indices],
                         'count': read(PLAYER + 36), 'period': read(PLAYER + 40)}


def values():
    return {**b['player_values'](), 'fireHeld': bool(read(PLAYER + 0xe8)), 'boostReady': bool(read(PLAYER + 0x90)),
            'oldX': read(PLAYER + 76), 'oldY': read(PLAYER + 80)}


data = g['resources']['stage3.map']
width, height = int.from_bytes(data[:4], 'little'), int.from_bytes(data[4:8], 'little')
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, data[8 + row * width * 10:8 + (row + 1) * width * 10])
cpu.mem_write(0x18f2000, b'block3.app\0'); call(0x4402c0, 0x18f2000)
traces = []
for scenario in ['controls', 'hurt', 'terrain']:
    b['player'](x=100 if scenario != 'terrain' else 1000, y=100 if scenario != 'terrain' else 600)
    contact = call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x4098f0)
    write(PLAYER + 60, contact)
    write(CAMERA + 68, width); write(CAMERA + 72, height)
    write(CAMERA + 4, 0); write(CAMERA + 8, 0)
    call(0x40dc40, PLAYER)
    for address in [0x46d4d8, 0x46d4f0]: write(address, 0)
    initial = values(); trace = []
    sequence = [(30, {}), (50, {'right': True, 'down': True}), (60, {'left': True, 'up': True}), (40, {}),
                (25, {'fire': True}), (10, {}), (20, {'left': True, 'fire': True}), (40, {'up': True, 'down': True, 'left': True, 'right': True}),
                (30, {'down': True}), (40, {})]
    for count, inputs in sequence:
        for _ in range(count):
            hurt = scenario == 'hurt' and len(trace) in [70, 240]
            if hurt: call(0x40db40, PLAYER)
            for key, address in [('up', 0x46d4b0), ('down', 0x46d4b4), ('left', 0x46d4b8), ('right', 0x46d4bc), ('fire', 0x46d4e8)]: write(address, int(inputs.get(key, False)))
            camera = {'x': max(0, read(PLAYER + 8) - 250) if scenario == 'terrain' else 0, 'y': 0}
            write(CAMERA + 4, camera['x']); shots.clear(); call(0x407380, NODE)
            if scenario == 'terrain':
                hit = call(0x431130, PLAYER + 44, read(PLAYER + 8), read(PLAYER + 12))
                if hit: call(0x40d4c0, NODE, hit)
            trace.append({'input': inputs, 'hurt': hurt, 'camera': camera, 'expected': values(), 'shots': list(shots)})
    traces.append({'scenario': scenario, 'initial': initial, 'trace': trace})

root = b['base']['ROOT']
(root / 'test/fixtures/original-booster.json').write_text(json.dumps({'animations': animations, 'traces': traces, 'map': {'width': width, 'height': height},
    'scope': 'Native 0x40dc40/0x407380 input and state machine; terrain scenario also executes 0x40d4c0 against original block3/map. Enemy, event, full-camera and map-transition setup are separate.'}, separators=(',', ':')) + '\n')
(root / 'web/booster-data.js').write_text('// Original booster poses, extracted by capture-booster.py.\n'
    + 'export const BOOSTER_POSES = ' + json.dumps(animations, separators=(',', ':')) + ';\n')
print('Captured', sum(len(t['trace']) for t in traces), 'booster ticks.', flush=True)
