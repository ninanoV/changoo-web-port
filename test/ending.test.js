import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createEnding, stepEnding } from '../web/ending.js';
import { ENDING } from '../web/ending-data.js';
import { readArchive, decodeImage } from '../web/resources.js';
import { createPlayer } from '../web/game.js';
import { createWorld, stepWorld } from '../web/objects.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-ending.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const compare = (ending, expected) => {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(ending[key === 'removed' ? 'movieFinished' : key], value, key);
};
test('ending assets and constructor audio match original loaders', () => {
  assert.deepEqual(ENDING, fixture.ending);
  for (const name of [ENDING.background, ...ENDING.images, ENDING.overlay, ...ENDING.credits]) decodeImage(archive.get(name));
  for (const {name} of ENDING.startSounds) assert.ok(existsSync(new URL(`../Changoo (E)/RESOURCE/${name}`, import.meta.url)));
});
for (const {strategy, initial, trace} of fixture.movies) {
  test(`ending movie/${strategy}: native timing, overlay movement, drawing and credits transition agree`, () => {
    const ending = createEnding(1000); compare(ending, initial);
    for (const {now, skip, expected, draws, sounds, cd} of trace) {
      assert.deepEqual(stepEnding(ending, skip, now), {sounds, cd});
      compare(ending, expected); assert.deepEqual(ending.render, draws);
    }
    assert.equal(ending.mode, 'credits'); assert.equal(ending.finished, false);
  });
}
test('all 4001 native credits ticks preserve three pages, final held image and ignored Space', () => {
  const ending = createEnding(1000); stepEnding(ending, true, 1001);
  for (const {now, skip, ticks, finished, menuRequests, draws, sounds, cd} of fixture.credits) {
    assert.deepEqual(stepEnding(ending, skip, now), {sounds, cd});
    assert.equal(ending.creditTicks, ticks); assert.equal(ending.finished, finished);
    assert.equal(Number(ending.menuRequested), menuRequests); assert.deepEqual(ending.render, draws);
  }
});
test('final pair counter starts the ending once and freezes the parent world through credits', () => {
  const world = createWorld([]), p = createPlayer(0, 0), camera = {x: 0, y: 0};
  world.finalBossesRemaining = 0;
  assert.deepEqual(stepWorld(world, p, {}, camera, () => 0, 1000), ENDING.startSounds);
  assert.equal(world.finalBossesRemaining, 2); assert.equal(world.stageComplete, false);
  const before = structuredClone(p), ending = world.ending;
  stepWorld(world, p, {fire: true, right: true}, camera, () => 0, 1001);
  for (const row of fixture.credits) stepWorld(world, p, {fire: row.skip, right: true}, camera, () => 0, row.now);
  assert.equal(world.ending, ending); assert.equal(ending.finished, true); assert.deepEqual(p, before);
});
