import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { collisionAt, createPlayer, supported } from '../web/game.js';
import { createWorld, readStageObjects, stepWorld } from '../web/objects.js';

const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const puzzleFixture = JSON.parse(readFileSync(new URL('./fixtures/original-puzzle.json', import.meta.url)));
const map = decodeMap(archive.get('stage6.map'));
const mask = decodeImage(archive.get('block6.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);

test('the Stage 06 chicken checkpoint reaches the final battle through its puzzle portal', () => {
  const world = createWorld(readStageObjects(map, config, archive), map);
  for (const actor of world.actors) {
    actor.active = false;
    actor.removed = true;
  }
  const puzzlePortal = world.actors.find((actor) => actor.kind === 125 && Math.abs(actor.x - 17760) < 16);
  assert.ok(puzzlePortal, 'the upper route must include its kind125 puzzle portal');
  puzzlePortal.active = true;
  puzzlePortal.removed = false;
  puzzlePortal.born = false;

  for (const surface of world.surfaces) {
    surface.active = surface.kind === 94 && surface.x > 17500 && surface.x < 18400;
    surface.born = false;
  }
  for (const trigger of world.triggers) {
    trigger.active = trigger.kind === 116;
    trigger.born = false;
    trigger.removed = trigger.kind !== 116;
  }

  const player = createPlayer(17249, 2258);
  player.state = 'chickenAir';
  player.vx = 7;
  player.vy = -16;
  player.flightTicks = 0;
  player.lives = 2;
  const camera = { x: 17000, y: 2500, scrollMode: 0 };
  let now = 100000;
  let waypointIndex = 0;
  let lastJump = -50;
  let puzzleSolved = false;
  let finalTriggerPosition = null;
  const waypoints = [
    [18012, 1740], [17932, 1820], [17932, 2108], [17900, 2140],
    [17900, 2252], [17916, 2268], [17964, 2268], [17996, 2300],
    [17996, 2444], [17980, 2460], [17836, 2460], [17804, 2492],
    [17804, 2636], [17820, 2652], [18108, 2652], [18140, 2684],
  ];

  for (let tick = 0; tick < 500 && player.x < 18176 && !player.dead; tick++) {
    now += 1000 / 60;
    stepWorld(world, player, { right: true, fire: tick % 2 === 0 }, camera, sample, now);
  }
  assert.ok(player.x >= 18176, `expected upper flight route to reach x18176, got ${player.x}`);
  assert.equal(player.dead, false);

  for (let tick = 0; tick < 240 && !player.dead; tick++) {
    const grounded = supported(player.x, player.y + 4, sample)
      && ['idle', 'walk', 'land', 'chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state);
    if (grounded && player.y >= 1740 && player.y <= 1764) break;
    now += 1000 / 60;
    stepWorld(world, player, {}, camera, sample, now);
  }

  for (let tick = 0; tick < 2500 && !player.dead && !world.event; tick++) {
    if (world.minigame?.kind === 'puzzle' && !puzzleSolved) {
      const trace = puzzleFixture.traces[0].trace;
      const timeBase = now - trace[0].now;
      for (const entry of trace) {
        now = timeBase + entry.now;
        stepWorld(world, player, { ...entry.input, jump: entry.input.up }, camera, sample, now);
      }
      for (let i = 0; i < 10; i++) {
        now = timeBase + 20000 + i * 1000 / 30;
        stepWorld(world, player, { right: true }, camera, sample, now);
      }
      now = timeBase + 20333;
      puzzleSolved = true;
      continue;
    }

    let input = {};
    if (puzzleSolved) {
      if (player.y >= 2670) {
        input = { right: true };
        if (tick % 8 === 0) input.fire = true;
      }
    } else {
      const [targetX, targetY] = waypoints[waypointIndex];
      const dx = targetX - player.x;
      const dy = targetY - player.y;
      if (Math.abs(dx) > 10) input[dx > 0 ? 'right' : 'left'] = true;
      const grounded = supported(player.x, player.y + 4, sample)
        && ['idle', 'walk', 'land', 'chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state);
      if (dy < -24 && grounded && !player.jumpHeld && tick - lastJump > 10) {
        input.jump = true;
        lastJump = tick;
      } else if (dy < -24 && player.state === 'chickenAir' && !player.flapHeld
        && player.y > targetY + 15 && tick % 4 === 0) input.fire = true;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 26) waypointIndex++;
    }

    now += 1000 / 60;
    stepWorld(world, player, input, camera, sample, now);
    if (!finalTriggerPosition && world.event?.kind === 116) finalTriggerPosition = [player.x, player.y];
  }

  assert.equal(puzzleSolved, true, 'the portal puzzle must finish before the lower route resumes');
  assert.equal(player.dead, false);
  assert.equal(world.event?.kind, 116);
  assert.ok(finalTriggerPosition, 'kind116 must start during the lower approach');
  assert.ok(finalTriggerPosition[0] >= 18024 && finalTriggerPosition[0] <= 18186);
  assert.ok(finalTriggerPosition[1] >= 2653 && finalTriggerPosition[1] <= 2720);
  assert.ok(player.x >= 18024, `expected the player inside the final trigger, got x=${player.x}`);
  assert.ok(player.y >= 2653, `expected the lower trigger approach, got y=${player.y}`);

  for (let tick = 0; tick < 1300 && world.event; tick++) {
    now += 1000 / 30;
    stepWorld(world, player, {}, camera, sample, now);
  }

  assert.equal(world.event, null);
  assert.equal(world.finalBossesRemaining, 2);
  assert.equal(world.actors.filter((actor) => [41, 59].includes(actor.kind) && actor.spawnOrder !== undefined).length, 2);
});
