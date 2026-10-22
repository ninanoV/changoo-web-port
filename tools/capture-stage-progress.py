"""Capture 0x43ee50's high-water stage save, substituting only scene construction."""
import json
from pathlib import Path
import runpy
import struct
from unicorn import UC_HOOK_CODE

m = runpy.run_path(str(Path(__file__).with_name('capture-menus.py')))
cpu,read,write,call,files,events,g = (m[k] for k in ['cpu','read','write','call','files','io_events','g'])
for addr in [0x4337b0,0x43e930,0x43e9c0,0x43ea90,0x43eb40,0x43ebd0,0x43ec70,0x43ed60,0x40dbb0,0x40dc40]:
    cpu.hook_add(UC_HOOK_CODE,lambda uc,*_:g['return_from'](uc),begin=addr,end=addr)
rows=[]
for saved in [None,1,3,5,7,9]:
    for stage in range(7):
        files.clear();events.clear()
        if saved is not None:files['save.dat']=struct.pack('<i',saved)
        call(0x43ee50,stage)
        rows.append({'saved':saved,'stage':stage,'result':struct.unpack('<i',files['save.dat'])[0] if 'save.dat' in files else None,
                     'io':list(events)})
root=m['b']['base']['ROOT']
(root/'test/fixtures/original-stage-progress.json').write_text(json.dumps(rows,separators=(',',':'))+'\n')
print(len(rows),'native stage save cases')
