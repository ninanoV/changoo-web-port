import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readArchive,decodeMap} from '../web/resources.js';
import {readStageObjects,createWorld} from '../web/objects.js';
import {IGNORED_KINDS} from '../web/stage2-actor-data.js';
const archive=readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES',import.meta.url)));
const config=readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG',import.meta.url));
const native=JSON.parse(readFileSync(new URL('./fixtures/original-spawning.json',import.meta.url)));
for(const [name,count] of [['stage1',538],['stage2',619],['shoot',1333],['stage3',221],['stage4',619],['stage5',877],['stage6',654]])test(`${name}: every original map placement has exactly one runtime handler or a native no-op`,()=>{
  const map=decodeMap(archive.get(`${name}.map`)),definitions=readStageObjects(map,config,archive),world=createWorld(definitions,map);
  assert.equal(definitions.length,count);assert.deepEqual(IGNORED_KINDS,native.ignored);
  const counts=new Map();
  for(const object of [...world.actors,...world.surfaces,...world.markers,...world.triggers,...world.activators]){
    const key=`${object.column},${object.row}`;counts.set(key,(counts.get(key)??0)+1);
  }
  for(const object of definitions){
    assert.equal(counts.get(`${object.column},${object.row}`)??0,IGNORED_KINDS.includes(object.kind)?0:1,`${object.kind} at ${object.column},${object.row}`);
  }
});
