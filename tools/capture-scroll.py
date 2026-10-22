"""Capture original camera target calculations for both scroll modes (no tile cache)."""
import json
from pathlib import Path
import random
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESI, UC_X86_REG_EIP, UC_X86_REG_ESP
b=runpy.run_path(str(Path(__file__).with_name('capture-original.py')))
cpu,read,write,call,P,C=(b[k] for k in ['cpu','read','write','call','PLAYER','CAMERA'])
write(0x473d20,P); write(0x461428,0);write(0x77bf44,1000);write(0x77bf54,210)
rng=random.Random(1997);rows=[]
for mode in [0,1]:
 for i in range(500):
    x=rng.choice([0,1000*32-641,rng.randrange(1000*32-640)])
    y=rng.choice([0,210*32-481,rng.randrange(210*32-480)])
    player={'x':x+rng.randrange(-100,700),'y':y+rng.randrange(-100,550),'vx':rng.choice([-30,-10,0,10,30]),'facing':i%2}
    motion=i%3 if mode else 0
    for off,v in {4:x,8:y,12:x//32,16:y//32,20:x%32,24:y%32}.items():write(C+off,v)
    call(0x427ee0 if mode else 0x427eb0,C)
    write(0x46141c,motion)
    for off,v in {8:player['x'],12:player['y'],16:76,20:72,0x54:player['vx'],0x88:player['facing'],0x44:player['x']-x,0x48:player['y']-y}.items():write(P+off,v)
    cpu.reg_write(UC_X86_REG_ESI,C);cpu.reg_write(UC_X86_REG_ESP,b['STACK']+0x8000)
    cpu.emu_start(0x425c1f,0x4261ad,count=10000)
    assert cpu.reg_read(UC_X86_REG_EIP)==0x4261ad
    rows.append({'camera':{'x':x,'y':y,'scrollMode':mode,'scrollMotion':motion},'player':player,
                 'expected':{'x':x//32*32+read(C+20),'y':y//32*32+read(C+24),'scrollMotion':read(0x46141c)}})
# Tile cache/factory bodies are omitted; the four offset/column normalization branches execute unchanged.
for source,target in [(0x425100,0x425328),(0x42534a,0x42556b),(0x425597,0x4257bd),(0x4257df,0x425a7c)]:
    cpu.hook_add(UC_HOOK_CODE,lambda uc,a,z,t:uc.reg_write(UC_X86_REG_EIP,t),user_data=target,begin=source,end=source)
write(0x46d4ac,0)
sequences=[]
for x,px in [(31359,31900),(1000,1700),(1000,900)]:
    y=1000
    for off,v in {4:x,8:y,12:x//32,16:y//32,20:x%32,24:y%32}.items():write(C+off,v)
    call(0x427ee0,C);write(0x46141c,0)
    trace=[]
    for tick in range(60):
        for off,v in {8:px,12:1250,16:76,20:72,0x54:0,0x88:1,0x44:px-read(C+4),0x48:1250-read(C+8)}.items():write(P+off,v)
        cpu.reg_write(UC_X86_REG_ESI,C);cpu.reg_write(UC_X86_REG_ESP,b['STACK']+0x8000)
        cpu.emu_start(0x4250d4,0x4261ad,count=10000)
        assert cpu.reg_read(UC_X86_REG_EIP)==0x4261ad
        trace.append({'x':read(C+12)*32+read(C+20),'y':read(C+16)*32+read(C+24),'scrollMotion':read(0x46141c)})
    sequences.append({'camera':{'x':x,'y':y,'scrollMode':1,'scrollMotion':0},'player':{'x':px,'y':1250,'vx':0,'facing':1},'trace':trace})
(b['ROOT']/'test/fixtures/original-scroll-sequences.json').write_text(json.dumps(sequences,separators=(',',':'))+'\n')
(b['ROOT']/'test/fixtures/original-scroll.json').write_text(json.dumps(rows,separators=(',',':'))+'\n')
print(len(rows),'native camera calculations')
