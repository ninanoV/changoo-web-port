import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer } from '../web/game.js';
import { createSurface, stepSurface, touchSurface, surfaceSprite } from '../web/surfaces.js';
import { resolveEnemyTerrain } from '../web/stage2-actors.js';
import { createWorld, stepWorld } from '../web/objects.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { collisionAt } from '../web/game.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-ice-surfaces.json', import.meta.url)));
const names = {0: 'idle', 1: 'walk', 2: 'air', 4: 'hurt', 5: 'land', 6: 'idleLook', 10: 'chickenAir', 11: 'bored', 14: 'roachAir', 17: 'roachDash'};
function compare(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, `${label}/${key}`);
}
test('wood platform variants match native constructor geometry, images and 540 movement ticks', () => {
  for (const {kind, trace} of fixture.movement) {
    const surface = createSurface(kind, 6500, 1200), data = fixture.metadata[kind];
    compare(surface, data.initial, `${kind}/initial`); assert.deepEqual(Object.values(surface.body), data.body);
    assert.equal(surfaceSprite(surface), data.image);
    for (const [tick, expected] of trace.entries()) { stepSurface(surface, () => 0); compare(surface, expected, `${kind}/${tick}`); }
  }
});
test('wood surfaces preserve all native falling, rising, side and carry contacts', () => {
  for (const row of fixture.contacts) {
    const p = Object.assign(createPlayer(row.before.x, row.before.y), row.before, {state: names[row.before.state]});
    const surface = Object.assign(createSurface(row.kind, 6500, 1200), row.surfaceBefore);
    touchSurface(p, surface);
    compare(p, {...row.player, state: names[row.player.state]}, `${row.kind}/${row.scenario}`);
    compare(surface, row.surface, `${row.kind}/surface`);
  }
});
test('wood platforms retain their native type-1/type-2 terrain corrections', () => {
  for (const {kind, pixel, before, expected} of fixture.terrain) {
    const surface = Object.assign(createSurface(kind, before.x, before.y), before);
    resolveEnemyTerrain(surface, (x, y) => x >= 320 && x < 352 && y >= 320 && y < 352 ? pixel : 0);
    compare(surface, expected, `${kind}/${pixel}`);
  }
});
test('direction markers move dari1 variants while the fixed dari3 surface ignores them', () => {
  for (const {kind, direction, state} of fixture.markers) {
    const world = createWorld([{kind, x: 320, y: 320, column: 10, row: 10}, {kind: direction + 13, x: 330, y: 325, column: 10, row: 10}]);
    stepWorld(world, createPlayer(0, 0), {}, {x: 0, y: 0}, () => 0);
    stepWorld(world, createPlayer(0, 0), {}, {x: 0, y: 0}, () => 0);
    assert.equal(world.surfaces[0].state, state, `${kind}/${direction}`);
  }
});
test('native dari1 requeue becomes an mb platform nine pixels lower; fixed dari3 keeps its kind', () => {
  for (const {kind, queuedKind, recreated} of fixture.requeues) {
    const world = createWorld([{kind, x: 9000, y: 1200, column: 282, row: 38}]);
    const surface = world.surfaces[0]; surface.active = true;
    stepWorld(world, createPlayer(0, 0), {}, {x: 5000, y: 1000}, () => 0);
    assert.equal(surface.kind, queuedKind); compare(surface, recreated, `${kind}/requeue`);
    assert.equal(surface.active, false);
    stepWorld(world, createPlayer(0, 0), {}, {x: 8800, y: 1100}, () => 0);
    assert.equal(surface.active, true); compare(surface, recreated, `${kind}/respawn`);
  }
});

test('real stage5 map spring and wood surfaces match 540 native scheduler ticks', () => {
  const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
  const map = decodeMap(archive.get('stage5.map')), mask = decodeImage(archive.get('block5.app'));
  const sample = (x, y) => collisionAt(map, mask, x, y);
  for (const {kind, x, y, initial, trace} of fixture.journeys) {
    const world = createWorld([{kind, x, y, column: Math.trunc(x / 32), row: Math.trunc(y / 32)}], map);
    const p = Object.assign(createPlayer(initial.x, initial.y), initial, {state: names[initial.state]});
    const surface = world.surfaces[0];
    for (const [tick, row] of trace.entries()) {
      assert.deepEqual(stepWorld(world, p, row.input, row.camera, sample, tick * 1000 / 30), row.sounds, `${kind}/${tick}/sounds`);
      compare(p, {...row.player, state: names[row.player.state]}, `${kind}/${tick}/player`);
      compare(surface, row.surface, `${kind}/${tick}/surface`);
    }
  }
});
