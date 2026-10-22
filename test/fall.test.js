import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeImage, decodeMap } from '../web/resources.js';
import { createPlayer, collisionAt, followCamera } from '../web/game.js';
import { createWorld, stepWorld, readStageObjects } from '../web/objects.js';
import { FALL_POSES } from '../web/fall-data.js';
import { enterFall, fallSprite } from '../web/fall.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-fall.json', import.meta.url)));
const entryFixture = JSON.parse(readFileSync(new URL('./fixtures/original-jungle-entry.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage4.map')), mask = decodeImage(archive.get('block4.app'));
const names = {0: 'idle', 1: 'walk', 2: 'air', 5: 'land', 95: 'scene95', 96: 'scene96', 97: 'scene97'};
const definitions = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
for (const {scenario, trace} of entryFixture.traces) {
  test(`jungle opening/${scenario}: native fall, dialogue, pickup and scheduler agree end to end`, () => {
    const p = createPlayer(0, 0), world = createWorld(definitions, map);
    for (const [tick, row] of trace.entries()) {
      assert.deepEqual(stepWorld(world, p, row.input, row.camera, (x, y) => collisionAt(map, mask, x, y), Math.floor(tick * 1000 / 30)), row.sounds, `${scenario}/${tick} sounds`);
      for (const [key, value] of Object.entries(row.player)) assert.deepEqual(p[key], key === 'state' ? names[value] ?? `scene${value}` : value, `${scenario}/${tick} ${key}`);
      assert.equal(world.falling, row.falling); assert.equal(Boolean(world.event), row.event);
    }
    assert.equal(p.points, 1); assert.equal(p.lives, 5); assert.deepEqual(p.jungleItems, [1, 0]);
  });
}
test('the actual jungle origin falls, finishes its opening dialogue and collects the first item', () => {
  const p = createPlayer(0, 0), world = createWorld(definitions, map), camera = {x: 0, y: 0};
  for (let tick = 0; tick < 1100; tick++) {
    stepWorld(world, p, {right: tick >= 650 && p.x < 480}, camera, (x, y) => collisionAt(map, mask, x, y), tick * 1000 / 30);
    followCamera(camera, p, map);
  }
  assert.equal(world.falling, false); assert.equal(p.y, 6232);
  assert.ok(world.playedEvents.has(85)); assert.equal(world.event, null);
  assert.equal(p.lives, 5); assert.equal(p.points, 1); assert.deepEqual(p.jungleItems, [1, 0]);
  assert.equal(p.balls + p.waterBombs, 0);
});
test('the jungle enemy checkpoint supports body damage and a subsequent jump/stomp without granted equipment', () => {
  const p = createPlayer(4450, 4200), world = createWorld(definitions, map), camera = {x: 4318, y: 0};
  for (let i = 0; i < 300; i++) followCamera(camera, p, map);
  for (let tick = 0; tick < 120; tick++) {
    stepWorld(world, p, {right: tick < 30, jump: tick === 32}, camera, (x, y) => collisionAt(map, mask, x, y));
    followCamera(camera, p, map);
  }
  assert.equal(p.lives, 4); assert.equal(p.points, 1);
  assert.ok(world.actors.some((actor) => actor.kind === 23 && actor.removed && actor.state === 4));
  assert.equal(p.balls + p.waterBombs + p.companionItems.reduce((sum, count) => sum + count, 0), 0);
});
test('fall atlas preserves the original fifteen poses and drawing offset', () => {
  assert.deepEqual(FALL_POSES, fixture.poses);
  for (const [state, pose] of Object.entries(FALL_POSES)) {
    for (const frame of pose.frames) decodeImage(archive.get(`${frame}.app`));
    const p = createPlayer(100, 200); enterFall(p, Number(state));
    assert.deepEqual(fallSprite(p), {name: `${pose.frames[0]}.app`, x: 83, y: 133});
  }
});
for (const {scenario, initial, trace} of fixture.traces) {
  test(`fall/${scenario}: native scheduler, landing and return to held input agree`, () => {
    const p = Object.assign(createPlayer(initial.x, initial.y), initial, {state: names[initial.state]});
    const world = createWorld([{kind: 92, column: Math.floor(trace[0].camera.x / 32), row: Math.floor(trace[0].camera.y / 32)}], map);
    // Marker is already instantiated at the start of the original scheduler trace.
    for (const [tick, row] of trace.entries()) {
      const camera = row.camera;
      stepWorld(world, p, {right: true, jump: true, fire: true, enter: true}, camera, (x, y) => collisionAt(map, mask, x, y));
      for (const [key, value] of Object.entries(row.expected)) assert.equal(p[key], key === 'state' ? names[value] : value, `${scenario}/${tick} ${key}`);
      assert.equal(world.falling, row.falling, `${scenario}/${tick} falling`);
      assert.equal(world.activators[0].removed, row.markerRemoved, `${scenario}/${tick} marker`);
    }
  });
}
