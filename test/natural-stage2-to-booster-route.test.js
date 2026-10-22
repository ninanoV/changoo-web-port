import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { start, step } from '../tools/route-stage1.mjs';
import { createPlayer, collisionAt, enterNextStage } from '../web/game.js';
import { enterFlight } from '../web/flight.js';
import { enterBooster } from '../web/booster.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createWorld, readStageObjects, stepWorld, initializeWorldCamera, advanceWorldCamera, cameraActive } from '../web/objects.js';
import { createStageEntry } from '../web/stage-entry.js';
import { resetCameraOrigin, cameraMode } from '../web/camera.js';

const stage1Route = JSON.parse(readFileSync(new URL('./fixtures/stage1-complete-route.json', import.meta.url)));
const stage2Route = JSON.parse(readFileSync(new URL('./fixtures/stage2-60hz-natural-route.json', import.meta.url)));
const boosterRoute = JSON.parse(readFileSync(new URL('./fixtures/natural-booster-boss-route.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const decodeKeys = (encoded) => encoded === '-' ? {} : Object.fromEntries(encoded.split('+').map((key) => [key, true]));
const sample = (map, mask) => (x, y) => {
  if (x < 0 || y < 0 || x >= map.width * 32 || y >= map.height * 32) return 0;
  const tile = map.cells[(Math.floor(y / 32) * map.width + Math.floor(x / 32)) * 5 + 1];
  return tile < 0 ? 0 : mask.pixels[(Math.floor(tile / 20) * 32 + y % 32) * mask.width + (tile % 20) * 32 + x % 32] ?? 0;
};

test('natural campaign route clears booster boss and loads Stage 05 entry', () => {
  const stage2Map = decodeMap(archive.get('stage2.map'));
  const stage2Mask = decodeImage(archive.get('block2.app'));
  const run = start();
  for (const [encoded, count] of stage1Route.runs) {
    const input = decodeKeys(encoded);
    for (let i = 0; i < count; i++) step(run, input);
  }
  step(run, {});
  assert.equal(run.world.stageComplete, true);

  const previous = run.world;
  const stage2 = createWorld(readStageObjects(stage2Map, config, archive), stage2Map, previous.randomSeed, previous);
  stage2.dog = previous.dog;
  stage2.stageEntry = createStageEntry(2, run.now);
  enterNextStage(run.p, 1);
  const camera = structuredClone(run.camera);
  resetCameraOrigin(camera);
  camera.scrollMode = cameraMode(run.p, stage2.event, 0);
  initializeWorldCamera(stage2, run.p, camera, run.now);
  let stage2Tick = 0;
  for (const [encoded, count] of stage2Route.runs) {
    const input = decodeKeys(encoded);
    for (let i = 0; i < count; i++) {
      const now = run.now + Math.floor(++stage2Tick * 1000 / 60);
      camera.scrollMode = cameraMode(run.p, stage2.event, 0);
      if (cameraActive(stage2)) advanceWorldCamera(stage2, run.p, camera, 2, now);
      stepWorld(stage2, run.p, input, camera, sample(stage2Map, stage2Mask), now);
    }
  }
  assert.equal(stage2.stageComplete, true);
  assert.equal(stage2.stageEntry?.stage, 'stage2Exit');
  assert.equal(run.p.lives, 1);
  assert.equal(run.p.points, 217);

  enterNextStage(run.p, 2);
  enterFlight(run.p);
  const shootMap = decodeMap(archive.get('shoot.map'));
  const shootMask = decodeImage(archive.get('sblock.app'));
  const shoot = createWorld(readStageObjects(shootMap, config, archive), shootMap, stage2.randomSeed, stage2);
  shoot.stageEntry = createStageEntry(3, run.now + Math.floor(stage2Tick * 1000 / 60));
  resetCameraOrigin(camera);
  camera.scrollMode = cameraMode(run.p, shoot.event, 0);
  initializeWorldCamera(shoot, run.p, camera, run.now + Math.floor(stage2Tick * 1000 / 60));
  let flightTick = 0;
  for (; flightTick < 16000 && !run.p.dead && !shoot.stageComplete; flightTick++) {
    const now = run.now + Math.floor(stage2Tick * 1000 / 60) + Math.floor((flightTick + 1) * 1000 / 30);
    camera.scrollMode = cameraMode(run.p, shoot.event, 0);
    if (cameraActive(shoot)) advanceWorldCamera(shoot, run.p, camera, 3, now);
    const boss = shoot.actors.find((actor) => actor.kind === 33 && actor.active && !actor.removed);
    const target = boss ?? shoot.actors.filter((actor) => [55, 56, 57, 60, 61, 62, 63, 64].includes(actor.kind)
      && actor.active && !actor.removed && actor.state !== 4 && actor.x > run.p.x + 100).sort((a, b) => a.x - b.x)[0];
    const y = target ? target.y + (boss ? 70 : 6) : 240;
    stepWorld(shoot, run.p, { right: boss ? run.p.x < boss.x - 140 : run.p.x < camera.x + 350,
      jump: run.p.y > y + 12, down: run.p.y < y - 12, fire: flightTick % 10 === 0 }, camera,
    (x, y) => collisionAt(shootMap, shootMask, x, y), now);
  }
  const flightBoss = shoot.actors.find((actor) => actor.kind === 33);
  assert.equal(shoot.stageComplete, true);
  assert.equal(run.p.dead, false);
  assert.equal(flightBoss?.health, 0);
  assert.deepEqual({ lives: run.p.lives, points: run.p.points }, { lives: 1, points: 787 });

  enterNextStage(run.p, 3);
  enterBooster(run.p);
  const boosterMap = decodeMap(archive.get('stage3.map'));
  const boosterMask = decodeImage(archive.get('block3.app'));
  const booster = createWorld(readStageObjects(boosterMap, config, archive), boosterMap, shoot.randomSeed);
  booster.stageEntry = createStageEntry(4);
  const view = { x: 0, y: 0 };
  initializeWorldCamera(booster, run.p, view, 200000);
  assert.ok(booster.actors.some((actor) => actor.kind === 21 && actor.active), 'the stage-entry camera scan activates the first visible enemy');
  let fireHit = false;
  for (let tick = 0; tick < 160; tick++) {
    const now = 200000 + tick * 1000 / 60;
    view.scrollMode = cameraMode(run.p, booster.event, 0);
    if (cameraActive(booster)) advanceWorldCamera(booster, run.p, view, 4, now);
    stepWorld(booster, run.p, { right: true, down: true, fire: tick === 100 }, view,
      (x, y) => collisionAt(boosterMap, boosterMask, x, y), now);
    fireHit ||= booster.projectiles.some((shot) => shot.type === 35);
  }
  assert.equal(booster.stageEntry.finished, true);
  assert.equal(run.p.booster, true);
  assert.equal(run.p.flight, false);
  assert.equal(fireHit, true);
  assert.ok(run.p.x > 0 && run.p.y > 0);
  assert.deepEqual({ lives: run.p.lives, points: run.p.points }, { lives: 4, points: 787 });
  assert.deepEqual([run.p.x, run.p.y, run.p.vx, run.p.vy, run.p.lives, run.p.points], [426, 280, 8, 10, 4, 787]);
  assert.deepEqual([view.x, view.y], [113, 17]);

  assert.deepEqual([run.p.x, run.p.y, run.p.vx, run.p.vy, run.p.lives, run.p.points], boosterRoute.checkpoint.player);
  assert.deepEqual([view.x, view.y], boosterRoute.checkpoint.camera);
  let boosterTick = 0;
  for (const [encoded, count] of boosterRoute.runs) {
    const input = decodeKeys(encoded);
    for (let i = 0; i < count; i++) {
      const now = 200000 + Math.floor((160 + ++boosterTick) * 1000 / 60);
      view.scrollMode = cameraMode(run.p, booster.event, 0);
      if (cameraActive(booster)) advanceWorldCamera(booster, run.p, view, 4, now);
      stepWorld(booster, run.p, { ...input, jump: input.up }, view,
        (x, y) => collisionAt(boosterMap, boosterMask, x, y), now);
    }
  }
  assert.equal(boosterTick, boosterRoute.ticks);
  assert.deepEqual([run.p.x, run.p.y, run.p.lives, run.p.points], boosterRoute.expected.player);
  assert.equal(run.p.dead, false);
  assert.equal(booster.stageComplete, true);
  assert.equal(booster.stageEntry?.stage, 'boosterExit');
  assert.equal(booster.stageEntry?.transitions, 1);
  assert.equal(booster.actors.find((actor) => actor.kind === 122)?.health, 0);
  const nextMap = decodeMap(archive.get('stage4.map')), nextMask = decodeImage(archive.get('block4.app'));
  assert.deepEqual([nextMap.width, nextMap.height], [999, 200]);
  enterNextStage(run.p, 4);
  const next = createWorld(readStageObjects(nextMap, config, archive), nextMap, booster.randomSeed, booster);
  next.dog = booster.dog;
  const nextNow = 200000 + Math.floor((160 + boosterTick) * 1000 / 60);
  next.stageEntry = createStageEntry(5, nextNow);
  resetCameraOrigin(view);
  view.scrollMode = cameraMode(run.p, next.event, 0);
  initializeWorldCamera(next, run.p, view, nextNow);
  for (let i = 0; i < 3000 && (!next.stageEntry.finished || next.falling); i++) {
    const now = nextNow + Math.floor((i + 1) * 1000 / 60);
    view.scrollMode = cameraMode(run.p, next.event, 0);
    if (cameraActive(next)) advanceWorldCamera(next, run.p, view, 5, now);
    stepWorld(next, run.p, { right: true }, view, (x, y) => collisionAt(nextMap, nextMask, x, y), now);
  }
  assert.equal(next.stageEntry.finished, true);
  assert.equal(next.falling, false);
  assert.equal(run.p.booster, false);
  assert.equal(run.p.flight, false);
  assert.equal(run.p.dead, false);
  assert.equal(run.p.lives, 5);
  assert.equal(run.p.points, 835);
});
