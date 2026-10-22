import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readArchive,decodeMap,decodeImage} from '../web/resources.js';
import {createWorld,initializeWorldCamera,advanceWorldCamera,readStageObjects,stepWorld} from '../web/objects.js';
import {createPlayer,collisionAt} from '../web/game.js';
import {createInventory} from '../web/inventory.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/original-camera-world.json',import.meta.url)));
const archive=readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES',import.meta.url)));
const config=readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG',import.meta.url)),mask=decodeImage(archive.get('block1.app'));
const states={idle:0,walk:1,air:2,hurt:4,land:5,idleLook:6,bored:11};
for(const row of fixture.traces)test(`native camera + factories + inventory: ${row.scenario}`,()=>{
  const map=decodeMap(archive.get('stage1.map'));
  if(row.scenario==='inventory-platform')map.cells.set([4,8,11],(89*map.width+194)*5+2);
  const definitions=readStageObjects(map,config,archive),world=createWorld(definitions,map);
  const [px,py,x,y]=row.start,p=createPlayer(px,py),camera={x,y,scrollMode:row.mode};
  p.screenX=px-x;p.screenY=py-y;
  initializeWorldCamera(world,p,camera,1000);
  if(row.scenario!=='inventory-platform')world.inventory=createInventory(0);
  const compare=(expected,tick)=>{
    assert.deepEqual(Object.fromEntries(Object.keys(expected.player).map(key=>[key,key==='state'?states[p.state]:p[key]])),expected.player,`player ${tick}`);
    assert.deepEqual(Object.fromEntries(Object.keys(expected.camera).map(key=>[key,camera[key]])),expected.camera,`camera ${tick}`);
    const objects=[...world.actors,...world.surfaces,...world.markers,...world.triggers,...world.activators].filter(o=>o.active).sort((a,b)=>a.spawnOrder-b.spawnOrder);
    assert.equal(objects.length,expected.objects.length,`object count ${tick}`);
    for(const [i,value] of expected.objects.entries()){
      const o=objects[i];assert.deepEqual(Object.fromEntries(Object.keys(value).map(key=>[key,key==='removed'?Boolean(o.removed):key==='facing'?Number(o.facing):o[key]])),value,`object ${i} tick ${tick}`);
    }
  };
  compare(row.initial,'initial');
  for(const [i,frame] of row.trace.entries()){
    const sounds=advanceWorldCamera(world,p,camera,1,frame.now);
    sounds.push(...stepWorld(world,p,frame.input,camera,(x,y)=>collisionAt(map,mask,x,y),frame.now));
    compare(frame,i);
    assert.deepEqual(sounds.map(s=>typeof s==='string'?{name:s,loop:false}:{name:s.name,loop:s.loop??false}),frame.sounds,`sounds ${i}`);
  }
});
