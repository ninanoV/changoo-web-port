"""Shared native minigame palette, audio, CD and virtual game.dat hooks."""
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ESP

atlas = runpy.run_path(str(Path(__file__).with_name('capture-atlas-support.py')))
graphics = atlas['graphics']
base, cpu, write, read, call, loaded, draws = (graphics[key] for key in ['base', 'cpu', 'write', 'read', 'call', 'loaded', 'draws'])
draws = atlas['draws']
support, resources = graphics['support'], graphics['resources']
return_from, set_clock = graphics['return_from'], graphics['support']['set_clock']
surfaces, audio_names = graphics['surface_names'], support['audio_names']
save_data, save_position, save_writing = bytes(20), 0, False
audio_events, cd_commands, palettes = [], [], []


def io(uc, address, size, _):
    global save_data, save_position, save_writing
    sp = uc.reg_read(UC_X86_REG_ESP)
    if address == 0x44f440:
        path = bytes(cpu.mem_read(read(sp + 4), 80)).split(b'\0')[0].decode().lower()
        mode = bytes(cpu.mem_read(read(sp + 8), 4)).split(b'\0')[0].decode()
        assert path == '.\\resource\\game.dat', path
        save_position, save_writing = 0, mode == 'wb'
        if save_writing:
            save_data = b''
        result = 0x1900000
    elif address in [0x44f460, 0x44f290]:
        pointer, element_size, count = read(sp + 4), read(sp + 8), read(sp + 12)
        length = element_size * count
        if address == 0x44f460:
            chunk = save_data[save_position:save_position + length]
            cpu.mem_write(pointer, chunk)
        else:
            assert save_writing
            chunk = bytes(cpu.mem_read(pointer, length))
            save_data = save_data[:save_position] + chunk + save_data[save_position + length:]
        save_position += len(chunk)
        result = len(chunk) // element_size
    else:
        result = 0
    uc.reg_write(UC_X86_REG_EAX, result)
    return_from(uc)


def palette_loader(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    name = bytes(cpu.mem_read(read(sp + 4), 30)).split(b'\0')[0].decode()
    assert name.endswith('.pal') and len(resources[name]) == 768
    cpu.mem_write(0x18f1000, resources[name])
    palettes.append(name)
    uc.reg_write(UC_X86_REG_EAX, 0x18f1000)
    return_from(uc)


def create_palette(uc, address, size, _):
    write(read(uc.reg_read(UC_X86_REG_ESP) + 16), 0x1600000)


def sound(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    audio_events.append({'name': audio_names[read(sp + 4)], 'loop': bool(read(sp + 16) & 1)})


def cd(uc, address, size, _):
    sp = uc.reg_read(UC_X86_REG_ESP)
    cd_commands.append(bytes(cpu.mem_read(read(sp + 4), 80)).split(b'\0')[0].decode())


io_hooks = [cpu.hook_add(UC_HOOK_CODE, io, begin=address, end=address)
            for address in [0x44f440, 0x44f460, 0x44f290, 0x44f220]]
cpu.hook_add(UC_HOOK_CODE, palette_loader, begin=0x414bb0, end=0x414bb0)
for pointer in [0x77dc80, 0x77dc78]:
    write(pointer, 0x1600000)
write(0x1600114, 0x1600330)
cpu.mem_write(0x1600330, b'\x31\xc0\xc2\x14\x00')
cpu.hook_add(UC_HOOK_CODE, create_palette, begin=0x1600330, end=0x1600330)
write(0x160017c, 0x1600340)
cpu.mem_write(0x1600340, b'\x31\xc0\xc2\x08\x00')
cpu.hook_add(UC_HOOK_CODE, sound, begin=0x1600200, end=0x1600200)
write(0x7922c8, 0x1600350)
cpu.mem_write(0x1600350, b'\x31\xc0\xc2\x10\x00')
cpu.hook_add(UC_HOOK_CODE, cd, begin=0x1600350, end=0x1600350)

def get_save_data():
    return save_data
