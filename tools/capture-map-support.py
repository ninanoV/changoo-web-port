"""Install virtual RESOURCE.RES transport for the original 0x427900 map reader."""
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_EIP, UC_X86_REG_ESP


def install_map_reader(graphics, stage_callback=None):
    base, cpu, read, write = (graphics[key] for key in ['base', 'cpu', 'read', 'write'])
    archive = base['base']['archive']
    file_position, map_loads = 0, []

    def io(uc, address, size, _):
        nonlocal file_position
        sp = uc.reg_read(UC_X86_REG_ESP)
        if address == 0x44f440:
            path = bytes(cpu.mem_read(read(sp + 4), 80)).split(b'\0')[0].decode()
            assert path.lower().endswith('resource.res'), path
            file_position, result = 0, 0x1900000
        elif address == 0x44f5b0:
            origin, offset = read(sp + 12), read(sp + 8)
            file_position = offset + (0 if origin == 0 else file_position if origin == 1 else len(archive))
            result = 0
        elif address == 0x44f460:
            destination, element_size, count = read(sp + 4), read(sp + 8), read(sp + 12)
            chunk = archive[file_position:file_position + element_size * count]
            cpu.mem_write(destination, chunk)
            file_position += len(chunk)
            result = len(chunk) // element_size
        else:
            result = 0
        uc.reg_write(UC_X86_REG_EAX, result)
        graphics['return_from'](uc)

    def stage_output(uc, address, size, _):
        sp = uc.reg_read(UC_X86_REG_ESP)
        stage = read(sp + 4)
        map_loads.append({'function': hex(address), 'stage': stage})
        target = stage_callback(address, stage) if stage_callback else None
        if target:
            write(sp + 4, base['PLAYER'])
            uc.reg_write(UC_X86_REG_EIP, target)
        else:
            graphics['return_from'](uc)

    for address in [0x44f440, 0x44f5b0, 0x44f460, 0x44f220]: cpu.hook_add(UC_HOOK_CODE, io, begin=address, end=address)
    for address in [0x43ee50, 0x43ef80]: cpu.hook_add(UC_HOOK_CODE, stage_output, begin=address, end=address)
    write(0x77ff98, int.from_bytes(archive[:4], 'little'))
    cpu.mem_write(0x77ffa0, archive[4:4 + read(0x77ff98) * 28])
    for address in [0x478bd4, 0x478bd8, 0x478bdc]: write(address, 0x1600000)
    return map_loads
