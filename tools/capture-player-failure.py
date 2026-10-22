"""Capture damage deaths and hazard respawn with original player and map reader."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE

a=runpy.run_path(str(Path(__file__).with_name('capture-atlas-support.py')))
g=a['graphics'];b,cpu,read,write,call=(g[k] for k in ['base','cpu','read','write','call'])
P,N,C=(b[k] for k in ['PLAYER','NODE','CAMERA'])
map_support=runpy.run_path(str(Path(__file__).with_name('capture-map-support.py')))
map_loads=map_support['install_map_reader'](g)
requests=[]
def over(uc,*_):requests.append('gameover');g['return_from'](uc)
cpu.hook_add(UC_HOOK_CODE,over,begin=0x44d790,end=0x44d790)
call(0x4059c0)
for pointer in [0x476288,0x47628c,0x476290,0x476294]:write(pointer,{0x476288:24,0x47628c:65,0x476290:50,0x476294:71}[pointer])
def values():
    return {**b['player_values'](),'hazard':bool(read(P+0xb4)),'moveEnabled':bool(read(P+0x100)),
            'oldX':read(P+0x4c),'oldY':read(P+0x50),'removed':cpu.mem_read(N+1,1)[0]==2}
rows=[]
for kind in ['damage','hazard','repeated-hazard']:
 for lives in [1,2]:
    for priority in range(10):write(0x1601000+priority*64+24,0);write(0x471920+priority*4,1)
    b['player'](x=6500,y=3032,invulnerable=17)
    cpu.mem_write(N+1,b'\0');write(0x46d4ac,0);write(0x461428,0);write(0x46142c,0);write(C+4,6400);write(C+8,2719)
    write(P+0x54,5);write(P+0x58,-2);write(P+0x8c,lives);write(P+0xe0,3);write(P+0x70,25);write(P+0x4c,6500);write(P+0x50,3032)
    requests.clear();map_loads.clear();a['sounds'].clear()
    if kind=='damage':call(0x40d7f0,P)
    else:call(0x40d4c0,N,5)
    initial=values();start_sounds=list(a['sounds']);trace=[]
    for tick in range(1,40):
        a['sounds'].clear();requests.clear();map_loads.clear()
        call(0x405cf0,N,instruction_limit=20000000,timeout=15000000)
        if kind=='repeated-hazard' and tick<4:call(0x40d4c0,N,5)
        trace.append({'expected':values(),'sounds':list(a['sounds']),'requests':list(requests),'maps':list(map_loads),'balls':read(P+0xe0)})
        if requests or not read(P+0xb4) and kind!='damage' or kind=='damage' and read(P+0x8c)<lives:break
    rows.append({'kind':kind,'lives':lives,'initial':initial,'startSounds':start_sounds,'trace':trace});print(kind,lives,len(trace),trace[-1]['expected'],flush=True)
# Special movement updates share the game-over constructor but use their own damage states.
for kind,setup,hurt,update in [('flight',0x40dbb0,0x40dad0,0x406ff0),('booster',0x40dc40,0x40db40,0x407380)]:
    for priority in range(10):write(0x1601000+priority*64+24,0);write(0x471920+priority*4,1)
    b['player'](x=6500,y=3032);cpu.mem_write(N+1,b'\0')
    write(C+4,6400);write(C+8,2719);write(C+68,1000);write(C+72,210);write(0x46d4ac,0);write(0x461754,0)
    write(P+60,call(0x434b40,N,P+44,P+8,P+12,0x4098f0))
    write(0x46d4f0,0);write(0x46d4d8,0)
    call(setup,P);call(hurt,P);write(P+0x8c,1)
    initial=values();trace=[]
    for tick in range(30):
        requests.clear();a['sounds'].clear();call(update,N)
        trace.append({'expected':values(),'requests':list(requests)})
        if requests:break
    assert requests==['gameover']
    rows.append({'kind':kind,'initial':initial,'trace':trace});print(kind,len(trace),flush=True)
root=b['base']['ROOT']
(root/'test/fixtures/original-player-failure.json').write_text(json.dumps(rows,separators=(',',':'))+'\n')
