"""Capture native startup logos and game-over screen, palette boundaries and menu return."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
m=runpy.run_path(str(Path(__file__).with_name('capture-minigame-support.py')))
g,b,cpu,read,write,call,draws,clock=(m[k] for k in ['graphics','base','cpu','read','write','call','draws','set_clock'])
requests=[]
def menu(uc,*_):requests.append({'target':'main','stage':0});g['return_from'](uc)
cpu.hook_add(UC_HOOK_CODE,menu,begin=0x43f1d0,end=0x43f1d0)
assets,traces={},[]
for kind,ctor,update,dtor in [('opening',0x421b90,0x421bf0,0x421d60),('gameover',0x44d790,0x44d800,0x44d8e0)]:
 for strategy in (['natural','all-keys','no-draw'] if kind=='opening' else ['natural','space-release','space-held','enter-ignored','boundary']):
    for p in range(10):write(0x1601000+p*64+24,0);write(0x471920+p*4,1)
    for addr in [0x790394,0x790398,0x46d4e8,0x46d4ec,0x46d4f0]:write(addr,0)
    m['cd_commands'].clear();m['audio_events'].clear();m['palettes'].clear();clock(1000)
    offset=len(b['allocations']);call(ctor,11 if kind=='opening' else 45,update,dtor,5)
    node,data=b['allocations'][offset:offset+2]
    if kind=='opening':assets[kind]={'images':[g['surface_names'][read(0x478708+i*4)] for i in range(2)],'palettes':[]}
    else:assets[kind]={'image':g['surface_names'][read(0x79038c)],'palette':'shin.pal','startCd':list(m['cd_commands'])}
    trace=[]
    for tick in range(1,600):
        now=1000+tick*1000//30
        if strategy=='boundary':now=[1000,15000,15001][tick-1]
        space=strategy in ['all-keys','space-held'] or strategy=='space-release' and tick in [1,2]
        enter=strategy in ['all-keys','enter-ignored']
        write(0x46d4e8,int(space));write(0x46d4ec,int(enter));write(0x46d4f0,int(strategy=='all-keys'));write(0x46d4ac,int(strategy!='no-draw'))
        clock(now);draws.clear();requests.clear();m['audio_events'].clear();m['cd_commands'].clear();m['palettes'].clear()
        call(update,node)
        expected={'ticks':read(data+(20 if kind=='opening' else 16)),'removed':cpu.mem_read(node+1,1)[0]==2}
        if kind=='opening':expected['phase']=read(data+16)
        else:expected.update(spaceHeld=read(0x471b4c),startedAt=read(0x790394),now=read(0x790398))
        if kind=='opening' and m['palettes']:assets[kind]['palettes'].extend(m['palettes'])
        trace.append({'now':now,'input':{'space':space,'enter':enter,'back':strategy=='all-keys','draw':strategy!='no-draw'},'expected':expected,'draws':list(draws),'palettes':list(m['palettes']),'sounds':list(m['audio_events']),'cd':list(m['cd_commands']),'requests':list(requests)})
        if expected['removed']:break
    assert expected['removed']
    call(dtor,node);traces.append({'kind':kind,'strategy':strategy,'trace':trace});print(kind,strategy,len(trace),flush=True)
root=b['base']['ROOT']
(root/'web/title-scene-data.js').write_text('// Original boot 0x421bf0 and game over 0x44d800.\nexport const TITLE_SCENES = '+json.dumps(assets,separators=(',',':'))+';\n')
(root/'test/fixtures/original-title-scenes.json').write_text(json.dumps({'assets':assets,'traces':traces},separators=(',',':'))+'\n')
print(assets,flush=True)
