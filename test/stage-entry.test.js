import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readArchive, decodeImage, decodeMap } from '../web/resources.js';
import { createStageEntry, stepStageEntry } from '../web/stage-entry.js';
import { STAGE_ENTRIES } from '../web/stage-entry-data.js';
import { createPlayer, collisionAt, followCamera } from '../web/game.js';
import { createWorld, stepWorld, readStageObjects } from '../web/objects.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-stage-entry.json', import.meta.url)));
test('stage-entry images, durations, title positions and voices come from the native loaders', () => {
  assert.deepEqual(STAGE_ENTRIES, fixture.entries);
  const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
  for (const data of Object.values(STAGE_ENTRIES)) {
    for (const name of [...data.images, ...data.title.map((item) => item.name)]) decodeImage(archive.get(name));
    for (const name of Object.values(data.cues)) assert.ok(existsSync(new URL(`../Changoo (E)/RESOURCE/${name}`, import.meta.url)), name);
  }
});

for (const { stage, strategy, initial, trace } of fixture.traces) {
  test(`stage ${stage}/${strategy}: all native states, atlas drawings, sound starts/stops and exits agree`, () => {
    const entry = createStageEntry(stage, 1000);
    if (strategy === 'skip-final-boundary') Object.assign(entry, initial);
    for (const [key, value] of Object.entries(initial)) assert.equal(entry[key], value, key);
    trace.forEach(({ now, skip, state, draws, sounds }, tick) => {
      assert.deepEqual(stepStageEntry(entry, skip, now), sounds, `tick ${tick} sounds`);
      for (const [key, value] of Object.entries(state)) assert.equal(entry[key], value, `tick ${tick} ${key}`);
      assert.deepEqual(entry.render, draws, `tick ${tick} drawing`);
    });
    assert.equal(entry.finished, true);
  });
}

for (const { stage, trace, camera } of fixture.coupled) {
  test(`stage ${stage}: native scheduler resumes player and terrain on the exact cutscene exit tick`, () => {
    const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
    const map = decodeMap(archive.get(`stage${stage}.map`)), mask = decodeImage(archive.get(`block${stage}.app`));
    const sample = (x, y) => collisionAt(map, mask, x, y);
    const p = createPlayer(0, 0), world = createWorld([]);
    p.moveEnabled = false;
    world.stageEntry = createStageEntry(stage);
    const states = { 0: 'idle', 1: 'walk', 2: 'air', 5: 'land', 6: 'idleLook', 11: 'bored' };
    trace.forEach(({ now, skip, right, finished, player }, tick) => {
      stepWorld(world, p, { fire: skip, right }, camera, sample, now);
      assert.equal(world.stageEntry.finished, finished, `tick ${tick} entry`);
      for (const [key, value] of Object.entries(player)) assert.equal(p[key], key === 'state' ? states[value] : value, `tick ${tick} player ${key}`);
    });
  });
}

test('a fresh stage begins at the native origin, falls after Space, and the real activator enables walking', () => {
  const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
  const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
  for (const stage of [1, 2]) {
    const map = decodeMap(archive.get(`stage${stage}.map`)), mask = decodeImage(archive.get(`block${stage}.app`));
    const world = createWorld(readStageObjects(map, config, archive)), p = createPlayer(0, 0), camera = { x: 0, y: 0 };
    p.moveEnabled = false; world.stageEntry = createStageEntry(stage);
    for (let tick = 0; tick < 450 && p.x <= 50; tick++) {
      const entryWasRunning = !world.stageEntry.finished;
      stepWorld(world, p, { fire: tick === 1, right: true }, camera, (x, y) => collisionAt(map, mask, x, y), 1000 + tick * 1000 / 30);
      if (!entryWasRunning) followCamera(camera, p, map);
    }
    assert.equal(p.moveEnabled, true);
    assert.ok(world.activators.some((actor) => actor.removed));
    assert.ok(p.x > 50);
    assert.equal(p.lives, 5);
    assert.equal(p.dead || p.hazard, false);
  }
});
