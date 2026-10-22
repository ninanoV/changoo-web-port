"""Capture native main-loop frame skipping and camera wait using controlled clock reads."""
import json
from pathlib import Path
import runpy
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX
m=runpy.run_path(str(Path(__file__).with_name('capture-menus.py')))
cpu,read,write,call,g=(m[k] for k in ['cpu','read','write','call','g'])
updates=[]
def scheduler(uc,*_):updates.append(bool(read(0x46d4ac)));g['return_from'](uc)
cpu.hook_add(UC_HOOK_CODE,scheduler,begin=0x44d3a0,end=0x44d3a0)
write(0x792280,0x1600390);cpu.mem_write(0x1600390,b'\x31\xc0\xc2\x04\x00')
loops=[]
for factor in [1,2,3]:
 for boost in [0,1]:
    write(0x46d584,factor);write(0x46daf8,boost);write(0x46d590,0);write(0x46d4ac,1)
    trace=[]
    for tick in range(12):
        updates.clear();call(0x433890)
        trace.append({'updateDraw':updates[0],'present':bool(read(0x46d4ac)),'counter':read(0x46d590),'divisor':read(0x46d58c)})
    loops.append({'factor':factor,'boost':boost,'trace':trace})
clock_reads=[]
def clock(uc,*_):
    value=clock_reads.pop(0);uc.reg_write(UC_X86_REG_EAX,value)
cpu.hook_add(UC_HOOK_CODE,clock,begin=0x1600300,end=0x1600300)
cpu.hook_add(UC_HOOK_CODE,lambda uc,*_:g['return_from'](uc),begin=0x426220,end=0x426220)
waits=[]
for draw in [0,1]:
 for delay in [0,16,32,48,209]:
    for quantum in [1,10,16]:
        write(0x46d4ac,draw);write(0x461418,delay);write(0x461b48,1000);write(0x461b4c,0)
        clock_reads[:]=[1000+i*quantum for i in range(250)]
        before=len(clock_reads);call(0x4261ad)
        waits.append({'draw':bool(draw),'delay':delay,'quantum':quantum,'lastWait':read(0x461b48),'reads':before-len(clock_reads)})
root=m['b']['base']['ROOT']
(root/'test/fixtures/original-frame-clock.json').write_text(json.dumps({'loops':loops,'waits':waits},separators=(',',':'))+'\n')
print(len(loops)*12,'loop ticks',len(waits),'clock wait cases')
