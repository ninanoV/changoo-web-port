"""Replay final-battle inputs through native factories, scheduler and ending creation."""
import json
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EIP

m = runpy.run_path(str(Path(__file__).with_name('capture-minigame-support.py')))
g, b, cpu, read, write, call, set_clock = (m[key] for key in ['graphics', 'base', 'cpu', 'read', 'write', 'call', 'set_clock'])
PLAYER, NODE, CAMERA = b['PLAYER'], b['NODE'], b['CAMERA']
root = b['base']['ROOT']
destination = root / 'test/fixtures/original-final-battle.json'
inputs = json.loads(destination.read_text())
for loader in [0x4059c0, 0x432770, 0x43b6c0, 0x4206e0, 0x404600, 0x43c580, 0x42bd50, 0x41d2a0, 0x442290,
               0x442d60, 0x42a2e0, 0x41f030, 0x404a80, 0x444250, 0x445330, 0x43dc70, 0x4140f0,
               0x419780, 0x434c10, 0x43bb70, 0x440720, 0x44db60, 0x423fb0, 0x42d5e0, 0x42fc00, 0x42b2a0,
               0x414530, 0x447c80, 0x43e160, 0x42e8c0, 0x447ff0, 0x446420, 0x41aa70, 0x44c660, 0x441f10,
               0x41fdf0, 0x4193e0, 0x429230, 0x4176b0, 0x44a760, 0x44ab50]: call(loader)
for kind, name in enumerate((root / 'Changoo (E)/RESOURCE/CHAR.CFG').read_text().split()):
    cpu.mem_write(0x18f2000, name.replace('.raw', '.app').encode() + b'\0'); write(0x461430 + kind * 4, call(0x4402c0, 0x18f2000))
map_data = g['resources']['stage6.map']; width, height = struct.unpack_from('<II', map_data)
cpu.mem_write(0x478be8, struct.pack('<5h', -1, -1, -1, 0, 0) * 1500 * 210)
for row in range(height): cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * width * 10:8 + (row + 1) * width * 10])
cpu.mem_write(0x18f2000, b'block6.app\0'); call(0x4402c0, 0x18f2000)
cpu.mem_write(0x476288, struct.pack('<4i', 24, 65, 50, 71))
for priority in range(10):
    write(0x1601000 + priority * 64 + 24, 0); write(0x471920 + priority * 4, 1)
write(0x1601404, 0); write(0x1601504, 0); write(0x461428, 6); write(0x46142c, 6)
write(0x77bf44, width); write(0x77bf54, height); write(CAMERA + 68, width); write(CAMERA + 72, height)
for address in [0x46d684, 0x471bc0, 0x4605b4, 0x47022c, 0x78ebb4, 0x77c524, 0x77dc90]: write(address, 0)
write(0x46c500, 2); write(0x45c0a8, 2)
b['player'](x=inputs['start'][0], y=inputs['start'][1])
write(NODE + 4, 0x405cf0); write(NODE + 20, 0x1601200); write(NODE + 24, 0); write(0x1601218, NODE); cpu.mem_write(NODE + 1, b'\0')
call(0x434b40, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x4098f0)
call(0x431050, NODE, PLAYER + 44, PLAYER + 8, PLAYER + 12, 0x40d4c0)
for ctor, code, update, destructor in [(0x430fd0, 3, 0x431000, 0x4310f0), (0x434a20, 2, 0x434a50, 0x434be0)]:
    offset = len(b['allocations']); call(ctor, code, update, destructor, 9); cpu.mem_write(b['allocations'][offset] + 1, b'\0')
ending = False


def ending_started(*_):
    global ending
    ending = True


cpu.hook_add(UC_HOOK_CODE, ending_started, begin=0x449350, end=0x449350)
previous_cell = None


def scan(camera):
    global previous_cell
    column, row = camera['x'] // 32, camera['y'] // 32
    write(CAMERA + 4, camera['x']); write(CAMERA + 8, camera['y'])
    if previous_cell is None:
        write(CAMERA + 12, column); write(CAMERA + 16, row)
        for y in range(-15, 31):
            for x in range(-20, 41): call(0x427610, x, y, CAMERA)
        for y in range(16):
            for x in range(21): call(0x426380, x, y, CAMERA)
    else:
        old_column, old_row = previous_cell
        assert abs(column - old_column) <= 1 and abs(row - old_row) <= 1
        write(CAMERA + 12, column); write(CAMERA + 16, old_row)
        if column != old_column:
            for y in range(16): call(0x426380, 20 if column > old_column else 0, y, CAMERA)
            for y in range(-15, 31): call(0x427610, 40 if column > old_column else -20, y, CAMERA)
        write(CAMERA + 16, row)
        if row != old_row:
            for x in range(21): call(0x426380, x, 15 if row > old_row else 0, CAMERA)
            for x in range(-20, 41): call(0x427610, x, 30 if row > old_row else -15, CAMERA)
    previous_cell = (column, row)


def boss_values(kind, data):
    large = kind == 59
    fields = {'x': 4, 'y': 8, 'oldX': 72 if large else 64, 'oldY': 76 if large else 68,
              'vx': 80 if large else 72, 'vy': 84 if large else 76, 'frame': 24 if large else 16,
              'ticks': 28 if large else 20, 'count': 32 if large else 24, 'period': 36 if large else 28,
              'state': 88 if large else 80, 'facing': 104 if large else 96, 'timer': 108 if large else 88,
              'health': 116 if large else 108}
    node = read(data + 112)
    return {**{key: read(data + offset) for key, offset in fields.items()}, 'removed': cpu.mem_read(node + 1, 1)[0] == 2,
            'scripted': read(node + 4) in [0x443750, 0x42ae50]}


trace = []
for tick, row in enumerate(inputs['trace']):
    for key, address in [('left', 0x46d4b8), ('right', 0x46d4bc), ('jump', 0x46d4b0)]: write(address, int(row['input'].get(key, False)))
    for address in [0x46d4b4, 0x46d4e8, 0x46d4ec, 0x46d4d8, 0x46d4f0, 0x46d4ac]: write(address, 0)
    set_clock(round(row['now'])); m['audio_events'].clear(); m['cd_commands'].clear()
    try:
        scan(row['camera']); call(0x44d3a0)
    except Exception:
        print('Battle failed', tick, hex(cpu.reg_read(UC_X86_REG_EIP)), b['player_values'](), flush=True)
        raise
    bosses = {kind: boss_values(kind, read(pointer)) for kind, pointer in [(59, 0x78ebb4), (41, 0x77c524)] if read(pointer)}
    scene = read(0x77dc90)
    trace.append({**row, 'player': b['player_values'](), 'bosses': bosses, 'phase': read(scene + 4) if scene else None,
                  'remaining': read(0x46c500), 'ending': ending, 'sounds': list(m['audio_events']), 'cd': list(m['cd_commands'])})
    if ending or read(PLAYER + 140) <= 0: break
result = {'start': inputs['start'], 'trace': trace,
          'scope': 'Original factories with native row/edge scan order, actor/player scheduler and ending constructor. Input and camera coordinates are replayed; tile-cache drawing and HUD dog are not executed.'}
Path('/tmp/changoo-native-final-battle.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
print('Final battle:', len(trace), 'ticks, lives', read(PLAYER + 140), 'points', read(PLAYER + 112), 'ending', ending, flush=True)
if ending: destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
