"""Capture isolated original x86 function results, never used by the web game.

Requires Python's unicorn package in a separate tooling environment.
Run from any directory: python tools/capture-original.py
"""
import hashlib
import json
from pathlib import Path
import random
import struct

from unicorn import Uc, UC_ARCH_X86, UC_MODE_32
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_EIP, UC_X86_REG_ESP

ROOT = Path(__file__).resolve().parents[1]
exe = (ROOT / 'Changoo (E)/SHIN.EXE').read_bytes()
assert hashlib.sha256(exe).hexdigest() == 'f358e1b58032575dbb1f6ece2e557f04e631f5dd6307c5097ec34fe9bbbcdd98', 'Unexpected EXE'
archive = (ROOT / 'Changoo (E)/RESOURCE.RES').read_bytes()
assert hashlib.sha256(archive).hexdigest() == '060da8d3c80654d35027d077a7f9c9c29c5878aa03b4b1dcb5ce991663b3e1ba', 'Unexpected RES'
resources = {}
for i in range(struct.unpack_from('<I', archive)[0]):
    name, offset, size = struct.unpack_from('<20sII', archive, 4 + i * 28)
    assert offset + size <= len(archive)
    resources[name.split(b'\0')[0].decode()] = archive[offset:offset + size]

data = resources['block1.app']
width, height, size = struct.unpack_from('<III', data)
assert size == len(data) - 12
pixels = bytearray()
for i in range(12, len(data), 2):
    pixels.extend(bytes([data[i]]) * data[i + 1])
assert len(pixels) == width * height

cpu = Uc(UC_ARCH_X86, UC_MODE_32)
cpu.mem_map(0x400000, 0x400000)
pe = struct.unpack_from('<I', exe, 60)[0]
sections = struct.unpack_from('<H', exe, pe + 6)[0]
optional_size = struct.unpack_from('<H', exe, pe + 20)[0]
for i in range(sections):
    header = pe + 24 + optional_size + i * 40
    _, address, size, offset = struct.unpack_from('<IIII', exe, header + 8)
    cpu.mem_write(0x400000 + address, exe[offset:offset + size])

MASK, PLAYER, NODE, CAMERA, RECT = 0x1000000, 0x1400000, 0x1401000, 0x1402000, 0x1403000
STACK, RETURN = 0x1500000, 0x150f000
cpu.mem_map(MASK, 0x600000)


def write(address, value):
    cpu.mem_write(address, struct.pack('<I', value & 0xffffffff))


def read(address):
    return struct.unpack('<i', cpu.mem_read(address, 4))[0]


def call(address, *args, instruction_limit=1_000_000, timeout=1_000_000):
    stack = STACK + 0x8000
    cpu.mem_write(stack, struct.pack('<' + 'I' * (len(args) + 1), RETURN, *[v & 0xffffffff for v in args]))
    cpu.reg_write(UC_X86_REG_ESP, stack)
    cpu.emu_start(address, RETURN, timeout=timeout, count=instruction_limit)
    assert cpu.reg_read(UC_X86_REG_EIP) == RETURN, f'Function did not return: {address:x}'
    return cpu.reg_read(UC_X86_REG_EAX)


cpu.mem_write(MASK, struct.pack('<II', width, height) + bytes(pixels))
write(0x46d0b0, MASK)
map_data = resources['stage1.map']
map_width, map_height = struct.unpack_from('<II', map_data)
empty = struct.pack('<hhhhh', -1, -1, -1, 0, 0)
cpu.mem_write(0x478be8, empty * 1500 * 210)
for row in range(map_height):
    cpu.mem_write(0x478be8 + row * 15000, map_data[8 + row * map_width * 10:8 + (row + 1) * map_width * 10])
def capture():
    cpu.mem_write(RECT, struct.pack('<4i', 24, 14, 50, 71))
    randomizer = random.Random(1997)
    collisions = []
    for _ in range(600):
        x = randomizer.randrange(0, map_width * 32 - 76)
        y = randomizer.randrange(60 * 32, map_height * 32 - 72)
        collisions.append([x, y, call(0x431130, RECT, x, y)])
    assert any(row[2] == 1 for row in collisions), 'Collision samples missed terrain'

    write(NODE + 0xc, PLAYER)
    write(0x473d20, PLAYER)
    write(0x77bf48, CAMERA)
    write(CAMERA + 8, 2719)
    write(0x46d4ac, 0)  # Skip only DirectDraw output, preserving the original update function.
    for offset, value in {4: NODE, 8: 0, 12: 3032, 16: 76, 20: 72, 0x2c: 24, 0x30: 14, 0x34: 50, 0x38: 71, 0x88: 1, 0x8c: 5, 0x100: 1}.items():
        write(PLAYER + offset, value)
    call(0x40d730, PLAYER)
    fields = {'x': 8, 'y': 12, 'vx': 0x54, 'vy': 0x58, 'state': 0x5c, 'frame': 0x1c, 'ticks': 0x20, 'jumpHeld': 0x94, 'facing': 0x88}
    trace = []
    sequence = [(10, {}), (30, {'right': True}), (5, {'right': True, 'jump': True}), (32, {'right': True}), (10, {}), (15, {'left': True}), (5, {'jump': True}), (35, {})]
    for count, inputs in sequence:
        for _ in range(count):
            for flag, address in [('left', 0x46d4b8), ('right', 0x46d4bc), ('jump', 0x46d4b0)]:
                write(address, int(inputs.get(flag, False)))
            call(0x405cf0, NODE)
            kind = call(0x431130, PLAYER + 0x2c, read(PLAYER + 8), read(PLAYER + 12))
            if kind:
                call(0x40d4c0, NODE, kind)
            values = {key: read(PLAYER + offset) for key, offset in fields.items()}
            assert values['state'] in [0, 1, 2, 5], f'Unexpected state: {values}'
            trace.append({'input': inputs, 'expected': values})

    result = {'source': 'SHIN.EXE', 'sha256': hashlib.sha256(exe).hexdigest(), 'functions': ['0x405cf0', '0x431130', '0x40d4c0'], 'initial': {'x': 0, 'y': 3032}, 'collisions': collisions, 'trace': trace}
    destination = ROOT / 'test/fixtures/original-stage1.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(f'Captured {len(collisions)} original collision results and {len(trace)} original player ticks.')


if __name__ == '__main__':
    capture()
