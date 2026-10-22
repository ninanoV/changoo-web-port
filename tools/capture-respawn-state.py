"""Audit same-stage map reload globals and priority-6/7 cleanup with native companions."""
import hashlib
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE

a=runpy.run_path(str(Path(__file__).with_name('capture-atlas-support.py')))
g,b,cpu,read,write,call=(a[k] if k in a else a['graphics'][k] for k in ['graphics','base','cpu','read','write','call'])
P,N,C=(b[k] for k in ['PLAYER','NODE','CAMERA'])
reader=runpy.run_path(str(Path(__file__).with_name('capture-map-support.py')))
loads=reader['install_map_reader'](g)
# Object factories are separately audited; this capture preserves map reader/reset instructions.
for addr in [0x426380,0x427610]:cpu.hook_add(UC_HOOK_CODE,lambda uc,*_:g['return_from'](uc),begin=addr,end=addr)
guards={'118':0x45cfd8,'65':0x47060c,'117':0x46dee4,'70':0x46fd1c,'71':0x46d27c,'72':0x46111c,'74':0x470c60,
        'boss2Intro':0x45c044,'boss2Death':0x46e908,'76':0x46cca0,'77':0x460cb4,'85':0x4602ec,'86':0x46fff8,
        '107':0x46f850,'108':0x46cef0,'109':0x460d78,'110':0x45bbf4,'111':0x47096c,
        '113':0x4605b4,'114':0x471bc0,'115':0x47022c,'116':0x46d684}
# All these are retained raw globals; the counters at45c330/334 instead reset on every read.
tracked={**guards,'pairedBossesRemaining':0x45c0a8,'finalBossesRemaining':0x46c500,'pickupCount':0x45c330,'enemyCount':0x45c334,'randomSeed':0x471d70,'cardCursor':0x4602a0,'cardMusicAt':0x78f788,'puzzleBlank':0x4613c4,'puzzleReady':0x478b44}
rows=[]
for stage,name in enumerate(['stage1.map','stage2.map','shoot.map','stage3.map','stage4.map','stage5.map','stage6.map']):
    for priority in range(10):write(0x1601000+priority*64+24,0);write(0x471920+priority*4,1)
    b['player']();write(0x461428,stage);write(0x46142c,stage);write(0x46d4ac,0)
    for addr in tracked.values():write(addr,1)
    write(0x45c330,7);write(0x45c334,8);write(0x471d70,123);loads.clear()
    for i in range(18):write(0x4601a8+i*4,17-i)
    for i in range(9):write(0x461378+i*4,7-i)
    before={key:read(addr) for key,addr in tracked.items()}
    call(0x427900,instruction_limit=20000000,timeout=15000000)
    after={key:read(addr) for key,addr in tracked.items()}
    raw=g['resources'][name];width=int.from_bytes(raw[:4],'little');height=int.from_bytes(raw[4:8],'little')
    actual=b''.join(bytes(cpu.mem_read(0x478be8+y*15000,width*10)) for y in range(height))
    assert actual==raw[8:]
    rows.append({'stage':stage+1,'map':name,'before':before,'after':after,'stageCallbacks':list(loads),'mapHash':hashlib.sha256(actual).hexdigest(),'cardOrder':[read(0x4601a8+i*4) for i in range(18)],'puzzleBoard':[read(0x461378+i*4) for i in range(9)]})
    print('reload',stage+1,flush=True)
call(0x4059c0);call(0x439440)
party=[]
specs=[('mother',0x417c20,0x417f00,0x418160,0x36),('mother-double',0x417c20,0x417d20,0x418160,0x36),
       ('father',0x44e660,0x44e760,0x44e920,0x34),('sister',0x422c10,0x422d10,0x422f90,0x37),
       ('friend',0x4168a0,0x4169a0,0x416ac0,0x33),('hero',0x446f20,0x447020,0x447100,0x38)]
for name,ctor,update,dtor,code in specs:
    for priority in range(10):write(0x1601000+priority*64+24,0)
    write(0x1601404,0);write(0x1601504,0);b['player']();write(C+4,6400);write(C+8,2719)
    offset=len(b['allocations']);call(ctor,code,update,dtor,6)
    node,data=b['allocations'][offset:offset+2]
    dog_offset=len(b['allocations']);call(0x439500,0x35,0x4395f0,0x4397c0,8,10,400)
    dog_node,dog_data=b['allocations'][dog_offset:dog_offset+2]
    cpu.mem_write(node+1,b'\0');cpu.mem_write(dog_node+1,b'\0')
    call(0x44d440,6);call(0x44d440,7)
    flags={'companionRemoved':cpu.mem_read(node+1,1)[0]==2,'dogRemoved':cpu.mem_read(dog_node+1,1)[0]==2}
    call(dtor,node)
    party.append({'name':name,**flags,'busyAfterCleanup':read(0x46cda8),'dogState':read(dog_data+72)})
    print('party',name,flags,flush=True)
# An active dog is in group8 and its state is untouched by same-stage reload.
call(0x43a330,dog_data);write(0x461428,0);write(0x46142c,0)
dog_before=bytes(cpu.mem_read(dog_data,76));busy_before=read(0x46cda8)
call(0x427900,instruction_limit=20000000,timeout=15000000)
active_dog={'unchanged':dog_before==bytes(cpu.mem_read(dog_data,76)),'state':read(dog_data+72),'busyBefore':busy_before,'busyAfter':read(0x46cda8)}
assert active_dog['unchanged']
refusals=[]
for kind,ctor in [('86',0x441b40),('116',0x434110)]:
    write(guards[kind],1);before=len(b['allocations'])
    call(ctor,45,0,0,6)
    refusals.append({'kind':int(kind),'allocations':len(b['allocations'])-before,'guard':read(guards[kind])})
    assert refusals[-1]['allocations']==0
root=b['base']['ROOT']
(root/'test/fixtures/original-respawn-state.json').write_text(json.dumps({'maps':rows,'party':party,'refusals':refusals,'activeDog':active_dog,'scope':'Actual map reader with factories omitted; actual six companion destructors and priority marking; full scheduler/contact cache remains separate.'},separators=(',',':'))+'\n')
