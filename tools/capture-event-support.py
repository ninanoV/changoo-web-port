"""Shared isolated x86 clock/audio hooks for original event captures."""
from pathlib import Path
import runpy

from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_EIP, UC_X86_REG_ESP

base = runpy.run_path(str(Path(__file__).with_name('capture-objects.py')))
cpu, write, read, call = (base[key] for key in ['cpu', 'write', 'read', 'call'])
PLAYER, NODE, CAMERA = (base[key] for key in ['PLAYER', 'NODE', 'CAMERA'])
clock, audio_cursor = 0, 0x1607000
audio_names, played = {}, []


def return_from(uc):
    stack = uc.reg_read(UC_X86_REG_ESP)
    uc.reg_write(UC_X86_REG_EIP, read(stack))
    uc.reg_write(UC_X86_REG_ESP, stack + 4)


def graphics_loader(uc, address, size, _):
    return_from(uc)


def load_audio(uc, address, size, _):
    global audio_cursor
    stack = uc.reg_read(UC_X86_REG_ESP)
    output, path = read(stack + 8), read(stack + 12)
    name = bytes(cpu.mem_read(path, 80)).split(b'\0')[0].decode().split('\\')[-1].upper()
    write(output, audio_cursor)
    write(audio_cursor, 0x1600100)
    audio_names[audio_cursor] = name
    audio_cursor += 8
    return_from(uc)


def clock_hook(uc, address, size, _):
    uc.reg_write(UC_X86_REG_EAX, clock)


def sound_hook(uc, address, size, _):
    stack = uc.reg_read(UC_X86_REG_ESP)
    played.append(audio_names[read(stack + 4)])


cpu.hook_add(UC_HOOK_CODE, load_audio, begin=0x42d4b0, end=0x42d4b0)
cpu.hook_add(UC_HOOK_CODE, sound_hook, begin=0x1600200, end=0x1600200)
cpu.mem_write(0x1600300, b'\xc3')
write(0x792224, 0x1600300)
cpu.hook_add(UC_HOOK_CODE, clock_hook, begin=0x1600300, end=0x1600300)


def set_clock(value):
    global clock
    clock = value
