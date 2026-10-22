import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPlayer,stepPlayer,resolveTerrain} from '../web/game.js';
const rows=JSON.parse(readFileSync(new URL('./fixtures/original-player-failure.json',import.meta.url)));
const states={0:'idle',4:'hurt'};
for(const row of rows.filter(row=>!['flight','booster'].includes(row.kind)))test(`native player ${row.kind} with ${row.lives} lives`,()=>{
  const p=createPlayer(6500,3032);Object.assign(p,{vx:5,vy:-2,lives:row.lives,invulnerable:17,points:25,balls:3});
  if(row.kind==='damage'){p.state='hurt';p.frame=p.ticks=0;}else resolveTerrain(p,p.x,p.y,()=>5);
  const values=expected=>Object.fromEntries(Object.entries(expected).map(([key])=>[key,key==='removed'?p.dead:key==='state'?Object.keys(states).find(k=>states[k]===p.state)*1:p[key]]));
  assert.deepEqual(values(row.initial),row.initial);
  for(const [i,tick]of row.trace.entries()){
    stepPlayer(p,{},()=>0,[],true,{x:6400,y:2719});
    if(row.kind==='repeated-hazard'&&i<3)resolveTerrain(p,p.x,p.y,()=>5);
    assert.deepEqual(values(tick.expected),tick.expected,`tick ${i}`);assert.equal(p.balls,tick.balls);
    assert.equal(p.dead,tick.requests.includes('gameover'));
  }
  assert.equal(Boolean(p.respawnRequested),row.kind!=='damage'&&row.lives>1);
});

import {enterFlight,hurtFlight,stepFlight} from '../web/flight.js';
import {enterBooster,hurtBooster,stepBooster} from '../web/booster.js';
for(const row of rows.filter(row=>['flight','booster'].includes(row.kind)))test(`native ${row.kind} last life`,()=>{
  const p=createPlayer(6500,3032);p.lives=1;p.oldX=p.oldY=0;
  if(row.kind==='flight'){enterFlight(p);hurtFlight(p);}else{enterBooster(p);hurtBooster(p);}
  const mapping={flight:18,flightHurt:19,booster:26,boostHurt:27};
  const values=expected=>Object.fromEntries(Object.keys(expected).map(key=>[key,key==='removed'?p.dead:key==='state'?mapping[p.state]:p[key]]));
  assert.deepEqual(values(row.initial),row.initial);
  for(const [i,tick]of row.trace.entries()){
    if(row.kind==='flight')stepFlight(p,{}, {x:6400,y:2719},{width:1000,height:210});
    else stepBooster(p,{}, {x:6400,y:2719},{width:1000,height:210},()=>0,true);
    assert.deepEqual(values(tick.expected),tick.expected,`tick ${i}`);
    assert.equal(p.dead,tick.requests.includes('gameover'));
  }
});
