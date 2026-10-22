import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, supported } from '../web/game.js';
import { createWorld, readStageObjects, initializeWorldCamera, advanceWorldCamera, cameraActive, stepWorld } from '../web/objects.js';
import { cameraMode } from '../web/camera.js';

const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const map = decodeMap(archive.get('stage6.map'));
const mask = decodeImage(archive.get('block6.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);

test('the Stage 06 upper checkpoint keeps chicken flight through the x8240 and x9264 walls', () => {
  const world = createWorld(readStageObjects(map, config, archive), map);
  const player = createPlayer(8053, 1880);
  const camera = { x: 7892, y: 1606 };
  player.state = 'chickenIdle';
  player.lives = 1;
  player.points = 958;
  initializeWorldCamera(world, player, camera, 100000);

  let now = 100000;
  let upperWallCrossing = null;
  let maxX = player.x;
  for (let tick = 0; tick < 800 && player.x < 10000 && !player.dead; tick++) {
    const previousX = player.x;
    const grounded = supported(player.x, player.y + 4, sample);
    const input = { right: true };
    if (grounded && player.state === 'chickenIdle' && !player.jumpHeld) input.jump = true;
    if (player.state === 'chickenAir' && tick % 8 === 0) input.fire = true;

    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
    maxX = Math.max(maxX, player.x);
    if (!upperWallCrossing && previousX < 9264 && player.x >= 9264) {
      upperWallCrossing = { x: player.x, y: player.y };
    }
  }

  assert.equal(world.event, null, 'the natural Stage 06 scene at this checkpoint must finish');
  assert.ok(upperWallCrossing, 'the chicken route must cross the x9264 wall');
  assert.ok(upperWallCrossing.y + player.body.bottom < 1848, 'the crossing must pass above the wall');
  assert.ok(maxX >= 10000, 'the route must continue into the next map section');
  assert.equal(player.dead, false);
  assert.equal(player.lives, 1);
});
