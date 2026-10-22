import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeImage, decodeMap } from '../web/resources.js';
import { createPlayer, playerAnimation, collisionAt } from '../web/game.js';
import { createWorld, createActor, stepWorld } from '../web/objects.js';
import { createEvent, stepEventPlayer, eventPlayerSprites } from '../web/events.js';
import { BOSS2_SCENES, BOSS2_POSES } from '../web/stage2-boss-scene-data.js';

const f = JSON.parse(readFileSync(new URL('./fixtures/original-stage2-boss-scenes.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage2.map')), mask = decodeImage(archive.get('block2.app'));
const sample = (x, y) => collisionAt(map, mask, x, y), camera = { x: 22500, y: 2719 };
const stateName = (state) => state === 0 ? 'idle' : state === 1 ? 'walk' : state === 2 ? 'air' : `scene${state}`;
function compare(player, expected, label) {
  for (const [key, value] of Object.entries(expected)) assert.equal(player[key], key === 'state' ? stateName(value) : value, `${label} ${key}`);
}

test('boss dialogue data and seven player poses come from the original constructors', () => {
  assert.deepEqual(BOSS2_SCENES, f.metadata); assert.deepEqual(BOSS2_POSES, f.animations);
  for (const pose of Object.values(BOSS2_POSES)) for (const name of pose.frames) decodeImage(archive.get(`${name}.app`));
  for (const name of BOSS2_SCENES.boss2Intro.enemy.images) decodeImage(archive.get(name));
});

test('280 boss-dialogue player pose ticks and atlas drawing positions match', () => {
  for (const { state, trace } of f.poses) {
    const before = trace[0].before, p = Object.assign(createPlayer(before.x, before.y), before, { state: stateName(state), animationOverride: BOSS2_POSES[state] });
    for (const [tick, { expected, draws }] of trace.entries()) {
      assert.deepEqual(eventPlayerSprites(p).map(({ name, x, y }) => ({ name, x: x - camera.x, y: y - camera.y })), draws);
      stepEventPlayer(p, sample); compare(p, expected, `${state} tick ${tick}`);
    }
  }
});

for (const { kind, scenario, trace } of f.sequences) {
  test(`${kind}/${scenario}: actor ordering, Enter rules, cleanup and exit-movie handoff agree`, () => {
    const p = createPlayer(22800, 3032), world = createWorld([], map);
    const boss = kind === 'boss2Intro' ? { ...createActor(32, 23018, 2912), active: true, born: false, spawnOrder: 0 } : null;
    if (boss) world.actors.push(boss);
    world.event = createEvent(kind, p, camera, 1000, boss);
    trace.forEach(({ elapsed, enter, expected, sounds }, tick) => {
      assert.deepEqual(stepWorld(world, p, { enter }, camera, sample, 1000 + elapsed), sounds, `tick ${tick} sounds`);
      compare(p, expected.player, `tick ${tick}`);
      assert.equal(playerAnimation(p).period, expected.period); assert.equal(playerAnimation(p).count, expected.count);
      if (boss) for (const [key, value] of Object.entries(expected.boss)) assert.equal(boss[key], value, `tick ${tick} boss ${key}`);
      assert.equal(world.event === null, expected.removed);
      assert.equal(world.stageEntry?.stage === 'stage2Exit', expected.exitRequested);
    });
  });
}
