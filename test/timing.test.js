import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFrameClock,cameraWaitReady,finishFrameTick,decodeSpeed,loadSpeed,saveSpeed} from '../web/timing.js';
import {calibrationFactor} from '../web/settings.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/original-frame-clock.json',import.meta.url)));
for (const row of fixture.loops) test(`native main loop factor ${row.factor} boost ${row.boost}`,()=>{
  const clock=createFrameClock();for (const expected of row.trace) assert.deepEqual(finishFrameTick(clock,row.factor,row.boost),expected);
});
test('native camera wait: 30 delay, draw and clock-resolution combinations',()=>{
  for (const row of fixture.waits) {
    const clock={...createFrameClock(),draw:row.draw,lastWait:1000};let reads=0;
    if (row.draw) for(let i=0;i<250;i++){reads++;if(cameraWaitReady(clock,1000+i*row.quantum,row.delay)) break;}
    else assert.equal(cameraWaitReady(clock,1000,row.delay),true);
    assert.equal(clock.lastWait,row.lastWait);assert.equal(reads,row.reads);
  }
});
const fileRows=JSON.parse(readFileSync(new URL('./fixtures/original-settings.json',import.meta.url))).files;
test('speed.dat contains factor and delay; reads preserve both values and explicit settings write both',()=>{
  for (const row of fileRows) {
    const bytes=new Uint8Array(8),view=new DataView(bytes.buffer);
    if(row.saved) row.saved.forEach((v,i)=>view.setInt32(i*4,v,true));
    const value=row.save ? {factor:2,delay:51} : row.saved ? decodeSpeed(bytes) : {factor:calibrationFactor(0),delay:16};
    assert.deepEqual(value,{factor:row.factor,delay:row.delay});
    if(row.result) assert.deepEqual(row.save ? [value.factor,value.delay] : row.saved,row.result);
  }
});
test('speed storage validates before writes and tolerates unavailable or damaged storage',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},fallback={factor:1,delay:16};
  assert.equal(saveSpeed(storage,{factor:3,delay:0}),true);assert.deepEqual(loadSpeed(storage,fallback),{factor:3,delay:0});
  for(const v of ['broken','null','[]','{"factor":4,"delay":16}','{"factor":1,"delay":-1}','{"factor":1,"delay":210}'])assert.deepEqual(loadSpeed({getItem:()=>v},fallback),fallback);
  assert.equal(saveSpeed(null,fallback),false);assert.equal(saveSpeed({setItem(){throw Error('quota');}},fallback),false);
  assert.throws(()=>saveSpeed(storage,{factor:0,delay:16}));assert.throws(()=>decodeSpeed(new Uint8Array(7)));assert.throws(()=>decodeSpeed(new Uint8Array(8)));
});
