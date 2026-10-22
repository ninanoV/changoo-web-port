"""Native camera, real map factories, inventory and parent contacts in one scheduler."""
import json
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP,UC_X86_REG_EAX
ROOT=Path(__file__).resolve().parents[1]
rows=[]
for scenario,mode in [('inventory-a',0),('inventory-b',1),('inventory-platform',0)]:
    m=runpy.run_path(str(Path(__file__).with_name('capture-minigame-support.py')))
    g,b,cpu,read,write,call,clock=(m[k] for k in ['graphics','base','cpu','read','write','call','set_clock'])
    P,N,C=(b[k] for k in ['PLAYER','NODE','CAMERA'])
    for loader in [0x4059c0,0x403790,0x445b50,0x438bc0,0x43bb70,0x414530,0x435d70,0x419780,0x434c10,0x41aa70,0x44ab50,0x42ef30]:call(loader)
    for kind,name in enumerate((ROOT/'Changoo (E)/RESOURCE/CHAR.CFG').read_text().split()):
        cpu.mem_write(0x18f2000,name.replace('.raw','.app').encode()+b'\0');write(0x461430+kind*4,call(0x4402c0,0x18f2000))
    raw=g['resources']['stage1.map'];width,height=struct.unpack_from('<II',raw)
    if scenario=='inventory-platform':cpu.mem_write(0x478be8+89*15000+194*10+4,struct.pack('<3h',4,8,11))
    for priority in range(10):write(0x1601000+priority*64+24,0);write(0x471920+priority*4,1)
    write(0x1601404,0);write(0x1601504,0)
    x,y=5700,2719;px,py=(6300,3032) if mode else (6200,2800 if scenario=='inventory-platform' else 3032)
    b['player'](x=px,y=py);write(P+76,px);write(P+80,py);write(P+68,px-x);write(P+72,py-y)
    for i,v in enumerate([24,65,50,71]):write(0x476288+i*4,v)
    for address,value in [(0x77bf44,width),(0x77bf54,height),(0x461428,0),(0x46142c,0),(0x461418,0),(0x46d584,1),(0x46daf8,0),(0x46141c,0),(0x46f880,mode)]:write(address,value)
    for address in [0x478bd4,0x478bd8,0x478bdc]:write(address,0x1600000)
    for off,v in {4:x,8:y,12:x//32,16:y//32,20:x%32,24:y%32,44:0,68:width,72:height}.items():write(C+off,v)
    call(0x427ee0 if mode else 0x427eb0,C)
    cpu.mem_write(0x16003a0,b'\xc3');camera_node=call(0x44d300,2)
    for off,v in {4:0x424e00,8:0x16003a0,12:C}.items():write(camera_node+off,v)
    write(N+4,0x405cf0);write(N+8,0x16003a0);write(N+20,0x1601200);write(N+24,0);write(0x1601218,N)
    call(0x434b40,N,P+44,P+8,P+12,0x4098f0);call(0x431050,N,P+44,P+8,P+12,0x40d4c0)
    for ctor,code,update,dtor in [(0x430fd0,3,0x431000,0x4310f0),(0x434a20,2,0x434a50,0x434be0)]:call(ctor,code,update,dtor,9)
    current_factory=None;records=[];return_hooks={}
    def factory_done(*_):
        global current_factory
        current_factory=None
    def factory_begin(uc,address,*_):
        global current_factory
        sp=uc.reg_read(UC_X86_REG_ESP);column,row=read(C+12)+read(sp+4),read(C+16)+read(sp+8)
        if column<0 or row<0 or column>=1500 or row>=210:current_factory=None;return
        kind=struct.unpack('<h',cpu.mem_read(0x478be8+row*15000+column*10+4,2))[0]
        current_factory={'kind':kind,'column':column,'row':row}
        ret=read(sp)
        if ret not in return_hooks:return_hooks[ret]=cpu.hook_add(UC_HOOK_CODE,factory_done,begin=ret,end=ret)
    def node_created(uc,*_):
        if current_factory is None or current_factory['kind']<0:return
        priority=read(uc.reg_read(UC_X86_REG_ESP)+4)
        if priority in [6,7]:records.append({**current_factory,'node':uc.reg_read(UC_X86_REG_EAX)})
    for address in [0x426380,0x427610]:cpu.hook_add(UC_HOOK_CODE,factory_begin,begin=address,end=address)
    cpu.hook_add(UC_HOOK_CODE,node_created,begin=0x44d36b,end=0x44d36b)
    for dy in range(-15,31):
        for dx in range(-20,41):call(0x427610,dx,dy,C);current_factory=None
    for dy in range(16):
        for dx in range(21):call(0x426380,dx,dy,C);current_factory=None
    inventory_node=None
    if scenario!='inventory-platform':
        for priority in [6,7,8]:write(0x471920+priority*4,0)
        offset=len(b['allocations']);call(0x42eff0,22,0x42f060,0x42f510,9);inventory_node=b['allocations'][offset]
    for priority in range(10):
        node=read(0x1601000+priority*64+24)
        while node:cpu.mem_write(node+1,b'\0');node=read(node+24)
    def snapshot():
        result=[]
        for record in records:
            node=record['node'];data=read(node+12)
            value={k:record[k] for k in ['kind','column','row']}
            value.update(x=read(data+4),y=read(data+8),removed=cpu.mem_read(node+1,1)[0]==2)
            if record['kind']==1:value.update(b['enemy_values'](1,node,data))
            result.append(value)
        return {'player':{**b['player_values'](),'screenX':read(P+68),'screenY':read(P+72),'oldX':read(P+76),'oldY':read(P+80),'onPlatform':bool(read(P+100))},
                'camera':{**{key:read(C+offset) for key,offset in [('x',4),('y',8),('column',12),('row',16),('offsetX',20),('offsetY',24)]},'scrollMotion':read(0x46141c)},'objects':result}
    initial=snapshot();trace=[]
    for tick in range(120):
        now=1000+tick*17;clock(now);write(0x46d4ac,1)
        enter=tick==79 or scenario=='inventory-platform' and tick==0
        write(0x46d4ec,int(enter));m['audio_events'].clear()
        call(0x44d3a0)
        trace.append({'now':now,'input':{'enter':enter},**snapshot(),'sounds':list(m['audio_events'])})
    rows.append({'scenario':scenario,'mode':mode,'start':[px,py,x,y],'initial':initial,'trace':trace})
    print(scenario,len(records),trace[-1]['camera'],flush=True)
(ROOT/'test/fixtures/original-camera-world.json').write_text(json.dumps({'traces':rows,'scope':'Actual camera, stage1 factories and collision managers; synthetic checkpoint/player storage and GPU/audio transport. Inventory camera A/B and platform entry/exit.'},separators=(',',':'))+'\n')
