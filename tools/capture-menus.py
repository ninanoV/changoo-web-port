"""Execute original main/selection menus with virtual save files and observed exits."""
import json
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ESP

m = runpy.run_path(str(Path(__file__).with_name('capture-minigame-support.py')))
g, b, cpu, read, write, call, draws, clock = (m[k] for k in ['graphics', 'base', 'cpu', 'read', 'write', 'call', 'draws', 'set_clock'])
for hook in m['io_hooks']: cpu.hook_del(hook)
files, io_events, requests = {}, [], []
opened, position, writing = None, 0, False
active_constructor = None

def text(pointer):
    return bytes(cpu.mem_read(pointer, 80)).split(b'\0')[0].decode()

def io(uc, address, *_):
    global opened, position, writing
    sp = uc.reg_read(UC_X86_REG_ESP)
    if address == 0x44f440:
        opened = text(read(sp + 4)).lower().split('\\')[-1]
        assert opened in ['game.dat', 'save.dat', 'speed.dat']
        writing, position = text(read(sp + 8)) == 'wb', 0
        if writing: files[opened] = b''
        result = 0x1900000 if opened in files else 0
        io_events.append({'file': opened, 'mode': 'wb' if writing else 'rb', 'exists': bool(result)})
    elif address in [0x44f460, 0x44f290]:
        ptr, width, count = (read(sp + x) for x in [4, 8, 12])
        if address == 0x44f460:
            chunk = files[opened][position:position + width * count]
            if chunk: cpu.mem_write(ptr, chunk)
        else:
            assert writing
            chunk = bytes(cpu.mem_read(ptr, width * count))
            files[opened] = files[opened][:position] + chunk + files[opened][position + len(chunk):]
        result = len(chunk) // width
        position += len(chunk)
    else: result = 0
    uc.reg_write(UC_X86_REG_EAX, result); g['return_from'](uc)

for addr in [0x44f440, 0x44f460, 0x44f290, 0x44f220]: cpu.hook_add(UC_HOOK_CODE, io, begin=addr, end=addr)
constructors = {0x4352d0:'main', 0x448930:'select', 0x44ade0:'options', 0x42f920:'speed', 0x440540:'scroll', 0x421230:'slider',
                0x43f120:'stage', 0x401d10:'car', 0x41c810:'card', 0x41ba30:'flag', 0x43d120:'mole', 0x4245a0:'puzzle'}
def transition(uc, addr, *_):
    if addr == active_constructor: return
    requests.append({'target': constructors[addr], 'stage': read(0x461428)})
    g['return_from'](uc)
for addr in constructors: cpu.hook_add(UC_HOOK_CODE, transition, begin=addr, end=addr)
cpu.hook_add(UC_HOOK_CODE, lambda uc,*_:g['return_from'](uc), begin=0x433750, end=0x433750)
KEYS = {'up':0x46d4b0,'down':0x46d4b4,'left':0x46d4b8,'right':0x46d4bc,'space':0x46d4e8,'enter':0x46d4ec,'back':0x46d4f0}

def reset():
    requests.clear(); io_events.clear(); draws.clear(); m['audio_events'].clear(); m['cd_commands'].clear(); m['palettes'].clear()
    for p in range(10): write(0x1601000+p*64+24, 0); write(0x471920+p*4, 1)
    for addr in KEYS.values(): write(addr, 0)
    write(0x46d4ac,1); write(0x46d4a8,1); write(0x471518,0); write(0x46d584,1); write(0x461418,16)
    for addr in [0x78f784,0x78f79c,0x78f7a0,0x78f840,0x78f790,0x4711ac,0x4711b0,0x4711b8,0x461428]: write(addr,0)
    write(0x4711b4,1)
    for i in range(5): write(0x471198+i*4,0)
    clock(1000)

def snapshot(kind,node,data):
    if kind=='main':
        result = {key:read(data+off) for key,off in [('selection',12),('actorY',20),('titleY',28),('buttonsX',32),('ticks',40),('upHeld',44),('downHeld',48),('enterHeld',52),('frameCount',56),('frame',60),('frameTicks',64),('startedAt',72),('now',76),('phase',80)]}
        result['animation'] = {0x46dd50:0,0x46dd60:1,0x46dd68:2,0x46dd70:3,0x46dd78:4}[read(data+68)]
        result['musicAt'] = read(0x77dfe0)
    else:
        result = {key:read(addr) for key,addr in [('stage',0x4711ac),('mini',0x4711b0),('stageMode',0x4711b4),('frame',0x4711b8),('stageCount',0x78f850),('leftReady',0x78f784),('rightReady',0x78f79c),('upReady',0x78f7a0),('downReady',0x78f840),('spaceReady',0x78f790),('musicPlaying',0x470da8),('musicAt',0x78f868)]}
    result.update(removed=cpu.mem_read(node+1,1)[0]==2,quit=read(0x46d4a8)==0)
    return result

def surface(addr): return g['surface_names'][read(addr)]
def points(addr,count): return [[read(addr+i*8),read(addr+i*8+4)] for i in range(count)]

