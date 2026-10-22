import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer, collisionAt, enterNextStage, followCamera } from '../web/game.js';
import { enterBooster } from '../web/booster.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createWorld, readStageObjects, initializeWorldCamera, advanceWorldCamera, cameraActive, stepWorld } from '../web/objects.js';
import { cameraMode } from '../web/camera.js';
import { createStageEntry } from '../web/stage-entry.js';

const route = JSON.parse(readFileSync(new URL('./fixtures/native-booster-boss-route.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const map = decodeMap(archive.get('stage3.map')), mask = decodeImage(archive.get('block3.app'));

test('enemy-aware native stage3 route reaches the map-spawned boss with four lives', () => {
  const world = createWorld(readStageObjects(map, config, archive), map), player = createPlayer(0, 0);
  const camera = { x: 0, y: 0, scrollMode: 0 }, sample = (x, y) => collisionAt(map, mask, x, y);
  enterBooster(player); player.lives = 8; player.moveEnabled = true;
  initializeWorldCamera(world, player, camera, 1000);
  let tick = 0;
  for (const [keys, count] of route.runs) {
    const input = keys === '-' ? {} : Object.fromEntries(keys.split('+').map(key => [key, true]));
    for (let i = 0; i < count; i++) {
      const now = 1000 + Math.floor(++tick * 1000 / 60);
      camera.scrollMode = cameraMode(player, world.event, 0);
      if (cameraActive(world)) advanceWorldCamera(world, player, camera, 1, now);
      stepWorld(world, player, { ...input, jump: input.up }, camera, sample, now);
    }
  }
  const boss = world.actors.find(actor => actor.kind === 122 && actor.active && !actor.removed);
  assert.equal(tick, route.ticks);
  assert.deepEqual({ x: player.x, y: player.y, lives: player.lives, points: player.points }, route.expected.player);
  assert.deepEqual([camera.x, camera.y], route.expected.camera);
  assert.deepEqual({ x: boss?.x, y: boss?.y, health: boss?.health }, route.expected.boss);
});

test('stage3 14-life contract clears the route, booster exit and stage4 entry in the web model', () => {
  const world = createWorld(readStageObjects(map, config, archive), map), player = createPlayer(0, 0);
  const camera = { x: 0, y: 0, scrollMode: 0 }, sample = (x, y) => collisionAt(map, mask, x, y);
  enterBooster(player); player.lives = 14; player.moveEnabled = true;
  initializeWorldCamera(world, player, camera, 1000);
  let tick = 0;
  const advance = (input) => {
    const now = 1000 + Math.floor(++tick * 1000 / 60);
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 1, now);
    stepWorld(world, player, { ...input, jump: input.up }, camera, sample, now);
  };
  for (const [keys, count] of route.runs) {
    const input = keys === '-' ? {} : Object.fromEntries(keys.split('+').map(key => [key, true]));
    for (let i = 0; i < count; i++) advance(input);
  }
  let fightTick = 0;
  for (; fightTick < 1600 && !player.dead && !world.stageComplete; fightTick++) {
    const boss = world.actors.find(actor => actor.kind === 122 && actor.active && !actor.removed);
    if (!boss) break;
    const dx = boss.x - 500 - player.x, dy = boss.y + 70 - player.y;
    const vx = Math.max(-8, Math.min(8, dx * 0.35)), vy = Math.max(-10, Math.min(10, dy * 0.35));
    advance({ right: vx > player.vx + 0.1, left: vx < player.vx - 0.1,
      down: vy > player.vy + 0.1, up: vy < player.vy - 0.1, fire: fightTick % 8 === 0 });
  }
  assert.equal(world.actors.find(actor => actor.kind === 122)?.health, 0);
  assert.equal(player.lives, 2);
  assert.equal(player.points, 31);
  for (let i = 0; i < 900 && !world.stageComplete; i++) advance({});
  assert.equal(world.stageComplete, true);
  assert.equal(world.stageEntry.stage, 'boosterExit');
  assert.equal(world.stageEntry.transitions, 1);

  enterNextStage(player, 4);
  const nextMap = decodeMap(archive.get('stage4.map')), nextMask = decodeImage(archive.get('block4.app'));
  const next = createWorld(readStageObjects(nextMap, config, archive), nextMap, world.randomSeed), view = { x: 0, y: 0 };
  next.stageEntry = createStageEntry(5);
  let fallingX, resumed = 0;
  for (let i = 0; i < 1300 && resumed < 20; i++) {
    stepWorld(next, player, { right: true }, view, (x, y) => collisionAt(nextMap, nextMask, x, y), 100000 + i * 1000 / 30);
    if (next.stageEntry.finished) followCamera(view, player, nextMap);
    if (next.falling) { fallingX ??= player.x; assert.equal(player.x, fallingX); }
    else if (fallingX !== undefined) resumed++;
  }
  assert.deepEqual([nextMap.width, nextMap.height], [999, 200]);
  assert.equal(next.stageEntry.finished, true);
  assert.equal(next.falling, false);
  assert.equal(resumed, 20);
  assert.equal(player.booster, false);
  assert.deepEqual({ x: player.x, y: player.y, lives: player.lives, points: player.points }, { x: 126, y: 6232, lives: 5, points: 31 });
});
