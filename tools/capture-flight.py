"""Capture original flight controls, bursts, bounds and the flight-camera tracking branch."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP, UC_X86_REG_ESI, UC_X86_REG_ECX

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, write, read, call, loaded = (g[key] for key in ['base', 'cpu', 'write', 'read', 'call', 'loaded'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
call(0x44afe0); laser_image = loaded[-1]
shots = []


def emit(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    shots.append({'type': 35, 'x': read(sp + 20), 'y': read(sp + 24), 'vx': read(sp + 28), 'vy': 0})


cpu.hook_add(UC_HOOK_CODE, emit, begin=0x44b040, end=0x44b040)
cpu.hook_add(UC_HOOK_CODE, lambda uc, *_: g['return_from'](uc), begin=0x4261ad, end=0x4261ad)
animations = {}
for state, address in [(18, 0x40daa0), (19, 0x40dad0)]:
    b['player'](); call(address, PLAYER)
    names = []
    for i in range(read(PLAYER + 36)):
        index = read(read(PLAYER + 24) + i * 4)
        names.append(bytes(cpu.mem_read(0x45c3e0 + index * 20, 20)).split(b'\0')[0].decode().replace('.raw', '.app'))
    animations[state] = names


def values():
    return {**b['player_values'](), 'fireHeld': bool(read(PLAYER + 0xe8)), 'burst': read(PLAYER + 0xfc), 'flightReady': bool(read(PLAYER + 0x90))}


traces = []
for scenario in ['controls', 'hurt']:
    b['player'](x=0, y=0)
    contact = call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x4098f0)
    write(PLAYER + 60, contact)
    write(CAMERA + 4, 0); write(CAMERA + 8, 0); write(CAMERA + 68, 1400); write(CAMERA + 72, 20)
    write(0x46d4f0, 0); write(0x46d4d8, 0); write(0x461754, 0)
    call(0x40dbb0, PLAYER)
    initial = values(); trace = []
    sequence = [(10, {}), (12, {'fire': True}), (3, {}), (3, {'fire': True}), (45, {'right': True, 'up': True}),
                (80, {'left': True, 'down': True}), (40, {'left': True, 'right': True, 'up': True, 'down': True}), (60, {})]
    for count, input_value in sequence:
        for _ in range(count):
            hurt = scenario == 'hurt' and len(trace) == 70
            if hurt: call(0x40dad0, PLAYER)
            for key, address in [('left', 0x46d4b8), ('right', 0x46d4bc), ('up', 0x46d4b0), ('down', 0x46d4b4), ('fire', 0x46d4e8)]:
                write(address, int(input_value.get(key, False)))
            stopped = 160 <= len(trace) < 210
            write(0x461754, int(stopped)); shots.clear(); call(0x406ff0, NODE)
            trace.append({'input': input_value, 'hurt': hurt, 'stopped': stopped, 'expected': values(), 'shots': list(shots)})
    traces.append({'scenario': scenario, 'initial': initial, 'trace': trace})

camera_probes = []
write(0x461428, 2); write(0x77bf44, 1400); write(0x77bf54, 20)
for x in [0, 300, 44159]:
    for y in [0, 80, 159]:
        for player_y in [-30, 200, 400, 560]:
            for stopped in [False, True]:
                for offset, value in [(4, x), (8, y), (12, x // 32), (16, y // 32), (20, x % 32), (24, y % 32), (56, 200), (60, 280)]: write(CAMERA + offset, value)
                write(PLAYER + 12, player_y); write(0x461754, int(stopped))
                cpu.reg_write(UC_X86_REG_ESI, CAMERA); cpu.reg_write(UC_X86_REG_ECX, y); call(0x425c37)
                camera_probes.append({'x': x, 'y': y, 'playerY': player_y, 'stopped': stopped,
                                      'nextX': read(CAMERA + 12) * 32 + read(CAMERA + 20), 'nextY': read(CAMERA + 16) * 32 + read(CAMERA + 24)})

write(CAMERA + 4, 0); write(CAMERA + 8, 0)
offset = len(b['allocations']); call(0x44b040, 35, 0x44b120, 0x44b1b0, 6, 100, 200, 24)
node, data = b['allocations'][offset:offset + 2]
laser = {'image': laser_image, 'width': read(data + 12), 'height': read(data + 16), 'body': [read(data + 20 + i * 4) for i in range(4)], 'trace': []}
for _ in range(80):
    call(0x44b120, node)
    laser['trace'].append({'x': read(data + 4), 'y': read(data + 8), 'removed': cpu.mem_read(node + 1, 1)[0] == 2})
    if laser['trace'][-1]['removed']: break
root = b['base']['ROOT']
call(0x43bb70); b['player'](x=100, y=200); call(0x40daa0, PLAYER)
offset = len(b['allocations']); call(0x43bc00, 0x51, 0x43bcf0, 0x43bee0, 6, 100, 200, 10)
pickup_node, pickup_data = b['allocations'][offset:offset + 2]
call(0x4077d0, NODE, pickup_node)
pickup = {'player': b['player_values'](), 'collected': read(pickup_data + 60) == 1}
(root / 'test/fixtures/original-flight.json').write_text(json.dumps({'animations': animations, 'traces': traces, 'camera': camera_probes, 'laser': laser, 'pickup': pickup}, separators=(',', ':')) + '\n')
(root / 'web/flight-data.js').write_text('// SHIN.EXE flight animations and laser constructor, extracted by capture-flight.py.\n'
    + 'export const FLIGHT_IMAGES = ' + json.dumps(animations, separators=(',', ':')) + ';\n'
    + 'export const FLIGHT_LASER = ' + json.dumps({key: value for key, value in laser.items() if key != 'trace'}, separators=(',', ':')) + ';\n')
print(f'Captured {sum(len(row["trace"]) for row in traces)} flight ticks, {len(camera_probes)} camera branch probes and {len(laser["trace"])} laser ticks.', flush=True)
