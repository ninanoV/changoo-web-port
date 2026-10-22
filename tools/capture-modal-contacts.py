"""Native scheduler: parent contacts during minigames/inventory and exact resume tick."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_ESP

ROOT=Path(__file__).resolve().parents[1]
rows=[]
for mode in ['car','flag','mole','card','puzzle','inventory','entry','ending','inventory-entry']:
 for scenario in ['enemy','pickup','hazard','projectile','enemy-born','enemy-removed','platform','spring']:
    m=runpy.run_path(str(Path(__file__).with_name('capture-minigame-support.py')))
    g,b,cpu,read,write,call,clock=(m[k] for k in ['graphics','base','cpu','read','write','call','set_clock'])
    P,N,C=(b[k] for k in ['PLAYER','NODE','CAMERA'])
    for loader in [0x4059c0,0x403790,0x43bb70,0x42d5e0,0x42ef30,0x419780,0x434c10]:call(loader)
    for p in range(10):write(0x1601000+p*64+24,0);write(0x471920+p*4,1)
    write(0x1601404,0);write(0x1601504,0)
    player_y=2932 if scenario=='platform' else 2935 if scenario=='spring' else 3032
    b['player'](x=6500,y=player_y);write(P+0x4c,6500);write(P+0x50,player_y)
    if scenario=='spring':write(P+0x58,5)
    for i,v in enumerate([24,65,50,71]):write(0x476288+i*4,v)
    cpu.mem_write(0x16003a0,b'\xc3')  # The synthetic player storage is not heap-owned.
    write(N+4,0x405cf0);write(N+8,0x16003a0);write(N+20,0x1601200);write(N+24,0);write(0x1601218,N);cpu.mem_write(N+1,b'\0')
    write(C+4,6400);write(C+8,2719);write(0x46d4ac,1)
    call(0x434b40,N,P+44,P+8,P+12,0x4098f0);call(0x431050,N,P+44,P+8,P+12,0x40d4c0)
    enemy_node=enemy_data=None
    if scenario in ['enemy','projectile','enemy-born','enemy-removed']:
        enemy_node,enemy_data=b['create'](0,6508,3032);cpu.mem_write(enemy_node+1,bytes([1 if scenario=='enemy-born' else 2 if scenario=='enemy-removed' else 0]))
    if scenario=='pickup':
        item,_=b['create'](10,6508,3032);cpu.mem_write(item+1,b'\0')
    surface_node=surface_data=None
    if scenario in ['platform','spring']:
        offset=len(b['allocations'])
        if scenario=='platform':call(0x4197e0,62,0x419970,0x419af0,6,6499,3000,4)
        else:call(0x434cf0,64,0x434dc0,0x434ef0,6,6500,3000,9)
        surface_node,surface_data=b['allocations'][offset:offset+2];cpu.mem_write(surface_node+1,b'\0')
        if scenario=='platform':call(0x419970,surface_node)
    def surface_values():
        if surface_data is None:return None
        spring=scenario=='spring'
        fields={'x':4,'y':8,'oldX':64 if spring else 44,'oldY':68 if spring else 48,'vx':72 if spring else 52,'vy':76 if spring else 56,'state':80 if spring else 60}
        if spring:fields.update(frame=32,ticks=36,period=44,frameCount=40)
        return {key:read(surface_data+off) for key,off in fields.items()}
    if scenario=='projectile':
        offset=len(b['allocations']);call(0x42d640,65,0x42d730,0x42d7c0,7,6540,3068,0)
        cpu.mem_write(b['allocations'][offset]+1,b'\0')
    for ctor,code,update,dtor in [(0x430fd0,3,0x431000,0x4310f0),(0x434a20,2,0x434a50,0x434be0)]:
        offset=len(b['allocations']);call(ctor,code,update,dtor,9);cpu.mem_write(b['allocations'][offset]+1,b'\0')
    active_hazard=scenario=='hazard'
    def terrain(uc,addr,*_):
        if active_hazard and read(uc.reg_read(UC_X86_REG_ESP)+4)==P+44:
            uc.reg_write(UC_X86_REG_EAX,5 if addr==0x431130 else 0);g['return_from'](uc)
    for address in [0x431130,0x431d60]:cpu.hook_add(UC_HOOK_CODE,terrain,begin=address,end=address)
    inventory_offset=None;node=data=None
    def inventory_created(uc,*_):
        global inventory_offset
        inventory_offset=len(b['allocations'])
    if mode=='inventory-entry':cpu.hook_add(UC_HOOK_CODE,inventory_created,begin=0x42eff0,end=0x42eff0)
    else:
        for p in ([6,7,8] if mode=='inventory' else [2,6,7,8]):write(0x471920+p*4,0)
        write(0x78f75c,1);write(0x46cd04,0)
        ctor,update,dtor={'car':(0x401d10,0x401de0,0x4021e0),'flag':(0x41ba30,0x41bb00,0x41c240),'mole':(0x43d120,0x43d400,0x43d9c0),
          'card':(0x41c810,0x41c920,0x41ced0),'puzzle':(0x4245a0,0x4246a0,0x4249e0),'inventory':(0x42eff0,0x42f060,0x42f510),
          'entry':(0x43fdf0,0x43fe50,0x440000),'ending':(0x449350,0x4493e0,0x449570)}[mode]
        clock(1000);offset=len(b['allocations']);call(ctor,22 if mode=='inventory' else 14 if mode in ['entry','ending'] else 43,update,dtor,9 if mode=='inventory' else 5)
        node,data=b['allocations'][offset:offset+2];cpu.mem_write(node+1,b'\0')
        if mode=='ending':g['surface_names'][read(0x78f8a8)]='airplane.app'
    initial=b['player_values']();trace=[]
    for tick in range(1,13):
        now=1000+tick*1000//30;clock(now)
        for addr in [0x46d4b0,0x46d4b4,0x46d4b8,0x46d4bc,0x46d4e8,0x46d4ec,0x46d4d8,0x46d4f0,0x46d4dc]:write(addr,0)
        if mode in ['inventory','inventory-entry']:write(0x46d4ec,int(tick==5 or mode=='inventory-entry' and tick==1))
        if tick==6:
            if mode=='car':write(0x45bb30,193)
            if mode=='flag':write(0x45fff0,0)
            if mode=='card':write(0x4602c4,0)
            if mode=='puzzle':write(0x4613cc,1)
            if mode=='mole':write(0x46d4dc,1)
            if mode in ['entry','ending','inventory-entry']:write(0x46d4e8,1)
            active_hazard=False
        m['audio_events'].clear();m['cd_commands'].clear()
        call(0x44d3a0)
        if node is None and inventory_offset is not None:node,data=b['allocations'][inventory_offset:inventory_offset+2]
        trace.append({'now':now,'player':{**b['player_values'](),'onPlatform':bool(read(P+100))},'surface':surface_values(),'hazard':bool(read(P+0xb4)),
                      'enemy':b['enemy_values'](0,enemy_node,enemy_data) if enemy_node else None,
                      'flags':[read(0x471920+p*4) for p in range(10)],'finished':node is not None and cpu.mem_read(node+1,1)[0]==2,
                      'sounds':list(m['audio_events'])})
    rows.append({'mode':mode,'scenario':scenario,'initial':initial,'trace':trace})
    print(mode,scenario,trace[-1]['player']['state'],trace[-1]['player']['ticks'],trace[-1]['finished'],flush=True)
(ROOT/'test/fixtures/original-modal-contacts.json').write_text(json.dumps(rows,separators=(',',':'))+'\n')
