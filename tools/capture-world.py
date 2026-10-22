"""Run SHIN.EXE's real scheduler with player, enemies and native collision managers."""
import json
from pathlib import Path
import runpy
from unicorn.x86_const import UC_X86_REG_EIP

graphics = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
base, cpu, write, read, call = (graphics[key] for key in ['base', 'cpu', 'write', 'read', 'call'])
PLAYER, NODE, CAMERA = (base[key] for key in ['PLAYER', 'NODE', 'CAMERA'])
set_clock = graphics['support']['set_clock']


def ready(node):
    cpu.mem_write(node + 1, b'\0')


def setup(x, y, camera_x, camera_y):
    for priority in range(10):
        write(0x1601000 + priority * 64 + 24, 0)
        write(0x471920 + priority * 4, 1)
    write(0x1601404, 0)
    write(0x1601504, 0)
    base['player'](x=x, y=y)
    write(CAMERA + 4, camera_x)
    write(CAMERA + 8, camera_y)
    write(NODE + 4, 0x405cf0)
    write(NODE + 8, 0x407760)
    write(NODE + 20, 0x1601200)
    write(NODE + 24, 0)
    write(0x1601218, NODE)
    ready(NODE)
    call(0x434b40, NODE, PLAYER + 0x2c, PLAYER + 8, PLAYER + 12, 0x4098f0)
    call(0x431050, NODE, PLAYER + 0x2c, PLAYER + 8, PLAYER + 12, 0x40d4c0)
    offset = len(base['allocations'])
    call(0x430fd0, 3, 0x431000, 0x4310f0, 9)
    ready(base['allocations'][offset])
    offset = len(base['allocations'])
    call(0x434a20, 2, 0x434a50, 0x434be0, 9)
    ready(base['allocations'][offset])


def player_values():
    values = base['player_values']()
    values.update({'jumpHeld': bool(read(PLAYER + 0x94)), 'onPlatform': bool(read(PLAYER + 0x64)),
                   'period': read(PLAYER + 0x28), 'count': read(PLAYER + 0x24)})
    table = 0x45d2f8 if read(NODE + 4) == 0x40e770 else 0x45c3e0
    index = read(read(PLAYER + 0x18) + read(PLAYER + 0x1c) * 4)
    values['sprite'] = bytes(cpu.mem_read(table + index * 20, 20)).split(b'\0')[0].decode().replace('.raw', '.app')
    return values


def inputs(value):
    for key, address in [('left', 0x46d4b8), ('right', 0x46d4bc), ('jump', 0x46d4b0), ('fire', 0x46d4e8), ('enter', 0x46d4ec)]:
        write(address, int(value.get(key, False)))


setup(6500, 3032, 6400, 2719)
actors = [base['create'](0, 6608, 3032), base['create'](1, 6808, 3032), base['create'](10, 6540, 3032)]
for node, data in actors:
    ready(node)
trace = []
sequence = [(20, {'right': True}), (5, {'right': True, 'jump': True}), (30, {'right': True}),
            (10, {}), (15, {'left': True}), (140, {})]
for count, input_value in sequence:
    for _ in range(count):
        inputs(input_value)
        call(0x44d3a0)
        objects = []
        for kind, (node, data) in zip([0, 1, 10], actors):
            if kind != 10:
                objects.append(base['enemy_values'](kind, node, data))
            else:
                objects.append({'collected': read(data + 0x3c) == 1, 'screenX': read(data + 0x24),
                                'screenY': read(data + 0x28), 'vy': read(data + 0x38), 'removed': cpu.mem_read(node + 1, 1)[0] == 2})
        trace.append({'input': input_value, 'player': player_values(), 'actors': objects})

setup(4223, 2680, 4000, 2400)
call(0x40d760, PLAYER)
write(0x47060c, 0)
inputs({})
set_clock(0)
offset = len(base['allocations'])
call(0x443cd0, 0x2d, 0x443e30, 0x444170, 6)
event_node, event_data = base['allocations'][offset:offset + 2]
node = read(0x1601198)
while node:
    ready(node)
    node = read(node + 24)
scene = []
for tick in range(1, 1221):
    elapsed = tick * 1000 // 30
    input_value = {'right': True} if elapsed >= 39000 else {}
    set_clock(elapsed)
    inputs(input_value)
    try:
        call(0x44d3a0)
    except Exception:
        print('Scene failure', tick, elapsed, hex(cpu.reg_read(UC_X86_REG_EIP)), flush=True)
        raise
    scene.append({'elapsed': elapsed, 'input': input_value, 'player': player_values(),
                  'phase': read(event_data + 4), 'removed': cpu.mem_read(event_node + 1, 1)[0] == 2})
assert scene[-1]['removed'] and scene[-1]['player']['state'] == 1

allies = []
for slot in [3, 4]:
    setup(6500, 3032, 6400, 2719)
    enemies = [base['create'](kind, 6608 + kind * 100, 3032) for kind in range(3)]
    for enemy_node, _ in enemies:
        ready(enemy_node)
    if slot == 4:
        call(0x439440)
    offset = len(base['allocations'])
    if slot == 3:
        call(0x44e660, 0x34, 0x44e760, 0x44e920, 6)
    else:
        call(0x439500, 0x35, 0x4395f0, 0x4397c0, 8, 10, 400)
    ally_node, data = base['allocations'][offset:offset + 2]
    ready(ally_node)
    if slot == 4:
        call(0x43a330, data)
    frames = []
    for tick in range(260):
        input_value = {'right': True} if tick < 20 else {}
        inputs(input_value)
        call(0x44d3a0)
        fields = {'x': 4, 'y': 8, 'frame': 0x18 if slot == 3 else 0x10, 'ticks': 0x1c if slot == 3 else 0x14,
                  'state': 0x58 if slot == 3 else 0x48, 'screenX': 0x40 if slot == 3 else 0x30, 'screenY': 0x44 if slot == 3 else 0x34}
        ally = {key: read(data + offset) for key, offset in fields.items()}
        ally['removed'] = cpu.mem_read(ally_node + 1, 1)[0] == 2
        frames.append({'input': input_value, 'player': player_values(), 'ally': ally,
                       'enemies': [base['enemy_values'](kind, *enemy) for kind, enemy in enumerate(enemies)]})
    allies.append({'slot': slot, 'trace': frames})

result = {'scheduler': '0x44d3a0', 'order': [read(0x471948 + i * 4) for i in range(10)],
          'trace': trace, 'scene': scene, 'allies': allies,
          'scope': 'native scheduler and terrain/body managers; fixed camera, graphics output and allocation substituted'}
destination = base['base']['ROOT'] / 'test/fixtures/original-world.json'
destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(f'Captured {len(trace)} combat ticks, {len(scene)} event ticks and 520 companion ticks through the native scheduler.')
