"""Original options, scroll, automatic/manual speed menus and speed.dat I/O."""
import json
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ESP
m=runpy.run_path(str(Path(__file__).with_name('capture-menus.py')))
g,b,cpu,read,write,call,draws,clock=(m[k] for k in ['g','b','cpu','read','write','call','draws','clock'])
ns=m['transition'].__globals__
mini=m['m']
calibration_elapsed=0

def measured_clock(uc,addr,*_):
    sp=uc.reg_read(UC_X86_REG_ESP)
    if read(sp) in [0x435a03,0x42fb83,0x421503]: uc.reg_write(UC_X86_REG_EAX,1000+calibration_elapsed)
# GetTickCount return sites are confirmed below for all three benchmark functions.
cpu.hook_add(UC_HOOK_CODE,measured_clock,begin=0x1600300,end=0x1600300)
addresses={'options':(0x44ade0,0x44ae60,0x44af70),'speed':(0x42f920,0x42f9a0,0x42fae0),'scroll':(0x440540,0x4405c0,0x4406c0),'slider':(0x421230,0x4212c0,0x421450)}

def state(node,data):
    return {'selection':read(data+40),'enterHeld':read(data+52),'removed':cpu.mem_read(node+1,1)[0]==2,
            'factor':read(0x46d584),'delay':read(0x461418),'scroll':read(0x46f880),'saveSpeed':read(0x471518),'boost':read(0x46daf8)}

assets,rows={},[]
for kind in addresses:
    cases=[('idle',[{}]*3),('first',[{'enter':True},{'enter':True},{}]),('second',[{'right':True,'down':True},{'enter':True},{}]),('back',[{'back':True}]),('cancel-held',[{'enter':True},{'back':True}]),('both',[{'left':True,'right':True,'up':True,'down':True},{'enter':True},{}])]
    if kind=='slider':cases += [('left-limit',[{'left':True}]*215+[{'enter':True},{}]),('right-limit',[{'right':True}]*215+[{'enter':True},{}])]
    if kind in ['slider','speed']:cases += [(f'calibrate-{ms}',[{'enter':True},{}]) for ms in [499,500,1199,1200]]
    for name,inputs in cases:
        m['reset'](); write(0x46f880,1);write(0x46daf8,1)
        calibration_elapsed=int(name.split('-')[-1]) if name.startswith('calibrate-') else 0
        ctor,update,dtor=addresses[kind]
        ns['active_constructor']=ctor;offset=len(b['allocations']);call(ctor,13,update,dtor,5);ns['active_constructor']=None
        node,data=b['allocations'][offset:offset+2]
        initial=state(node,data)
        sf=m['surface']
        if kind=='slider':assets[kind]={'background':sf(0x4785e0),'labels':[sf(0x4785d8),sf(0x4785dc)],'bar':sf(0x4785e4),'fill':sf(0x4785c8),'confirm':mini['audio_names'][read(0x4785d4)]}
        else:
            bg,start={'options':(0x78fbc8,0x78fbc0),'speed':(0x77d458,0x77d450),'scroll':(0x78da68,0x78da60)}[kind]
            assets[kind]={'background':sf(bg),'choices':[sf(start+i*4) for i in range(2)]}
            if kind=='speed':assets[kind]['confirm']=mini['audio_names'][read(0x77d448)]
        trace=[]
        for input in inputs:
            clock(1000)
            for key,addr in m['KEYS'].items():write(addr,int(input.get(key,False)))
            draws.clear();mini['audio_events'].clear();mini['cd_commands'].clear();m['requests'].clear()
            call(update,node)
            trace.append({'input':input,'state':state(node,data),'draws':list(draws),'sounds':list(mini['audio_events']),'cd':list(mini['cd_commands']),'requests':list(m['requests'])})
            if trace[-1]['state']['removed']:break
        call(dtor,node)
        rows.append({'kind':kind,'name':name,'elapsed':calibration_elapsed,'initial':initial,'trace':trace})
        print(kind,name,len(trace),flush=True)

# Execute the actual main loader for missing, read, and write paths.
file_rows=[]
for saved in [None,[1,16],[2,32],[3,48],[1,0],[2,209]]:
    for save in [False,True]:
        m['reset'](); m['files'].clear(); calibration_elapsed=0
        if saved is not None:m['files']['speed.dat']=struct.pack('<2i',*saved)
        write(0x471518,int(save));write(0x46d584,2);write(0x461418,51)
        call(0x435000)
        file_rows.append({'saved':saved,'save':save,'factor':read(0x46d584),'delay':read(0x461418),'io':list(m['io_events']),
                          'result':list(struct.unpack('<2i',m['files']['speed.dat'])) if 'speed.dat' in m['files'] else None})
root=b['base']['ROOT']
(root/'web/settings-data.js').write_text('// Original settings 0x44ae60/0x42f9a0/0x4405c0/0x4212c0.\nexport const SETTINGS = '+json.dumps(assets,separators=(',',':'))+';\n')
(root/'test/fixtures/original-settings.json').write_text(json.dumps({'assets':assets,'traces':rows,'files':file_rows},separators=(',',':'))+'\n')
print(assets,flush=True)
