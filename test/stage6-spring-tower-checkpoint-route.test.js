import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { bodyCollision, collisionAt, createPlayer, supported } from '../web/game.js';
import { createWorld, readStageObjects, stepWorld } from '../web/objects.js';

const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const map = decodeMap(archive.get('stage6.map'));
const mask = decodeImage(archive.get('block6.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);

test('the Stage 06 lower spring checkpoint reaches the x17248 passage', () => {
  const world = createWorld(readStageObjects(map, config, archive), map);
  for (const actor of world.actors) actor.active = false;
  for (const surface of world.surfaces) {
    surface.active = surface.kind === 94 && surface.x > 16000 && surface.x < 18300;
    surface.born = false;
  }

  const player = createPlayer(16397, 594);
  player.state = 'air';
  player.vx = 7;
  player.vy = 11;
  player.lives = 2;
  const camera = { x: 16000, y: 2500, scrollMode: 0 };
  let now = 100000;
  let phase = 'to892';
  let movementTicks = 0;

  for (let tick = 0; tick < 1200 && phase !== 'done' && !player.dead; tick++) {
    let input = {};

    if (phase === 'to892') {
      input = { left: true };
      if (player.vy === -35 && Math.abs(player.y - 821) < 20) {
        phase = 'clear349';
        movementTicks = 0;
      }
    } else if (phase === 'clear349') {
      input = movementTicks < 8 ? { left: true } : {};
      if (++movementTicks >= 8) phase = 'wait349';
    } else if (phase === 'wait349') {
      if (player.y > 300 && player.vy > 0) phase = 'right892';
    } else if (phase === 'right892') {
      input = { right: true };
      if (player.x >= 16390) phase = 'wait892';
    } else if (phase === 'wait892') {
      if (player.y > 850 && player.vy > 0) phase = 'left1306';
    } else if (phase === 'left1306') {
      input = { left: true };
      if (player.x <= 16200) phase = 'wait1306';
    } else if (phase === 'wait1306') {
      if (player.y > 1250 && player.vy > 0) phase = 'right1659';
    } else if (phase === 'right1659') {
      input = { right: true };
      if (player.x >= 16252) phase = 'wait1659Pass';
    } else if (phase === 'wait1659Pass') {
      if (player.y > 1600 && player.vy > 0) phase = 'right1981';
    } else if (phase === 'right1981') {
      input = { right: true };
      if (player.x >= 16390) phase = 'wait1981';
    } else if (phase === 'wait1981') {
      if (player.y > 1915 && player.vy > 0) phase = 'wait2365';
    } else if (phase === 'wait2365') {
      if (player.y > 2294 && player.vy > 0) {
        phase = 'gap2716';
        movementTicks = 0;
      }
    } else if (phase === 'gap2716') {
      input = movementTicks < 20 ? { left: true } : {};
      if (++movementTicks >= 20) phase = 'waitBottom';
    } else if (phase === 'waitBottom') {
      if (player.y > 2670 && player.vy > 0) phase = 'crossWall';
    } else if (phase === 'crossWall') {
      input = { right: true };
      if (player.x > 16430) phase = 'bottomRun';
    } else if (phase === 'bottomRun') {
      input = { right: true };
      if (player.x >= 17229) phase = 'done';
    }

    now += 1000 / 60;
    player.moveEnabled = true;
    stepWorld(world, player, input, camera, sample, now);
  }

  assert.equal(phase, 'done');
  assert.equal(player.dead, false);

  let continuation = 'retreat';
  let jumped = false;
  let springHop = false;
  for (let tick = 0; tick < 1800 && continuation !== 'done' && !player.dead; tick++) {
    let input = {};
    if (continuation === 'retreat') {
      input = { left: true };
      if (player.x <= 16650) continuation = 'settle';
    } else if (continuation === 'settle') {
      if (supported(player.x, player.y + 4, sample) && player.state !== 'air' && player.state !== 'hurt') {
        continuation = 'jump';
      }
    } else if (continuation === 'jump') {
      if (!jumped && player.x > 16610 && player.x < 16670) {
        input.jump = true;
        jumped = true;
      } else if (jumped && player.vy === -35 && player.y < 3000) continuation = 'toPlatform';
    } else if (continuation === 'toPlatform') {
      input = { right: true };
      if (player.x >= 16805) continuation = 'waitPlatform';
    } else if (continuation === 'waitPlatform') {
      if (supported(player.x, player.y + 4, sample) && player.state !== 'air') {
        continuation = 'platformRun';
        jumped = false;
      }
    } else if (continuation === 'platformRun') {
      input = springHop ? {} : { right: true };
      if (!jumped && player.x >= 16900 && player.x < 16930
        && supported(player.x, player.y + 4, sample) && !player.jumpHeld) {
        input.jump = true;
        jumped = true;
      } else if (jumped && !springHop && player.x >= 17100 && player.x < 17150
        && supported(player.x, player.y + 4, sample) && !player.jumpHeld) {
        input.jump = true;
        springHop = true;
      }
      if (player.vy === -35 && player.y < 2800) continuation = 'through17248';
    } else if (continuation === 'through17248') {
      input = { right: true };
      if (player.x >= 17248) continuation = 'done';
    }

    now += 1000 / 60;
    player.moveEnabled = true;
    stepWorld(world, player, input, camera, sample, now);
  }

  assert.equal(continuation, 'done');
  assert.equal(player.dead, false);
  assert.ok(player.x >= 17248, `expected x>=17248, got ${player.x}`);
  assert.ok(player.y >= 2200 && player.y <= 2300, `unexpected second-wall crossing height ${player.y}`);
  assert.equal(bodyCollision(player.x, player.y, sample, player.body), 0);
});
