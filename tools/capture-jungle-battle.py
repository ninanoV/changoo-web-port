"""Replay the fixture's controller input through both native bosses and next-map loading."""
import json
from pathlib import Path
import runpy
import struct
from unicorn.x86_const import UC_X86_REG_EIP, UC_X86_REG_ESP

j = runpy.run_path(str(Path(__file__).with_name('capture-jungle-bosses.py')))
g, b, cpu, read, write, call, PLAYER, NODE, CAMERA, played = (j[key] for key in ['g', 'b', 'cpu', 'read', 'write', 'call', 'PLAYER', 'NODE', 'CAMERA', 'played'])
root = b['base']['ROOT']; destination = root / 'test/fixtures/original-jungle-battle.json'
inputs = json.loads(destination.read_text())['trace']


def stage_output(address, stage):
    assert stage == (4 if address == 0x43ef80 else 5)
    if address == 0x43ee50:
        for priority in [2, 6, 7, 8]: write(0x471920 + priority * 4, 0)


map_support = runpy.run_path(str(Path(__file__).with_name('capture-map-support.py')))
map_loads = map_support['install_map_reader'](g, stage_output)
for kind, name in enumerate((root / 'Changoo (E)/RESOURCE/CHAR.CFG').read_text().split()):
    cpu.mem_write(0x18f2000, name.replace('.raw', '.app').encode() + b'\0'); write(0x461430 + kind * 4, call(0x4402c0, 0x18f2000))
map_data = g['resources']['stage4.map']; width, height = j['width'], j['height']
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
for loader in [0x419780, 0x441f10, 0x434c10]: call(loader)
# 0x405c03..20 initializes the shared foot rectangle used by the spring callback.
cpu.mem_write(0x476288, struct.pack('<4i', 24, 65, 50, 71))
for priority in range(10):
    write(0x1601000 + priority * 64 + 24, 0); write(0x471920 + priority * 4, 1)
write(0x1601404, 0); write(0x1601504, 0); write(0x46fff8, 0); write(0x45c0a8, 2)
write(0x461428, 4); write(0x46142c, 4)
b['player'](x=24520, y=6232)
write(NODE + 4, 0x405cf0); write(NODE + 20, 0x1601200); write(NODE + 24, 0); write(0x1601218, NODE); cpu.mem_write(NODE + 1, b'\0')
call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x4098f0)
call(0x431050, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x40d4c0)
for ctor, code, update, destructor in [(0x430fd0, 3, 0x431000, 0x4310f0), (0x434a20, 2, 0x434a50, 0x434be0)]:
    offset = len(b['allocations']); call(ctor, code, update, destructor, 9); cpu.mem_write(b['allocations'][offset] + 1, b'\0')
assert read(b['base']['MASK'] + 4) == 2464
# Only nearby static supports can meet the player; source map activation is a separate audit.
surfaces = [(5, 24104, 6097), (5, 24794, 6107), (5, 24040, 6161), (5, 24168, 6164), (5, 24719, 6157), (5, 24868, 6155),
            (5, 24241, 6216), (5, 24374, 6216), (91, 24451, 6154), (5, 23981, 6217), (5, 24104, 6218),
            (5, 24241, 6217), (5, 24517, 6217), (5, 24649, 6217), (5, 24793, 6218), (5, 24938, 6218)]
for kind, x, y in surfaces:
    ctor, update, destructor, code = (0x441ff0, 0x4420c0, 0x4421f0, 64) if kind == 91 else (0x4197e0, 0x419970, 0x419af0, 62)
    call(ctor, code, update, destructor, 6, x, y, kind)
offset = len(b['allocations']); call(0x424ad0, 69, 0x424b60, 0x424b70, 6, 24565, 6250, 86)
cpu.mem_write(b['allocations'][offset] + 1, b'\0')
trace, boss_pointers = [], None
for tick, row in enumerate(inputs):
    for key, address in [('left', 0x46d4b8), ('right', 0x46d4bc), ('jump', 0x46d4b0)]: write(address, int(row['input'].get(key, False)))
    for address in [0x46d4b4, 0x46d4e8, 0x46d4ec, 0x46d4d8, 0x46d4f0, 0x46d4ac]: write(address, 0)
    write(CAMERA + 4, row['camera']['x']); write(CAMERA + 8, row['camera']['y'])
    j['set_clock'](tick * 1000 // 30); played.clear()
    try:
        call(0x44d3a0, instruction_limit=20_000_000, timeout=15_000_000)
    except Exception:
        print('Native failure', tick, hex(cpu.reg_read(UC_X86_REG_EIP)), b['player_values'](), 'stack', bytes(cpu.mem_read(cpu.reg_read(UC_X86_REG_ESP), 32)).hex(), flush=True)
        raise
    if read(0x46fff8): boss_pointers = {39: read(0x4739a4), 40: read(0x78eeb4)}
    shots, node = [], read(0x1601198)
    while node:
        if cpu.mem_read(node, 1)[0] == 68: shots.append(j['shot_values'](node, read(node + 12)))
        node = read(node + 24)
    trace.append({'input': row['input'], 'camera': row['camera'], 'player': b['player_values'](), 'stage': read(0x461428),
                  'bosses': {kind: j['boss_values'](kind, actor) for kind, actor in (boss_pointers or {}).items()},
                  'shots': shots, 'sounds': list(played), 'remaining': read(0x45c0a8)})
    if read(0x461428) == 5: break
print('battle', len(trace), 'ticks; stage', read(0x461428), 'lives', read(PLAYER + 140), 'points', read(PLAYER + 112), flush=True)
assert read(0x461428) == 5 and read(PLAYER + 140) > 3 and read(PLAYER + 112) == 20
assert [read(0x77bf44), read(0x77bf54)] == [1407, 100]
destination.write_text(json.dumps({'trace': trace, 'surfaces': surfaces, 'mapLoads': map_loads,
    'scope': 'Native scheduler dialogue/battle, real stage5.map reader and lives reward. Static arena supports and trigger are instantiated explicitly. Input/camera replay is fixed; next-stage resource/title/movie setup is virtualized with its original pause flags.'}, separators=(',', ':')) + '\n')
