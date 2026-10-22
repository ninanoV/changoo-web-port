import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { collisionAt, createPlayer } from '../web/game.js';
import { createWorld, readStageObjects, stepWorld } from '../web/objects.js';

const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const map = decodeMap(archive.get('stage6.map'));
const mask = decodeImage(archive.get('block6.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);

test('chicken flight from the x17249 checkpoint crosses the final upper wall', () => {
  const world = createWorld(readStageObjects(map, config, archive), map);
  for (const actor of world.actors) actor.active = false;
  for (const surface of world.surfaces) {
    surface.active = surface.kind === 94 && surface.x > 17000 && surface.x < 18400;
    surface.born = false;
  }

  const player = createPlayer(17249, 2258);
  player.state = 'chickenAir';
  player.vx = 7;
  player.vy = -16;
  player.flightTicks = 0;
  player.lives = 2;
  const camera = { x: 17000, y: 1800, scrollMode: 0 };
  let now = 100000;

  for (let tick = 0; tick < 500 && player.x < 18176 && !player.dead; tick++) {
    now += 1000 / 60;
    stepWorld(world, player, { right: true, fire: tick % 2 === 0 }, camera, sample, now);
  }

  assert.equal(player.dead, false);
  assert.ok(player.x >= 18176, `expected x>=18176, got ${player.x}`);
  assert.equal(player.state, 'chickenAir');
  assert.ok(player.y >= 1640 && player.y <= 1688, `unexpected upper-passage height ${player.y}`);
});
