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
const stage2Route = JSON.parse(readFileSync(new URL('./fixtures/stage2-natural-boss-route.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const stage2 = decodeMap(archive.get('stage2.map'));
const stage2Mask = decodeImage(archive.get('block2.app'));
const sample = (map, mask) => (x, y) => {
  if (x < 0 || y < 0 || x >= map.width * 32 || y >= map.height * 32) return 0;
  const tile = map.cells[(Math.floor(y / 32) * map.width + Math.floor(x / 32)) * 5 + 1];
  if (tile < 0) return 0;
  return mask.pixels[(Math.floor(tile / 20) * 32 + y % 32) * mask.width + (tile % 20) * 32 + x % 32] ?? 0;
};
const decodeKeys = (encoded) => encoded === '-' ? {} : Object.fromEntries(encoded.split('+').map((key) => [key, true]));

test('web model with fixed 16ms step timestamps reaches stage2Exit and shoot.map from the native-matched stage1 fixture', () => {
  assert.equal(stage2Route.runs.reduce((ticks, [, count]) => ticks + count, 0), stage2Route.ticks);
  const run = start();
  for (const [encoded, count] of stage1Route.runs) {
    const input = decodeKeys(encoded);
    for (let i = 0; i < count; i++) step(run, input);
  }
  step(run, {});
  assert.equal(run.world.stageComplete, true, 'the native-matched stage-one route reaches its transition');

  const previous = run.world, dog = previous.dog;
  const world = createWorld(readStageObjects(stage2, config, archive), stage2, previous.randomSeed, previous);
  world.dog = dog;
  world.stageEntry = createStageEntry(2, run.now);
  enterNextStage(run.p, 1);
  const camera = structuredClone(run.camera);
  resetCameraOrigin(camera);
  camera.scrollMode = cameraMode(run.p, world.event, 0);
  initializeWorldCamera(world, run.p, camera, run.now);
  let now = run.now;

  for (const [encoded, count] of stage2Route.runs) {
    const input = decodeKeys(encoded);
    for (let i = 0; i < count; i++) {
      now += 16; // This route was found at a fixed 16ms model step; it is not a 60Hz RAF replay.
      camera.scrollMode = cameraMode(run.p, world.event, 0);
      if (cameraActive(world)) advanceWorldCamera(world, run.p, camera, 2, now);
      stepWorld(world, run.p, input, camera, sample(stage2, stage2Mask), now);
    }
  }

  const boss = world.actors.find((actor) => actor.kind === 32);
  assert.equal(boss?.health, stage2Route.expected.bossHealth);
  assert.equal(world.stageComplete, true);
  assert.equal(world.stageEntry?.stage, 'stage2Exit');
  assert.equal(world.stageEntry?.finished, true);
  assert.equal(world.stageEntry?.transitions, 1);
  assert.equal(run.p.lives, stage2Route.expected.lives);
  assert.equal(run.p.points, stage2Route.expected.points);

  const lives = run.p.lives + 3;
  const points = run.p.points;
  enterNextStage(run.p, 2);
  enterFlight(run.p);
  const shoot = decodeMap(archive.get('shoot.map'));
  const shootWorld = createWorld(readStageObjects(shoot, config, archive), shoot, world.randomSeed, world);
  shootWorld.stageEntry = createStageEntry(3, now);
  assert.deepEqual([shoot.width, shoot.height], [1400, 20]);
  assert.equal(run.p.flight, true);
  assert.equal(run.p.lives, lives);
  assert.equal(run.p.points, points);
});
