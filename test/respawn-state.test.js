import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readArchive,decodeMap} from '../web/resources.js';
import {createWorld,restartWorld,readStageObjects,stepWorld,openMinigame} from '../web/objects.js';
import {createPlayer} from '../web/game.js';
import {createCompanion} from '../web/companions.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/original-respawn-state.json',import.meta.url)));
const archive=readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES',import.meta.url)));
const config=readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG',import.meta.url));
const guardKey=key=>/^\d+$/.test(key)?Number(key):key;
for(const row of fixture.maps)test(`native same-stage reload preserves guards and restores map ${row.stage}`,()=>{
  const raw=archive.get(row.map),map=decodeMap(raw),definitions=readStageObjects(map,config,archive);
  assert.equal(createHash('sha256').update(raw.subarray(8)).digest('hex'),row.mapHash);
  assert.deepEqual(row.stageCallbacks,[]);
  const previous=createWorld(definitions,map,123);
  const guards=Object.keys(row.before).filter(key=>!['pairedBossesRemaining','finalBossesRemaining','pickupCount','enemyCount','randomSeed','cardCursor','cardMusicAt','puzzleBlank','puzzleReady'].includes(key));
  previous.playedEvents=new Set(guards.map(guardKey));
  previous.card={finished:true,cursor:row.before.cardCursor,musicAt:row.before.cardMusicAt,order:Array.from({length:18},(_,i)=>17-i)};
  previous.puzzle={finished:true,blank:row.before.puzzleBlank,upReady:row.before.puzzleReady,board:Array.from({length:9},(_,i)=>7-i)};
  previous.pairedBossesRemaining=row.before.pairedBossesRemaining;previous.finalBossesRemaining=row.before.finalBossesRemaining;
  for(const item of [...previous.actors,...previous.surfaces,...previous.triggers]) item.removed=true;
  const world=restartWorld(previous,definitions);
  for(const key of guards)assert.equal(Number(world.playedEvents.has(guardKey(key))),row.after[key],key);
  assert.equal(world.pairedBossesRemaining,row.after.pairedBossesRemaining);
  assert.equal(world.finalBossesRemaining,row.after.finalBossesRemaining);
  assert.ok(world.actors.every(actor=>!actor.removed&&!actor.active));
  assert.ok(world.surfaces.every(actor=>!actor.removed&&!actor.active));
  assert.ok(world.triggers.filter(actor=>actor.kind===118).every(actor=>actor.removed));
  assert.equal(world.randomSeed,row.after.randomSeed);assert.equal(world.map,map);
  assert.deepEqual(world.card.order,row.cardOrder);assert.deepEqual(world.puzzle.board,row.puzzleBoard);
  assert.equal(world.card.cursor,row.after.cardCursor);assert.equal(world.card.musicAt,row.after.cardMusicAt);
  assert.equal(world.puzzle.blank,row.after.puzzleBlank);assert.equal(world.puzzle.upReady,row.after.puzzleReady);
  assert.equal(createWorld(definitions,map).playedEvents.size,0);
});
test('native companion cleanup removes summoned actors but preserves the HUD dog',()=>{
  const slots=[2,2,3,5,6,7];
  for(const [i,row] of fixture.party.entries()){
    const previous=createWorld([]);previous.companion=createCompanion(slots[i],i===1?2:1,{x:6400,y:2719});
    const world=restartWorld(previous,[]);
    assert.equal(world.companion===null,row.companionRemoved);
    assert.equal(world.dog!==previous.dog,row.dogRemoved);
    assert.equal(row.busyAfterCleanup,0);
  }
});
test('completed dialogue remains suppressed after a hazard, while an unseen dialogue still starts',()=>{
  const definition={kind:65,x:100,y:200,column:3,row:6};
  for(const seen of [false,true]){
    const previous=createWorld([definition]);if(seen)previous.playedEvents.add(65);
    const world=restartWorld(previous,[definition]),p=createPlayer(80,200);
    world.triggers[0].active=true;stepWorld(world,p,{}, {x:0,y:0},()=>0,1000);
    assert.equal(world.event?.kind===65,!seen);
  }
});
test('native boss intros refuse reconstruction when their guard survived a reload',()=>{
  for(const row of fixture.refusals){
    assert.equal(row.allocations,0);assert.equal(row.guard,1);
    const previous=createWorld([]);previous.playedEvents.add(row.kind);
    const world=restartWorld(previous,[]);
    assert.ok(world.playedEvents.has(row.kind));assert.equal(world.actors.length,0);
  }
});
test('active dog state survives the native map reader and web reload',()=>{
  assert.equal(fixture.activeDog.unchanged,true);assert.equal(fixture.activeDog.busyBefore,fixture.activeDog.busyAfter);
  const previous=createWorld([]);previous.dog.state=fixture.activeDog.state;
  const world=restartWorld(previous,[]);assert.equal(world.dog,previous.dog);assert.equal(world.dog.state,1);
});
test('card and puzzle reentry retain their own records across other games and world replacement',()=>{
  let world=createWorld([]);
  const card=openMinigame(world,'card');card.finished=true;
  const order=[...card.order];const puzzle=openMinigame(world,'puzzle');puzzle.finished=true;
  openMinigame(world,'mole').finished=true;
  world=restartWorld(world,[]);
  assert.equal(world.card,card);assert.equal(world.puzzle,puzzle);assert.equal(world.minigame,null);
  assert.deepEqual(world.card.order,order);
  const next=createWorld([],null,world.randomSeed,world);
  assert.equal(next.card,card);assert.equal(next.puzzle,puzzle);
  const secondCard=openMinigame(next,'card');assert.notEqual(secondCard,card);assert.deepEqual(card.order,order);
  assert.equal(next.randomSeed,secondCard.randomSeed);
});
