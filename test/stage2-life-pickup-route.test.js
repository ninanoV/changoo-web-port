import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { start, step } from '../tools/route-stage1.mjs';
import { enterNextStage } from '../web/game.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createWorld, readStageObjects, stepWorld, initializeWorldCamera, advanceWorldCamera, cameraActive } from '../web/objects.js';
import { createStageEntry } from '../web/stage-entry.js';
import { resetCameraOrigin, cameraMode } from '../web/camera.js';

const stage1Route = JSON.parse(readFileSync(new URL('./fixtures/stage1-complete-route.json', import.meta.url)));
const route = JSON.parse(readFileSync(new URL('./fixtures/stage2-life-pickup-route.json', import.meta.url)));
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

test('natural stage2 route collects the real kind42 life after the native-matched stage1 transition', () => {
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
  let pickup;

  for (const [encoded, count] of route.runs) {
    const input = decodeKeys(encoded);
    for (let i = 0; i < count; i++) {
      const now = run.now + Math.floor(++tick * 1000 / 60);
      camera.scrollMode = cameraMode(run.p, world.event, 0);
      if (cameraActive(world)) advanceWorldCamera(world, run.p, camera, 2, now);
      const previousLives = run.p.lives;
      stepWorld(world, run.p, input, camera, sample, now);
      const collected = world.actors.find((actor) => actor.kind === 42 && actor.collected);
      if (collected && !pickup) pickup = { x: collected.x, y: collected.y, lives: run.p.lives, deltaLives: run.p.lives - previousLives };
    }
  }

  assert.deepEqual(pickup, route.expected.pickup);
  assert.deepEqual({ x: run.p.x, y: run.p.y, lives: run.p.lives, points: run.p.points }, route.expected.player);
});
