import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer, collisionAt } from '../web/game.js';
import { createSurface, stepSurface, touchSurface, surfaceSprite } from '../web/surfaces.js';
import { createWorld, stepWorld } from '../web/objects.js';
import { resolveEnemyTerrain } from '../web/stage2-actors.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-jungle-surfaces.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage4.map')), mask = decodeImage(archive.get('block4.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
const states = {0: 'idle', 1: 'walk', 2: 'air', 4: 'hurt', 5: 'land', 6: 'idleLook', 10: 'chickenAir', 11: 'bored', 14: 'roachAir', 17: 'roachDash'};
function compare(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, `${label}/${key}`);
}
test('stationary and falling bridge variants preserve native geometry, movement and sprites', () => {
  for (const {kind, trace} of fixture.movement) {
    const data = fixture.metadata[kind], surface = createSurface(kind, 6500, 1200);
    compare(surface, data.initial, `${kind}/initial`);
    assert.deepEqual(Object.values(surface.body), data.body);
    assert.equal(surfaceSprite(surface), data.image); decodeImage(archive.get(data.image));
    for (const [tick, expected] of trace.entries()) {
      if (tick === 20) touchSurface(createPlayer(6500, 1180), surface);
      stepSurface(surface, () => 0); compare(surface, expected, `${kind}/${tick}`);
    }
  }
});
test('bridge side, rising, falling and already-supported contacts match both native callbacks', () => {
  for (const {kind, before, expected, actor, sounds} of fixture.contacts) {
    const p = Object.assign(createPlayer(before.x, before.y), before, {state: states[before.state]});
    const surface = createSurface(kind, 6500, 1200);
    assert.deepEqual(touchSurface(p, surface), sounds);
    compare(p, {...expected, state: states[expected.state]}, `${kind}/player`);
    compare(surface, actor, `${kind}/surface`);
  }
});
test('bridge terrain preserves type-1 and type-2 native corrections', () => {
  for (const {pixel, before, expected} of fixture.terrain) {
    const surface = Object.assign(createSurface(102, before.x, before.y), before);
    resolveEnemyTerrain(surface, (x, y) => x >= 320 && x < 352 && y >= 320 && y < 352 ? pixel : 0);
    compare(surface, expected, `${pixel}/${before.x}/${before.y}`);
  }
});
for (const {kind, x, y, initial, trace} of fixture.journeys) {
  test(`jungle surface ${kind}: actual-map native scheduler movement and contacts agree`, () => {
    const p = Object.assign(createPlayer(initial.x, initial.y), initial, {state: states[initial.state]});
    // Native trace starts with this surface instantiated, before its first scheduler update.
    const world = createWorld([{kind, x, y, column: Math.floor(trace[0].camera.x / 32), row: Math.floor(trace[0].camera.y / 32)}], map);
    for (const [tick, row] of trace.entries()) {
      assert.deepEqual(stepWorld(world, p, row.input, row.camera, sample), row.sounds, `${kind}/${tick}/sounds`);
      compare(p, {...row.player, state: states[row.player.state]}, `${kind}/${tick}/player`);
      compare(world.surfaces[0], row.surface, `${kind}/${tick}/surface`);
    }
  });
}
test('a touched bridge requeues as falling kind 102 and ignores directional enemy markers', () => {
  const world = createWorld([{kind: 101, x: 320, y: 320, column: 10, row: 11}, {kind: 14, x: 320, y: 320, column: 10, row: 10}]);
  const p = createPlayer(320, 250), camera = {x: 0, y: 0};
  stepWorld(world, p, {}, camera, () => 0); stepWorld(world, p, {}, camera, () => 0);
  assert.equal(world.surfaces[0].state, 4);
  stepWorld(world, p, {}, {x: 2000, y: 0}, () => 0);
  assert.equal(world.surfaces[0].active, false); assert.equal(world.surfaces[0].kind, 102);
  stepWorld(world, p, {}, camera, () => 0);
  const before = world.surfaces[0].y;
  stepWorld(world, createPlayer(0, 0), {}, camera, () => 0);
  assert.equal(world.surfaces[0].y, before + 1);
});
