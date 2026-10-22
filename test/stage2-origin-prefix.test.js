import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { start, step } from '../tools/route-stage1.mjs';
import { enterNextStage, collisionAt, supported } from '../web/game.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createWorld, readStageObjects, stepWorld, initializeWorldCamera, advanceWorldCamera, cameraActive } from '../web/objects.js';
import { createStageEntry } from '../web/stage-entry.js';
import { resetCameraOrigin, cameraMode } from '../web/camera.js';

const route = JSON.parse(readFileSync(new URL('./fixtures/stage1-complete-route.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const stage2 = decodeMap(archive.get('stage2.map'));
const stage2Mask = decodeImage(archive.get('block2.app'));
const definitions = readStageObjects(stage2, config, archive);
const sample = (x, y) => collisionAt(stage2, stage2Mask, x, y);

test('native-matched stage1 route can reach stage2 kind71 with the web ledge controller', () => {
  const run = start();
  for (const [encoded, count] of route.runs) {
    const input = encoded === '-' ? {} : Object.fromEntries(encoded.split('+').map((key) => [key, true]));
    for (let i = 0; i < count; i++) step(run, input);
  }
  step(run, {});
  assert.equal(run.world.stageComplete, true);

  enterNextStage(run.p, 1);
  const dog = run.world.dog;
  run.world = createWorld(definitions, stage2, run.world.randomSeed, run.world);
  run.world.dog = dog;
  run.world.stageEntry = createStageEntry(2, run.now);
  resetCameraOrigin(run.camera);
  run.camera.scrollMode = cameraMode(run.p, run.world.event, 0);
  initializeWorldCamera(run.world, run.p, run.camera, run.now);

  let phase = 'approach', segmentTicks = 0;
  for (let tick = 0; tick < 2000 && run.world.event?.kind !== 71 && !run.p.hazard; tick++) {
    const input = {};
    if (run.world.stageEntry && !run.world.stageEntry.finished) input.fire = true;
    else if (run.world.event) input.enter = run.world.event.skippable !== false && !run.world.event.enterHeld;
    else if (phase === 'approach' && tick < 1000) {
      const grounded = run.p.onPlatform || supported(run.p.x, run.p.y + 4, sample);
      input.right = true;
      input.jump = grounded && tick % 40 === 0;
    } else if (phase === 'approach') phase = 'wall-left';

    if (phase === 'wall-left') {
      input.left = run.p.x > 4395;
      if (run.p.x <= 4395 && run.p.y >= 1300 && (run.p.onPlatform || supported(run.p.x, run.p.y + 4, sample))) phase = 'to-gap';
    } else if (phase === 'to-gap') {
      input.right = true;
      if (++segmentTicks === 9) { phase = 'settle1'; segmentTicks = 0; }
    } else if (phase === 'settle1') {
      if (run.p.y >= 1650 && (run.p.onPlatform || supported(run.p.x, run.p.y + 4, sample))) phase = 'drop1';
    } else if (phase === 'drop1') {
      input.right = segmentTicks < 13;
      input.left = segmentTicks >= 13 && segmentTicks < 23;
      if (++segmentTicks === 23) { phase = 'settle2'; segmentTicks = 0; }
    } else if (phase === 'settle2') {
      if (run.p.y >= 2035 && (run.p.onPlatform || supported(run.p.x, run.p.y + 4, sample))) phase = 'drop2';
    } else if (phase === 'drop2') {
      input.right = segmentTicks < 8;
      input.left = segmentTicks >= 8 && segmentTicks < 16;
      if (++segmentTicks === 16) { phase = 'settle3'; segmentTicks = 0; }
    } else if (phase === 'settle3') {
      if (run.p.y >= 2410 && (run.p.onPlatform || supported(run.p.x, run.p.y + 4, sample))) phase = 'drop3';
    } else if (phase === 'drop3') {
      input.right = segmentTicks < 8;
      input.left = segmentTicks >= 8 && segmentTicks < 16;
      if (++segmentTicks === 16) { phase = 'settle4'; segmentTicks = 0; }
    } else if (phase === 'settle4') {
      if (run.p.y >= 2800 && (run.p.onPlatform || supported(run.p.x, run.p.y + 4, sample))) phase = 'lower-run';
    } else if (phase === 'lower-run') {
      input.right = true;
      input.jump = segmentTicks === 0;
      segmentTicks++;
    }

    if (cameraActive(run.world)) advanceWorldCamera(run.world, run.p, run.camera, 2, run.now + tick * 1000 / 60);
    stepWorld(run.world, run.p, input, run.camera, sample, run.now + tick * 1000 / 60);
    if (run.p.respawnRequested) break;
  }

  assert.equal(run.world.event?.kind, 71, `stopped at phase=${phase}, x=${run.p.x}, y=${run.p.y}, lives=${run.p.lives}`);
  assert.deepEqual({ x: run.p.x, y: run.p.y, lives: run.p.lives, points: run.p.points }, { x: 5572, y: 3032, lives: 3, points: 126 });
});
