import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, supported } from '../web/game.js';
import { createWorld, readStageObjects, stepWorld, initializeWorldCamera, advanceWorldCamera, cameraActive } from '../web/objects.js';
import { cameraMode } from '../web/camera.js';

const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const map = decodeMap(archive.get('stage4.map'));
const mask = decodeImage(archive.get('block4.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);

test('the Stage 05 entry reaches the verified route checkpoint at x4173', () => {
  const world = createWorld(readStageObjects(map, config, archive), map);
  const player = createPlayer(0, 6232);
  const camera = { x: 0, y: 5760 };
  player.state = 'land';
  player.lives = 5;
  player.points = 835;
  world.stageEntry = { stage: 5, phase: 46, ticks: 0, startedAt: 0, now: 0, finished: true, transitions: 0, render: [] };
  initializeWorldCamera(world, player, camera, 0);

  let now = 0;
  let originWall = 'approach';
  for (let tick = 0; tick < 8000 && !(player.x >= 4173 && player.state === 'land') && !player.dead; tick++) {
    let input = tick < 60 ? { left: true, jump: tick % 8 === 0 } : { right: true, jump: tick % 8 === 0 };
    if (originWall === 'approach' && player.x >= 2550) originWall = 'retreat';
    if (originWall === 'retreat') {
      input = { left: true };
      if (player.x <= 2590) originWall = 'settle';
    } else if (originWall === 'settle') {
      input = {};
      if (supported(player.x, player.y + 4, sample) && !['air', 'hurt'].includes(player.state)) originWall = 'jump';
    } else if (originWall === 'jump') {
      input = player.jumpHeld ? { right: true } : { right: true, jump: true };
      if (player.jumpHeld) originWall = 'cross';
    } else if (originWall === 'cross') {
      input = { right: true };
      if (player.x >= 2760) originWall = 'run';
    } else if (originWall === 'run' && player.x < 4173) {
      input = { right: true, jump: tick % 8 === 0 };
    } else if (originWall === 'run') input = {};

    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 5, now);
    stepWorld(world, player, input, camera, sample, now);
  }

  assert.equal(player.dead, false);
  assert.equal(originWall, 'run');
  assert.deepEqual([player.x, player.y, player.lives, player.points, player.state], [4173, 5336, 5, 850, 'land']);
});
