"""Decode both native map dispatch tables and execute the prefetch dispatcher."""
import json
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP

g = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
b, cpu, write, read, call = (g[key] for key in ['base', 'cpu', 'write', 'read', 'call'])
CAMERA = b['CAMERA']
primary = [read(0x427408 + kind * 4) for kind in range(127)]
secondary = {kind: read(0x427860 + cpu.mem_read(0x427888 + kind - 13, 1)[0] * 4) for kind in range(13, 123)}
kinds = [kind for kind, target in secondary.items() if target != 0x427855]
ignored = [kind for kind, target in enumerate(primary) if target == 0x427403 and kind not in kinds]
assert kinds == [13, 14, 15, 16, 17, 20, 21, 121, 122]
assert ignored == [6, 7, 8]
created = []


def observe(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    kind = read(sp + 32) if address == 0x44abb0 else 121 if address == 0x404690 else read(sp + 28)
    created.append({'kind': kind, 'type': read(sp + 4), 'x': read(sp + 20), 'y': read(sp + 24)})
    g['return_from'](uc)


for address in [0x44abb0, 0x428160, 0x403190, 0x404690, 0x414f80]: cpu.hook_add(UC_HOOK_CODE, observe, begin=address, end=address)
for kind, name in enumerate((b['base']['ROOT'] / 'Changoo (E)/RESOURCE/CHAR.CFG').read_text().split()):
    cpu.mem_write(0x18f2000, name.replace('.raw', '.app').encode() + b'\0')
    write(0x461430 + kind * 4, call(0x4402c0, 0x18f2000))

placements = []
for kind in kinds:
    for column, row in [(0, 5), (1, 1), (40, 30), (99, 59), (100, 5), (5, 60)]:
        write(0x77bf44, 100); write(0x77bf54, 60); write(CAMERA + 12, 0); write(CAMERA + 16, 0)
        cell = 0x478be8 + (row * 1500 + column) * 10
        cpu.mem_write(cell, struct.pack('<5h', -1, -1, kind, -7, 3))
        created.clear(); call(0x426380, column, row, CAMERA)
        assert not created, (kind, 'unexpected primary creation')
        call(0x427610, column, row, CAMERA)
        placements.append({'kind': kind, 'column': column, 'row': row, 'dx': -7, 'dy': 3,
                           'created': list(created), 'consumed': int.from_bytes(cpu.mem_read(cell + 4, 2), 'little', signed=True) == -1})

# The caller's initial prefetch rectangle is x=-20..40, y=-15..30, before the visible rectangle.
maps = []
for name in ['stage2.map', 'stage3.map']:
    data = g['resources'][name]; width, height = struct.unpack_from('<II', data)
    for row in range(height): cpu.mem_write(0x478be8 + row * 15000, data[8 + row * width * 10:8 + (row + 1) * width * 10])
    write(0x77bf44, width); write(0x77bf54, height)
    scans = []
    for column, row in [(0, 0), (1, 0), (2, 0), (2, 1), (1, 1)]:
        write(CAMERA + 12, column); write(CAMERA + 16, row)
        created.clear()
        offsets = [(x, y) for y in range(-15, 31) for x in range(-20, 41)] if not scans else (
            [(40 if column > scans[-1]['column'] else -20, y) for y in range(-15, 31)] if column != scans[-1]['column'] else [(x, 30) for x in range(-20, 41)])
        for dx, dy in offsets: call(0x427610, dx, dy, CAMERA)
        scans.append({'column': column, 'row': row, 'created': list(created)})
    maps.append({'name': name, 'scans': scans})

root = b['base']['ROOT']
(root / 'test/fixtures/original-spawning.json').write_text(json.dumps({'secondaryKinds': kinds, 'ignored': ignored, 'placements': placements, 'maps': maps,
    'scope': 'Original 0x426380/0x427610 dispatch, bounds, placement and map consumption. Constructors intercepted. Scan offsets reproduce the original camera edge call sites 0x42531b/0x42555e/0x4257af/0x425a6e and initial 0x427e41.'}, separators=(',', ':')) + '\n')
(root / 'web/spawn-data.js').write_text('// Original prefetch dispatcher 0x427610, alongside visible dispatcher 0x426380.\n'
    + 'export const SECONDARY_KINDS = ' + json.dumps(kinds) + ';\n')
print('Verified both dispatch tables,', len(placements), 'boundary/placement probes and two actual-map scan paths.', flush=True)
