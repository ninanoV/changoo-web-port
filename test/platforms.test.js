import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeImage, decodeMap } from '../web/resources.js';
import { createPlayer, stepPlayer, collisionAt, followCamera } from '../web/game.js';
import { overlaps, createWorld, stepWorld, readStageObjects } from '../web/objects.js';
import { createSurface, stepSurface, touchSurface } from '../web/surfaces.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-platforms.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage1.map')), mask = decodeImage(archive.get('block1.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
const states = ['idle', 'walk', 'air', '', 'hurt', 'land'];
function compare(actual, expected, label, player = false) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], player && key === 'state' ? states[value] : value, `${label}: ${key}`);
}

test('five platform variants and two springs match 448 original update ticks', () => {
  for (const { kind, initial, trace } of fixture.motions) {
    const surface = createSurface(kind, 3487, 3040);
    compare(surface, initial, `${kind} initial`);
    if ([9, 88].includes(kind)) touchSurface(Object.assign(createPlayer(3480, 2975), { state: 'air', vy: 5 }), surface);
    trace.forEach((expected, tick) => {
      stepSurface(surface, () => 0);
      compare(surface, expected, `${kind} tick ${tick}`);
    });
  }
});

test('28 surface contacts match original support, carry, rising and edge conditions', () => {
  for (const row of fixture.contacts) {
    const p = Object.assign(createPlayer(row.player.x, row.player.y), row.player, { state: 'air' });
    const surface = Object.assign(createSurface(row.kind, 3487, 3040), row.surface);
    touchSurface(p, surface);
    compare(p, row.expected, `${row.kind} ${row.scenario}`);
    compare(surface, row.surfaceAfter, `${row.kind} ${row.scenario} surface`);
  }
});

test('spring launches clear the actual first wall with the same 170 original player ticks', () => {
  for (const journey of fixture.journeys) {
    const p = Object.assign(createPlayer(3480, 2975), { state: 'air', vy: 5 });
    const surface = createSurface(journey.kind, 3487, 3040);
    touchSurface(p, surface);
    journey.trace.forEach(({ input, expected }, tick) => {
      stepSurface(surface, sample);
      stepPlayer(p, input, sample);
      if (overlaps(p, surface)) touchSurface(p, surface);
      compare(p, expected, `${journey.kind} journey ${tick}`, true);
    });
    assert.ok(p.x > 3600 && p.y < 2700);
  }
});

test('world activates springs and carries players on a moving platform', () => {
  const world = createWorld([{ kind: 4, x: 100, y: 400, column: 4, row: 13 }]);
  assert.equal(world.surfaces.length, 1);
  const p = createPlayer(100, 329), camera = { x: 0, y: 0 };
  stepWorld(world, p, {}, camera, () => 0);
  for (let tick = 0; tick < 20; tick++) stepWorld(world, p, {}, camera, () => 0);
  assert.equal(p.x, 120);
  assert.equal(p.y, 330);
  assert.equal(p.onPlatform, true);
});

test('the normal route from home crosses the first high wall without a checkpoint', () => {
  const definitions = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const world = createWorld(definitions), p = createPlayer(0, 3032), camera = { x: 0, y: 2719 };
  function run(ticks, input) {
    for (let i = 0; i < ticks; i++) {
      const controls = world.event?.kind === 118 ? { ...input, enter: !world.event.enterHeld } : input;
      stepWorld(world, p, controls, camera, sample);
      followCamera(camera, p, map);
    }
  }
  run(250, { right: true });
  for (let i = 0; i < 7; i++) { run(35, { right: true, jump: true }); run(10, { right: true }); }
  run(200, { right: true });
  assert.equal(p.x, 3501, 'at the formerly impassable wall');
  run(50, { jump: true });
  assert.ok(p.y < 2500, 'the original spring clears the wall height');
  run(90, { right: true });
  assert.ok(p.x > 4000 && p.y < 2700, 'land on the upper route');
  assert.equal(p.lives, 5);
});
