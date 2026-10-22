import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt } from '../web/game.js';
import { createWorld, stepWorld, readStageObjects } from '../web/objects.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-final-battle.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage6.map')), mask = decodeImage(archive.get('block6.app'));
const defs = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
const stateName = value => ({0: 'idle', 1: 'walk', 2: 'air', 4: 'hurt', 5: 'land', 6: 'idleLook', 11: 'bored'})[value] ?? `scene${value}`;

test('2034 native factory/scheduler ticks carry the final introduction through both boss deaths and ending creation', () => {
  const p = createPlayer(...fixture.start), world = createWorld(defs, map);
  for (const [tick, row] of fixture.trace.entries()) {
    const sounds = stepWorld(world, p, row.input, row.camera, (x, y) => collisionAt(map, mask, x, y), row.now);
    assert.deepEqual(sounds.map(clip => typeof clip === 'string' ? {name: clip, loop: false} : clip), row.sounds, `tick ${tick}/sounds`);
    for (const [key, expected] of Object.entries(row.player)) assert.deepEqual(p[key], key === 'state' ? stateName(expected) : expected, `tick ${tick}/player/${key}`);
    for (const [kind, expected] of Object.entries(row.bosses)) {
      const actor = world.actors.find(a => a.kind === Number(kind) && a.spawnOrder !== undefined);
      assert.ok(actor, `tick ${tick}/boss${kind}`);
      for (const [key, value] of Object.entries(expected)) assert.deepEqual(actor[key], value, `tick ${tick}/boss${kind}/${key}`);
    }
    assert.equal(world.finalBossesRemaining, row.remaining, `tick ${tick}/counter`);
    assert.equal(Boolean(world.ending), row.ending, `tick ${tick}/ending`);
    if (world.event?.kind === 116) assert.equal(world.event.phase, row.phase, `tick ${tick}/phase`);
  }
  assert.equal(p.lives, 2); assert.equal(p.points, 20);
  assert.equal(p.balls, 0); assert.equal(p.waterBombs, 0); assert.deepEqual(p.companionItems, Array(6).fill(0));
  assert.equal(world.ending.mode, 'movie'); assert.equal(world.stageComplete, false);
});

test('new dialogue triggers wait for their native birth tick, then remain active beyond the visible tile window', () => {
  const world = createWorld([{kind: 113, x: 6500, y: 1200, column: 204, row: 40}]);
  const p = createPlayer(6500, 1200), camera = {x: 6400, y: 1000};
  stepWorld(world, p, {}, camera, () => 0, 1000);
  assert.equal(world.event, null); assert.equal(world.triggers[0].active, true);
  stepWorld(world, p, {}, {x: 6400, y: 1400}, () => 0, 1033);
  assert.equal(world.event?.kind, 113);
});
