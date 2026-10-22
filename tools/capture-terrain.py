"""Capture stage-two mask queries and the native player terrain callbacks."""
import json
from pathlib import Path
import random
import runpy
import struct

base = runpy.run_path(str(Path(__file__).with_name('capture-objects.py')))
cpu, write, read, call = (base[key] for key in ['cpu', 'write', 'read', 'call'])
PLAYER, NODE = base['PLAYER'], base['NODE']
resources, MASK = base['base']['resources'], base['base']['MASK']
pixels = bytearray()
image = resources['block2.app']
width, height, length = struct.unpack_from('<III', image)
for i in range(12, len(image), 2):
    pixels.extend(bytes([image[i]]) * image[i + 1])
assert len(pixels) == width * height
cpu.mem_write(MASK, struct.pack('<II', width, height) + pixels)
data = resources['stage2.map']
map_width, map_height = struct.unpack_from('<II', data)
empty = struct.pack('<hhhhh', -1, -1, -1, 0, 0)
cpu.mem_write(0x478be8, empty * 1500 * 210)
for row in range(map_height):
    cpu.mem_write(0x478be8 + row * 15000, data[8 + row * map_width * 10:8 + (row + 1) * map_width * 10])

randomizer = random.Random(2002)
collisions, corrections = [], []
for _ in range(2500):
    x, y = randomizer.randrange(0, map_width * 32 - 76), randomizer.randrange(0, 3100)
    base['player'](x=x, y=y)
    hit = call(0x431130, PLAYER + 0x2c, x, y)
    collisions.append([x, y, hit])
    if hit in [2, 3, 4] and len(corrections) < 100:
        old_x, old_y = x - 7, y - 11
        write(PLAYER + 0x4c, old_x)
        write(PLAYER + 0x50, old_y)
        call(0x40d4c0, NODE, hit)
        corrections.append({'x': x, 'y': y, 'oldX': old_x, 'oldY': old_y, 'type': hit,
                            'expected': {'x': read(PLAYER + 8), 'y': read(PLAYER + 12), 'onPlatform': bool(read(PLAYER + 0x64))}})
assert any(c[2] == 1 for c in collisions), 'Real-map queries missed solid terrain'

# Type 2 does not occur in block2; isolate a single original-sized mask tile.
cpu.mem_write(0x478be8, empty * 1500 * 210)
cpu.mem_write(0x478be8 + (10 * 1500 + 10) * 10, struct.pack('<hhhhh', -1, 0, -1, 0, 0))
synthetic = []
for kind in [1, 2, 3, 4]:
    px = bytearray(640 * 32)
    for y in range(32):
        px[y * 640:y * 640 + 32] = bytes([kind]) * 32
    cpu.mem_write(MASK, struct.pack('<II', 640, 32) + px)
    for x, y in [(280, 250), (295, 250), (320, 250), (295, 290), (295, 330)]:
        base['player'](x=x, y=y)
        write(PLAYER + 0x4c, x - 7)
        write(PLAYER + 0x50, y - 11)
        hit = call(0x431130, PLAYER + 0x2c, x, y)
        if hit:
            call(0x40d4c0, NODE, hit)
        synthetic.append({'kind': kind, 'x': x, 'y': y, 'type': hit,
                          'expected': {'x': read(PLAYER + 8), 'y': read(PLAYER + 12), 'onPlatform': bool(read(PLAYER + 0x64))}})

assert {1, 2, 3, 4}.issubset({row['type'] for row in synthetic}), 'Synthetic probes missed a mask type'
result = {'stage': 2, 'collisions': collisions, 'corrections': corrections, 'synthetic': synthetic}
destination = base['base']['ROOT'] / 'test/fixtures/original-terrain.json'
destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(f'Captured {len(collisions)} stage-two mask queries, {len(corrections)} slope corrections and 20 synthetic mask cases.')
print('Observed real-map mask types:', sorted({row[2] for row in collisions}))
