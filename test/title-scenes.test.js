import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTitleScene,stepTitleScene} from '../web/title-scenes.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/original-title-scenes.json',import.meta.url)));
for(const row of fixture.traces)test(`native ${row.kind}: ${row.strategy}`,()=>{
  const scene=createTitleScene(row.kind);
  for(const [i,tick] of row.trace.entries()){
    const effects=stepTitleScene(scene,tick.input,tick.now);
    assert.deepEqual(Object.fromEntries(Object.keys(tick.expected).map(key=>[key,scene[key]])),tick.expected,`state ${i}`);
    assert.deepEqual(scene.render,tick.draws,`draw ${i}`);
    assert.deepEqual(effects,{sounds:tick.sounds,cd:tick.cd,requests:tick.requests,palettes:tick.palettes},`effects ${i}`);
  }
});
