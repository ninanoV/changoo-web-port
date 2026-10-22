"""Shared native atlas packing, draw command and audio capture hooks."""
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP

graphics = runpy.run_path(str(Path(__file__).with_name('capture-graphics-support.py')))
base, cpu, write, read, call = (graphics[key] for key in ['base', 'cpu', 'write', 'read', 'call'])
support = graphics['support']
surface_names, audio_names = graphics['surface_names'], support['audio_names']
return_from, set_clock = graphics['return_from'], support['set_clock']
cpu.hook_del(graphics['surface_hooks'][0x445210])
cpu.hook_del(graphics['skip_hooks'][0x433670])
atlases, packing, draws, sounds = {}, [], [], []


def pack_begin(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    table, count = read(sp + 4), read(sp + 8)
    packing[:] = [table, [surface_names[read(table + i * 24)] for i in range(count)]]


def pack_end(uc, address, size, _):
    table, names = packing
    atlases[read(table)] = {tuple(read(table + i * 24 + 4 + field * 4) for field in range(4)): name
                           for i, name in enumerate(names)}


def draw(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    if address == 0x1600320:
        name, x, y = surface_names.get(read(sp + 16)), read(sp + 8), read(sp + 12)
        if not name:  # Atlas assembly is not a screen drawing.
            return
    else:
        rect = tuple(read(sp + 12 + field * 4) for field in range(4))
        surface = read(sp + 28)
        name = atlases[surface][rect] if surface in atlases else surface_names[surface]
        assert name, (hex(surface), rect)
        x, y = read(sp + 4), read(sp + 8)
        return_from(uc)
    draws.append({'name': name, 'x': x, 'y': y})


def audio(uc, address, size, _):
    name = audio_names[read(uc.reg_read(UC_X86_REG_ESP) + 4)]
    sounds.append({'action': 'stop' if address == 0x1600360 else 'play', 'name': name})


cpu.hook_add(UC_HOOK_CODE, pack_begin, begin=0x445210, end=0x445210)
cpu.hook_add(UC_HOOK_CODE, pack_end, begin=0x445283, end=0x445283)
for address in [0x1600320, 0x433670]:
    cpu.hook_add(UC_HOOK_CODE, draw, begin=address, end=address)
write(0x1600148, 0x1600360)
cpu.mem_write(0x1600360, b'\x31\xc0\xc2\x04\x00')
for address in [0x1600200, 0x1600360]:
    cpu.hook_add(UC_HOOK_CODE, audio, begin=address, end=address)
cpu.hook_add(UC_HOOK_CODE, lambda uc, *_: return_from(uc), begin=0x433720, end=0x433720)

