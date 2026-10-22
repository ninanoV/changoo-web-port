import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceCamera,initialCameraScan,cameraMode,resetCameraOrigin} from '../web/camera.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/original-camera-runtime.json',import.meta.url)));
for(const row of fixture.traces)test(`native complete camera update: ${row.name}`,()=>{
  const camera={...row.initial,scrollMode:row.initialMode};
  let stopped=row.flightStopped;
  for(const [i,frame] of row.trace.entries()){
    camera.scrollMode=frame.scrollMode;
    const scans=advanceCamera(camera,frame.player,row.map,row.stage,stopped,row.factoryEffect?()=>{
      if(row.factoryEffect==='mode-a')camera.scrollMode=0;
      if(row.factoryEffect==='stop')stopped=true;
      return stopped;
    }:undefined);
    assert.equal(camera.scrollMode,frame.afterMode);assert.equal(stopped,frame.flightStopped);
    assert.deepEqual(Object.fromEntries(Object.keys(frame.expected).map(key=>[key,camera[key]])),frame.expected,`state ${i}`);
    assert.deepEqual(scans,frame.scans,`factory order ${i}`);
  }
});

for(const row of fixture.initialScans)test(`native initial map scan ${row.stage}`,()=>{
  assert.deepEqual(initialCameraScan(row.camera,row.map),row.scans);
});

import {createWorld,stepWorld} from '../web/objects.js';
import {createPlayer} from '../web/game.js';
for(const row of fixture.requeues)test(`native requeue occupied=${row.occupied}`,()=>{
  const defs=[{kind:3,x:3217,y:2400,column:80,row:75}];
  if(row.occupied>=0)defs.push({kind:row.occupied,x:3240,y:2400,column:101,row:75});
  const world=createWorld(defs,{width:200,height:100}),actor=world.surfaces[0];
  actor.active=true;world.spawnCells.delete('80,75');
  stepWorld(world,createPlayer(0,0),{}, {x:0,y:0},()=>0);
  const pending=world.spawnCells.get('101,75');
  assert.equal(pending.kind,row.result[0]);
  if(row.occupied<0){assert.equal(actor.active,false);assert.equal(pending,actor);assert.equal(actor.x+32-101*32-16,row.result[1]);assert.equal(actor.y+23-76*32,row.result[2]);}
  else assert.equal(actor.removed,true);
});

for(const row of fixture.profiles)test(`native camera profile ${row.name}/${row.preference}`,()=>{
  const p={flight:row.name==='flight',booster:row.name==='booster'};
  assert.equal(cameraMode(p,row.name==='dialogue70'?{kind:70}:null,row.preference),row.mode);
});

for(const row of fixture.reloads)test(`native map reload retains camera pan ${row.before.scrollMotion}`,()=>{
  const camera={...row.before,scrollMode:row.mode};resetCameraOrigin(camera);
  assert.deepEqual(Object.fromEntries(Object.keys(row.after).map(key=>[key,camera[key]])),row.after);
  assert.equal(camera.scrollMode,row.mode);
});