def capture(kind,name,inputs,stage_count=5,flags=(1,0,1,1,0),missing=False):
    global active_constructor
    reset(); files.clear(); files['speed.dat']=struct.pack('<II',1,16)
    if not missing: files.update({'save.dat':struct.pack('<i',stage_count),'game.dat':struct.pack('<5i',*flags)})
    ctor,update,dtor,priority = (0x4352d0,0x435370,0x435850,5) if kind=='main' else (0x448930,0x448a20,0x4490e0,6)
    active_constructor=ctor; offset=len(b['allocations']); call(ctor,13 if kind=='main' else 43,update,dtor,priority); active_constructor=None
    node,data=b['allocations'][offset:offset+2]
    initial=snapshot(kind,node,data)
    if kind=='main':
        assets={'background':surface(0x77e018),'title':surface(0x77e020),'actor':[surface(0x77dff0+i*4) for i in range(10)],
                'buttons':[surface(0x77dfc8+i*4) for i in range(6)],'palette':m['palettes'][-1],
                'animations':[[read(a+i*4) for i in range(n)] for a,n in [(0x46dd50,3),(0x46dd60,2),(0x46dd68,2),(0x46dd70,2),(0x46dd78,2)]],
                'sounds':[m['audio_names'][read(a)] for a in [0x77dfe4,0x77dfe8,0x77e024]]}
    else:
        assets={'background':surface(0x78f78c),'actor':[surface(0x78f750+i*4) for i in range(3)],
                'stages':[surface(0x78f7a8+i*4) for i in range(7)],'stageLabels':[surface(0x78f818+i*4) for i in range(7)],
                'stageSelected':[surface(0x78f768+i*4) for i in range(7)], 'minis':[surface(0x78f738+i*4) for i in range(5)],
                'miniSelected':[surface(0x78f7c8+i*4) for i in range(5)],'stagePositions':points(0x4710a0,7),'labelPositions':points(0x471100,7),
                'selectedPositions':points(0x471160,7),'miniPositions':points(0x471138,5),'miniSelectedPositions':points(0x4710d8,5),
                'palette':m['palettes'][-1],'music':m['audio_names'][read(0x78f7dc)],'moveSound':m['audio_names'][read(0x78f798)]}
    trace=[]
    for tick,entry in enumerate(inputs):
        now=entry.get('now',1000+(tick+1)*1000//30); clock(now)
        for key,addr in KEYS.items():write(addr,int(entry.get(key,False)))
        write(0x46d4ac, int(entry.get('draw',True)))
        draws.clear(); m['audio_events'].clear(); m['cd_commands'].clear(); requests.clear()
        call(update,node)
        trace.append({'input':entry,'now':now,'expected':snapshot(kind,node,data),'draws':list(draws),'sounds':list(m['audio_events']),'cd':list(m['cd_commands']),'requests':list(requests)})
        if trace[-1]['expected']['removed'] or trace[-1]['expected']['quit']:break
    call(dtor,node)
    print(kind,name,len(trace),flush=True)
    return assets,{'name':name,'stageCount':stage_count,'flags':flags,'missing':missing,'initial':initial,'trace':trace}

if __name__ == '__main__':
    traces={'main':[],'select':[]}; assets={}
    inputs=[{} for _ in range(6050)]
    assets['main'],t=capture('main','natural',inputs); traces['main'].append(t)
    for choice in range(3):
        inputs=[{}, {'up':True},{'up':True},{}]+sum(([{'down':True},{'down':True},{}] for _ in range(choice)),[])+[{'enter':True},{'enter':True},{}]
        _,t=capture('main',f'choice-{choice}',inputs); traces['main'].append(t)
    _,t=capture('main','time-jumps',[{'now':x} for x in [11000,11001,21000,21001,31000,31001,201001]+[301001]*24]); traces['main'].append(t)
    for count in [1,3,4,5,7,9]:
        inputs=[{}]+sum(([{key:True},{key:True},{}] for key in ['left','right','right','down','down','up','right','left']),[])+[{'enter':True}]
        assets['select'],t=capture('select',f'stages-{count}',inputs,count); traces['select'].append(t)
    for flags in [(0,0,0,0,0),(1,0,1,1,0),(0,0,0,0,1),(1,1,1,1,1)]:
        inputs=[{}]+sum(([{key:True},{key:True},{}] for key in ['space','up','down','down','down','up','space','space']),[])+[{'enter':True}]
        _,t=capture('select','minis-'+''.join(map(str,flags)),inputs,flags=flags);traces['select'].append(t)
    for i in range(5):
        _,t=capture('select',f'launch-mini-{i}',[{}, {'space':True},{},{'enter':True}],flags=tuple(int(j==i) for j in range(5)));traces['select'].append(t)
    for name,inp,missing in [('back',[{}, {'back':True}],False),('missing',[{}, {'down':True},{'space':True}],True),('held-on-entry',[{'right':True},{'space':True},{},{'space':True}],False),('music',[{'now':1000},{'now':27000,'draw':False},{'now':27001},{'now':27002}],False)]:
        _,t=capture('select',name,inp,missing=missing);traces['select'].append(t)
    root=b['base']['ROOT']
    (root/'web/menu-data.js').write_text('// Original main menu 0x435370 and stage/minigame selector 0x448a20.\nexport const MENU = '+json.dumps(assets,separators=(',',':'))+';\n')
    (root/'test/fixtures/original-menus.json').write_text(json.dumps(traces,separators=(',',':'))+'\n')
    print(assets,flush=True)
