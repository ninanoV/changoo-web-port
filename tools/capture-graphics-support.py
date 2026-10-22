"""Native image-loader metadata with substituted DirectDraw surfaces for analysis."""
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ESP

support = runpy.run_path(str(Path(__file__).with_name('capture-event-support.py')))
base, cpu, write, read, call, played, return_from = (support[key] for key in
    ['base', 'cpu', 'write', 'read', 'call', 'played', 'return_from'])
PLAYER, CAMERA = base['PLAYER'], base['CAMERA']
support['audio_names'][0x1600000] = 'existing-effect'
resources = base['base']['resources']
cpu.mem_map(0x1800000, 0x100000)
resource_cursor, resource_pointers, loaded = 0x1800000, {}, []
surface_cursor, surface_names, draws = 0x1880000, {}, []


def image_loader(uc, address, size, _):
    global resource_cursor
    sp = uc.reg_read(UC_X86_REG_ESP)
    pointer = read(sp + 4)
    name = bytes(cpu.mem_read(pointer, 80)).split(b'\0')[0].decode().replace('.raw', '.app')
    assert name in resources, name
    loaded.append(name)
    if name.startswith('block') or name == 'sblock.app':
        data = resources[name]
        pixels = bytearray()
        for i in range(12, len(data), 2):
            pixels.extend(bytes([data[i]]) * data[i + 1])
        mask = base['base']['MASK']
        assert len(pixels) + 8 < PLAYER - mask
        cpu.mem_write(mask, data[:8] + pixels)
        uc.reg_write(UC_X86_REG_EAX, mask)
        return_from(uc)
        return
    if name not in resource_pointers:
        resource_pointers[name] = resource_cursor
        cpu.mem_write(resource_cursor, resources[name][:8])
        resource_cursor += 16
    uc.reg_write(UC_X86_REG_EAX, resource_pointers[name])
    return_from(uc)


def surface(uc, address, size, _):
    global surface_cursor
    pointer = surface_cursor
    surface_cursor += 16
    assert surface_cursor < 0x18f0000
    write(pointer, 0x1600100)
    name = loaded[-1] if loaded and address == 0x433410 else None
    if name:
        sp = uc.reg_read(UC_X86_REG_ESP)
        header = resources[name]
        if [read(sp + 4), read(sp + 8)] != [int.from_bytes(header[:4], 'little'), int.from_bytes(header[4:8], 'little')]:
            name = None
    surface_names[pointer] = name
    uc.reg_write(UC_X86_REG_EAX, pointer)
    return_from(uc)


def skip(uc, address, size, _):
    if address in [0x4335e0, 0x433670]:
        sp = uc.reg_read(UC_X86_REG_ESP)
        surface_arg = 20 if address == 0x4335e0 else 28
        draws.append({'name': surface_names.get(read(sp + surface_arg)), 'x': read(sp + 4), 'y': read(sp + 8)})
    return_from(uc)


cpu.hook_add(UC_HOOK_CODE, image_loader, begin=0x4402c0, end=0x4402c0)
surface_hooks = {address: cpu.hook_add(UC_HOOK_CODE, surface, begin=address, end=address)
                 for address in [0x433410, 0x445210]}
skip_hooks = {address: cpu.hook_add(UC_HOOK_CODE, skip, begin=address, end=address)
              for address in [0x4334a0, 0x433540, 0x44f210, 0x42a210, 0x4335e0, 0x433670]}
write(0x1600108, 0x1600310)
cpu.mem_write(0x1600310, b'\x31\xc0\xc2\x04\x00')
write(0x77dc6c, 0x1600000)
write(0x77d1b8, 0x1600000)
write(0x160011c, 0x1600320)
cpu.mem_write(0x1600320, b'\x31\xc0\xc2\x18\x00')

