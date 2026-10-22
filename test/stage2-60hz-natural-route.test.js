import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { start, step } from '../tools/route-stage1.mjs';
import { enterNextStage } from '../web/game.js';
import { enterFlight } from '../web/flight.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createWorld, readStageObjects, stepWorld, initializeWorldCamera, advanceWorldCamera, cameraActive } from '../web/objects.js';
import { createStageEntry } from '../web/stage-entry.js';
import { resetCameraOrigin, cameraMode } from '../web/camera.js';

const stage1Route = JSON.parse(readFileSync(new URL('./fixtures/stage1-complete-route.json', import.meta.url)));
const route = JSON.parse(readFileSync(new URL('./fixtures/stage2-60hz-natural-route.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const map = decodeMap(archive.get('stage2.map'));
const mask = decodeImage(archive.get('block2.app'));
const sample = (x, y) => {
  if (x < 0 || y < 0 || x >= map.width * 32 || y >= map.height * 32) return 0;
  const tile = map.cells[(Math.floor(y / 32) * map.width + Math.floor(x / 32)) * 5 + 1];
  if (tile < 0) return 0;
  return mask.pixels[(Math.floor(tile / 20) * 32 + y % 32) * mask.width + (tile % 20) * 32 + x % 32] ?? 0;
};
const decodeKeys = (encoded) => encoded === '-' ? {} : Object.fromEntries(encoded.split('+').map((key) => [key, true]));

test('60Hz natural stage2 route clears kind32 and enters shoot.map without state injection', () => {
  assert.equal(route.runs.reduce((ticks, [, count]) => ticks + count, 0), route.ticks);
  const run = start();
  for (const [encoded, count] of stage1Route.runs) {
    const input = decodeKeys(encoded);
    for (let i = 0; i < count; i++) step(run, input);
  }
  step(run, {});
  assert.equal(run.world.stageComplete, true);

  const previous = run.world;
  const world = createWorld(readStageObjects(map, config, archive), map, previous.randomSeed, previous);
  world.dog = previous.dog;
  world.stageEntry = createStageEntry(2, run.now);
  enterNextStage(run.p, 1);
  const camera = structuredClone(run.camera);
  resetCameraOrigin(camera);
  camera.scrollMode = cameraMode(run.p, world.event, 0);
  initializeWorldCamera(world, run.p, camera, run.now);
  let tick = 0;
  const advance = (input) => {
    const now = run.now + Math.floor(++tick * 1000 / 60);
    camera.scrollMode = cameraMode(run.p, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, run.p, camera, 2, now);
    stepWorld(world, run.p, input, camera, sample, now);
  };
  for (const [encoded, count] of route.runs) {
    const input = decodeKeys(encoded);
    for (let i = 0; i < count; i++) advance(input);
  }

  const boss = world.actors.find((actor) => actor.kind === 32);
  assert.equal(tick, route.expected.stage2Ticks);
  assert.equal(boss?.health, 0);
  assert.equal(world.stageComplete, true);
  assert.equal(world.stageEntry?.stage, 'stage2Exit');
  assert.equal(world.stageEntry?.finished, true);
  assert.equal(world.stageEntry?.transitions, 1);
  assert.deepEqual({ x: run.p.x, y: run.p.y, lives: run.p.lives, points: run.p.points }, route.expected.player);

  enterNextStage(run.p, 2);
  enterFlight(run.p);
  const shoot = decodeMap(archive.get('shoot.map'));
  assert.deepEqual([shoot.width, shoot.height], [1400, 20]);
  assert.equal(run.p.flight, true);
  assert.equal(run.p.lives, route.expected.nextStageLives);
  assert.equal(run.p.points, route.expected.player.points);
});
