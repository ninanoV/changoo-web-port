import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { followCamera } from '../web/game.js';
const rows = JSON.parse(readFileSync(new URL('./fixtures/original-scroll.json',import.meta.url)));
for (const mode of [0,1]) test(`camera scroll mode ${mode}: 500 native edge, velocity and direction samples`,()=>{
  for (const row of rows.filter(row=>row.camera.scrollMode===mode)) {
    const camera={...row.camera};followCamera(camera,row.player,{width:1000,height:210});
    assert.deepEqual({x:camera.x,y:camera.y,scrollMotion:camera.scrollMotion},row.expected,JSON.stringify(row));
  }
});
const sequences = JSON.parse(readFileSync(new URL('./fixtures/original-scroll-sequences.json',import.meta.url)));
for (const row of sequences) test(`stepped camera continuous pan at ${row.camera.x}/${row.player.x}`,()=>{
  const camera={...row.camera};
  for (const [i,expected] of row.trace.entries()) {
    followCamera(camera,row.player,{width:1000,height:210});
    assert.deepEqual({x:camera.x,y:camera.y,scrollMotion:camera.scrollMotion},expected,`tick ${i}`);
  }
});
