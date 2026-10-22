import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readArchive,decodeMap,decodeImage} from '../web/resources.js';
import {createWorld,openMinigame,createProjectile,stepWorld} from '../web/objects.js';
import {createPlayer,collisionAt} from '../web/game.js';
import {createInventory} from '../web/inventory.js';
import {createStageEntry} from '../web/stage-entry.js';
import {createEnding} from '../web/ending.js';
const rows=JSON.parse(readFileSync(new URL('./fixtures/original-modal-contacts.json',import.meta.url)));
const a=readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES',import.meta.url)));
const map=decodeMap(a.get('stage1.map')),mask=decodeImage(a.get('block1.app'));
const stateId={idle:0,walk:1,air:2,hurt:4,land:5};
for(const row of rows)test(`native modal ${row.mode}/${row.scenario}: frozen contacts and resume order`,()=>{
  const definitions=['enemy','projectile','enemy-born','enemy-removed'].includes(row.scenario)?[{kind:0,x:6508,y:3032}]:row.scenario==='pickup'?[{kind:10,x:6508,y:3032}]:['platform','spring'].includes(row.scenario)?[{kind:row.scenario==='spring'?9:4,x:6500,y:3000}]:[];
  const world=createWorld(definitions,map),p=createPlayer(6500,row.scenario==='platform'?2932:row.scenario==='spring'?2935:3032),camera={x:6400,y:2719};
  if(row.scenario==='spring')p.vy=5;
  if(row.scenario==='platform')Object.assign(world.surfaces[0],{oldX:6499,vx:1});
  for(const actor of [...world.actors,...world.surfaces]){actor.active=true;actor.born=row.scenario==='enemy-born';actor.removed=row.scenario==='enemy-removed';actor.spawnOrder=world.nextSpawnOrder++;}
  if(row.scenario==='projectile')world.projectiles.push(createProjectile({type:65,x:6540,y:3068,vx:0,vy:0}));
  if(row.mode==='inventory')world.inventory=createInventory(0);
  else if(row.mode==='entry')world.stageEntry=createStageEntry(1,1000);
  else if(row.mode==='ending')world.ending=createEnding(1000);
  else if(row.mode!=='inventory-entry')openMinigame(world,row.mode);
  for(const [i,frame] of row.trace.entries()){
    const tick=i+1;
    if(tick===6){
      if(row.mode==='car')world.minigame.row=193;
      if(row.mode==='flag'||row.mode==='card')world.minigame.lives=0;
      if(row.mode==='puzzle')world.minigame.exitRequested=1;
    }
    const input={enter:['inventory','inventory-entry'].includes(row.mode)&&(tick===5||row.mode==='inventory-entry'&&tick===1),exit:row.mode==='mole'&&tick===6,fire:['entry','ending'].includes(row.mode)&&tick===6};
    const sample=(x,y)=>row.scenario==='hazard'&&tick<6?5:collisionAt(map,mask,x,y);
    const sounds=stepWorld(world,p,input,camera,sample,frame.now).map(clip=>typeof clip==='string'?{name:clip,loop:false}:{name:clip.name,loop:clip.loop??false});
    assert.deepEqual(Object.fromEntries(Object.keys(frame.player).map(key=>[key,key==='state'?stateId[p.state]:p[key]])),frame.player,`player tick ${tick}`);
    assert.equal(p.hazard,frame.hazard,`hazard tick ${tick}`);
    if(frame.enemy){
      const enemy=world.actors[0];
      assert.deepEqual(Object.fromEntries(Object.keys(frame.enemy).map(key=>[key,key==='facing'?Number(enemy.facing):enemy[key]])),frame.enemy,`enemy tick ${tick}`);
    }
    if(frame.surface)assert.deepEqual(Object.fromEntries(Object.keys(frame.surface).map(key=>[key,world.surfaces[0][key]])),frame.surface,`surface tick ${tick}`);
    assert.deepEqual(sounds,frame.sounds,`sounds tick ${tick}`);
  }
});

for(const kind of ['car','flag','mole','card','puzzle'])test(`menu-launched ${kind} has no parent contacts, including its exit tick`,()=>{
  const world=createWorld([{kind:0,x:6508,y:3032}],map),p=createPlayer(6500,3032),camera={x:6400,y:2719};
  world.actors[0].active=true;
  const before=structuredClone(p),enemy=structuredClone(world.actors[0]);
  const mini=openMinigame(world,kind);mini.fromMenu=true;
  stepWorld(world,p,{},camera,()=>5,1000);
  if(kind==='car')mini.row=193;
  if(['flag','card'].includes(kind))mini.lives=0;
  if(kind==='puzzle')mini.exitRequested=1;
  stepWorld(world,p,{exit:kind==='mole'},camera,()=>5,1033);
  assert.equal(mini.finished,true);assert.deepEqual(p,before);assert.deepEqual(world.actors[0],enemy);
  assert.equal(openMinigame(world,kind).fromMenu,false);
});
