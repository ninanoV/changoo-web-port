import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { start, step } from '../tools/route-stage1.mjs';
import { enterNextStage } from '../web/game.js';
import { decodeMap, readArchive } from '../web/resources.js';
import { readStageObjects, createWorld } from '../web/objects.js';
import { createStageEntry } from '../web/stage-entry.js';
import { resetCameraOrigin } from '../web/camera.js';

const route = JSON.parse(readFileSync(new URL('./fixtures/stage1-complete-route.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));

test('native-matched stage-one route defeats the boss and enters stage two in the web model', () => {
  const run = start();
  for (const [encoded, count] of route.runs) {
    const input = encoded === '-' ? {} : Object.fromEntries(encoded.split('+').map(key => [key, true]));
    for (let tick = 0; tick < count; tick++) step(run, input);
  }
  assert.equal(run.tick, route.ticks);
  const boss = run.world.actors.find(actor => actor.kind === 18);
  assert.equal(boss.health, route.expected.boss.health);
  assert.equal(boss.state, route.expected.boss.state);
  assert.equal(boss.removed, route.expected.boss.removed);
  assert.deepEqual({ x: run.p.x, y: run.p.y, lives: run.p.lives, points: run.p.points }, route.expected.player);

  step(run, {});
  assert.equal(run.world.stageComplete, route.expected.stageCompleteAfterNextTick);
  enterNextStage(run.p, 1);
  resetCameraOrigin(run.camera);
  const nextMap = decodeMap(archive.get('stage2.map'));
  const next = createWorld(readStageObjects(nextMap, config, archive), nextMap, run.world.randomSeed);
  next.stageEntry = createStageEntry(2);
  assert.deepEqual([nextMap.width, nextMap.height], [1401, 100]);
  assert.deepEqual({ x: run.p.x, y: run.p.y, lives: run.p.lives, points: run.p.points, moveEnabled: run.p.moveEnabled }, {
    x: route.expected.nativeTransition.playerX, y: route.expected.nativeTransition.playerY,
    lives: route.expected.nativeTransition.lives, points: route.expected.nativeTransition.points,
    moveEnabled: route.expected.nativeTransition.moveEnabled,
  });
  assert.equal(next.stageEntry.stage, 2);
  assert.deepEqual([run.camera.x, run.camera.y], [route.expected.nativeTransition.cameraX, route.expected.nativeTransition.cameraY]);
});
