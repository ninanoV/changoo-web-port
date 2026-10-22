import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer, collisionAt, supported } from '../web/game.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createWorld, readStageObjects, stepWorld, initializeWorldCamera, advanceWorldCamera, cameraActive } from '../web/objects.js';

const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const map = decodeMap(archive.get('stage2.map'));
const mask = decodeImage(archive.get('block2.app'));
const definitions = readStageObjects(map, config, archive);
const sample = (x, y) => collisionAt(map, mask, x, y);

test('local stage-two spring checkpoint collects chicken and passes under the x9856 wall', () => {
  const player = createPlayer(7341, 2776), world = createWorld(definitions, map);
  const camera = { x: 7021, y: 2400 };
  player.lives = 3;
  world.playedEvents.add('boss2Intro');
  initializeWorldCamera(world, player, camera, 0);
  const chicken = world.actors.find((actor) => actor.kind === 11 && actor.x === 8152);
  assert.ok(chicken);
  assert.equal(player.state, 'idle', 'the checkpoint starts in the normal form');

  let phase = 'approach', jumpTwoAt = null, brakeTicks = 0, pickup = null, wallTicks = 0, lastX = player.x;
  for (let tick = 0; tick < 800 && player.x < 10200 && !player.dead && !player.hazard; tick++) {
    const input = {};
    if (phase === 'approach') {
      input.right = true;
      input.jump = tick === 5;
      const grounded = player.onPlatform || supported(player.x, player.y + 4, sample);
      if (jumpTwoAt === null && tick > 90 && player.x >= 7800 && player.x < 7950 && grounded && !player.jumpHeld) {
        input.jump = true;
        jumpTwoAt = tick;
      }
    }
    if (phase === 'approach' && jumpTwoAt !== null && player.x >= 8135 && player.vy > 0) {
      phase = 'brake';
      brakeTicks = 0;
    } else if (phase === 'brake') {
      if (brakeTicks++ === 0) input.left = true;
      else phase = 'coast';
    } else if (phase === 'flutter') {
      input.right = true;
      input.fire = tick % 2 === 0;
      if (player.x >= 9800 && player.x === lastX) wallTicks++;
      else wallTicks = 0;
      if (wallTicks >= 8) phase = 'fall';
    } else if (phase === 'fall') {
      input.right = true;
      if (player.y >= 2992) phase = 'under-wall';
    } else if (phase === 'under-wall') {
      input.right = true;
      if (player.state === 'chickenAir') input.fire = tick % 2 === 0;
    }

    if (world.event) input.enter = world.event.skippable !== false && !world.event.enterHeld;
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 2, tick * 1000 / 60);
    stepWorld(world, player, input, camera, sample, tick * 1000 / 60);
    if (chicken.removed && pickup === null) {
      pickup = { tick, x: player.x, y: player.y, state: player.state };
      phase = 'flutter';
    }
    lastX = player.x;
  }

  assert.ok(pickup);
  assert.ok(pickup.tick >= 190 && pickup.tick <= 200);
  assert.ok(pickup.x >= 8100 && pickup.x <= 8120);
  assert.ok(pickup.y >= 2620 && pickup.y <= 2630);
  assert.equal(pickup.state, 'chickenIdle');
  assert.equal(chicken.removed, true);
  assert.equal(player.lives, 2);
  assert.ok(player.x >= 10200, `stopped at x=${player.x}, y=${player.y}, phase=${phase}`);
  assert.equal(player.dead, false);
  assert.equal(player.hazard, false);
});
