"""Run the entire native camera update and record display/queued offsets and factory scan order."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP
m=runpy.run_path(str(Path(__file__).with_name('capture-minigame-support.py')))
g,b,cpu,read,write,call,clock=(m[k] for k in ['graphics','base','cpu','read','write','call','set_clock'])
P,C=b['PLAYER'],b['CAMERA'];N=0x1405000;write(N+12,C)
for address in [0x478bd4,0x478bd8,0x478bdc]:write(address,0x1600000)
scans=[];factory_effect=None
def factory(uc,address,*_):
    sp=uc.reg_read(UC_X86_REG_ESP);x,y=read(sp+4),read(sp+8)
    scans.append({'secondary':address==0x427610,'column':read(C+12)+x,'row':read(C+16)+y})
    if factory_effect=='stop':write(0x461754,1)
    if factory_effect=='mode-a':
        for off,v in [(64,0),(48,170),(52,470),(56,240),(60,280)]:write(C+off,v)
    g['return_from'](uc)
for address in [0x426380,0x427610]:cpu.hook_add(UC_HOOK_CODE,factory,begin=address,end=address)
fields={'x':4,'y':8,'column':12,'row':16,'offsetX':20,'offsetY':24}
def values():return {**{k:read(C+o) for k,o in fields.items()},'scrollMotion':read(0x46141c)}
cases=[('right',0,0,False),('left',0,0,False),('fall',0,0,False),('inventory',0,0,True),('inventory-far',0,0,True),
       ('inventory-low',0,0,True),('stepped-right',1,0,False),('stepped-left',1,0,False),('edge',0,0,False),('stepped-edge',1,0,False),
       ('flight',0,2,False),('flight-b',1,2,False),('flight-stop',0,2,False),('switch-mode',0,0,False),('cold-start',0,0,False),('flight-scan-stop',0,2,False),('stepped-right-force-a',1,0,False)]
traces=[]
for name,mode,stage,frozen in cases:
    factory_effect='stop' if name=='flight-scan-stop' else 'mode-a' if name=='stepped-right-force-a' else None
    width,height=1000,210
    x,y=(31359,6239) if 'edge' in name else (0,0) if name=='cold-start' else (1000,1000)
    for offset in range(0,76,4):write(C+offset,0)
    for key,offset in fields.items():write(C+offset,{'x':x,'y':y,'column':x//32,'row':y//32,'offsetX':x%32,'offsetY':y%32}[key])
    for address,value in [(0x77bf44,width),(0x77bf54,height),(C+68,width),(C+72,height),(0x461428,stage),(0x461754,int(name=='flight-stop')),(0x461418,0),(0x46d584,1),(0x46daf8,0),(0x46141c,0)]:write(address,value)
    call(0x427ee0 if mode else 0x427eb0,C)
    px=x+(600 if 'right' in name or 'far' in name or 'edge' in name else 20 if 'left' in name else 200)
    py=y+(450 if name in ['fall','inventory-low'] else 250)
    if name=='cold-start':px=py=0
    screen_x,screen_y=(0,0) if name=='cold-start' else (px-x,py-y)
    initial=values();frames=[]
    for tick in range(120):
        if name=='switch-mode' and tick in [40,80]:mode=int(tick==40);call(0x427ee0 if mode else 0x427eb0,C)
        vx=-7 if 'left' in name else 7 if 'right' in name else 0
        for offset,value in {8:px,12:py,16:76,20:72,0x54:vx,0x88:int(vx>=0),0x44:screen_x,0x48:screen_y}.items():write(P+offset,value)
        draw=tick%3!=0;write(0x46d4ac,int(draw));clock(1000+tick*17);scans.clear()
        player={'x':px,'y':py,'vx':vx,'facing':int(vx>=0),'width':76,'height':72,'screenX':screen_x,'screenY':screen_y}
        call(0x424e00,N)
        frames.append({'player':player,'scrollMode':mode,'draw':draw,'expected':values(),'scans':list(scans),'afterMode':read(C+64),'flightStopped':bool(read(0x461754))})
        mode=read(C+64)
        if not frozen:screen_x,screen_y=px-read(C+4),py-read(C+8)
        if not frozen:
            px+=vx
            if name=='fall':py+=11
            if name=='cold-start':py+=min(tick+1,11)
    traces.append({'name':name,'stage':stage+1,'map':{'width':width,'height':height},'initialMode':cases[len(traces)][1],
                   'flightStopped':name=='flight-stop','factoryEffect':factory_effect,'initial':initial,'trace':frames})
    print(name,frames[-1]['expected'],flush=True)
factory_effect=None
for hook in m['io_hooks']:cpu.hook_del(hook)
reader=runpy.run_path(str(Path(__file__).with_name('capture-map-support.py')))
reader['install_map_reader'](g)
initial_scans=[]
for stage in range(7):
    write(0x461428,stage);write(0x46142c,stage);scans.clear()
    call(0x427900,instruction_limit=20000000,timeout=15000000)
    initial_scans.append({'stage':stage+1,'map':{'width':read(0x77bf44),'height':read(0x77bf54)},'camera':values(),'scans':list(scans)})
    print('initial',stage+1,len(scans),flush=True)
requeues=[]
for occupied in [-1,45,6]:
    cell=0x478be8+75*15000+101*10
    cpu.mem_write(cell+4, __import__('struct').pack('<3h',occupied,12,13))
    call(0x4262e0,3217,2400,64,23,3)
    requeues.append({'occupied':occupied,'input':{'x':3217,'y':2400,'width':64,'height':23,'kind':3},'cell':[101,75],
                     'result':list(__import__('struct').unpack('<3h',cpu.mem_read(cell+4,6)))})
profiles=[]
for preference in [0,1]:
    for name,setter in [('flight',0x40dbb0),('booster',0x40dc40),('normal',0x40dbf0)]:
        b['player']();write(P+60,call(0x434b40,b['NODE'],P+44,P+8,P+12,0x4098f0))
        write(0x77bf48,C);write(0x46f880,preference)
        call(0x427ee0 if preference else 0x427eb0,C);call(setter,P)
        profiles.append({'name':name,'preference':preference,'mode':read(C+64),'upper':read(C+56)})
    b['player']();write(0x46fd1c,0);write(0x46f880,preference)
    call(0x427ee0 if preference else 0x427eb0,C)
    offset=len(b['allocations']);call(0x4416e0,46,0x4417a0,0x4418a0,6)
    event_node=b['allocations'][offset]
    profiles.append({'name':'dialogue70','preference':preference,'mode':read(C+64),'upper':read(C+56)})
    call(0x4418a0,event_node)
reloads=[]
for motion in [0,1,2]:
    write(0x461428,0);write(0x46142c,0);write(0x46141c,motion);call(0x427ee0,C)
    for off,v in [(4,6500),(8,2719),(12,203),(16,84),(20,4),(24,31)]:write(C+off,v)
    before=values();call(0x427900,instruction_limit=20000000,timeout=15000000)
    reloads.append({'before':before,'after':values(),'mode':read(C+64)})
root=b['base']['ROOT']
(root/'test/fixtures/original-camera-runtime.json').write_text(json.dumps({'traces':traces,'initialScans':initial_scans,'requeues':requeues,'profiles':profiles,'reloads':reloads,'scope':'Entire native 0x424e00 camera update. Factory calls recorded without executing objects; GPU surfaces and clock are virtualized.'},separators=(',',':'))+'\n')
