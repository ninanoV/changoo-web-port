import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, supported, bodyCollision, enterNextStage } from '../web/game.js';
import { createWorld, readStageObjects, initializeWorldCamera, advanceWorldCamera, cameraActive, stepWorld, isEnemy } from '../web/objects.js';
import { createStageEntry } from '../web/stage-entry.js';
import { cameraMode } from '../web/camera.js';

const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const map = decodeMap(archive.get('stage6.map'));
const mask = decodeImage(archive.get('block6.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);

test('the Stage 05 inventory carries the companion route through the next Stage 06 wall', () => {
  const world = createWorld(readStageObjects(map, config, archive), map);
  const player = createPlayer(24418, 5976);
  const camera = { x: 0, y: 0 };
  player.state = 'chickenAir';
  player.vx = -7;
  player.vy = 7;
  player.flightTicks = 982;
  player.lives = 2;
  player.points = 954;
  player.waterBombs = 1;
  player.companionItems[4] = 1;
  player.chocobi = 2;
  enterNextStage(player, 5);
  world.stageEntry = createStageEntry(6, 100000);
  initializeWorldCamera(world, player, camera, 100000);

  let now = 100000;
  let mode = 'entry';
  const companionItem = world.actors.find((actor) => actor.kind === 25 && actor.x === 1077);

  for (let tick = 0; tick < 1100 && !player.dead && !companionItem?.collected; tick++) {
    let input = { right: true };
    const grounded = supported(player.x, player.y + 4, sample)
      && ['idle', 'walk', 'land', 'chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state);
    const gap = grounded && !supported(player.x + 30, player.y + 4, sample);
    const wall = grounded && bodyCollision(player.x + 20, player.y, sample, player.body) !== 0;
    const farWall = grounded && bodyCollision(player.x + 90, player.y, sample, player.body) !== 0;
    const enemy = world.actors.filter((actor) => actor.active && !actor.removed && isEnemy(actor)
      && Math.abs(actor.x - player.x) < 300 && Math.abs(actor.y - player.y) < 280)
      .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
    const verticalEnemy = enemy?.body && enemy.y + enemy.body.bottom > player.y + player.body.top
      && enemy.y + enemy.body.top < player.y + player.body.bottom;
    const danger = grounded && verticalEnemy && enemy.x > player.x - 30 && enemy.x < player.x + 260;
    const wantJump = gap || wall || danger || (grounded && tick % 75 === 0);
    const bats = world.actors.filter((actor) => actor.kind === 119 && actor.active && !actor.removed
      && actor.x > player.x && actor.x - player.x <= 100 && player.vy > 0
      && player.y + player.body.top < actor.y + actor.body.top - 25);

    if (mode === 'entry') {
      if (world.stageEntry?.finished && player.x > 100 && player.y < 300) mode = 'run';
    } else if (mode === 'run') {
      if (player.x >= 1100 && player.x <= 1160 && farWall) { mode = 'companion'; input = { left: true, jump: true }; }
      else input = { right: true, jump: wantJump && !player.jumpHeld };
    } else if (mode === 'companion') {
      input = { left: player.x > 1077 };
    }
    if (bats.length && player.state === 'chickenAir' && !player.flapHeld && mode !== 'entry') input.fire = true;

    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
  }

  assert.equal(companionItem?.collected, true);
  assert.equal(player.companionItems[1], 1);
  assert.equal(player.lives, 5);
  assert.equal(player.state, 'chickenAir');

  const menuInputs = [
    { enter: true }, { enter: false },
    { down: true }, { down: false }, { down: true }, { down: false }, { down: true }, { down: false },
    { enter: true }, { enter: false },
  ];
  for (const input of menuInputs) {
    now += 1000 / 60;
    stepWorld(world, player, input, camera, sample, now);
  }
  assert.equal(world.companion?.slot, 3);
  assert.equal(player.companionItems[1], 0);

  for (let tick = 0; tick < 180 && !player.dead; tick++) {
    now += 1000 / 60;
    stepWorld(world, player, {}, camera, sample, now);
  }
  assert.equal(world.actors.some((actor) => actor.kind === 119 && actor.active && !actor.removed), false);

  let modeAfterSummon = 'approach';
  let hop = 'none';
  let lastGroundJump = -100;
  const slot6Menu = [{ enter: true }, { enter: false }, ...Array.from({ length: 3 }, () => [{ down: true }, { down: false }]).flat(), { enter: true }, { enter: false }];
  let slot6MenuIndex = -1;
  let slot6Wait = 0;
  let slot6Started = false;
  for (let tick = 0; tick < 5000 && player.x < 8053 && !player.dead; tick++) {
    const grounded = supported(player.x, player.y + 4, sample);
    const farWall = grounded && bodyCollision(player.x + 90, player.y, sample, player.body) !== 0;
    let input = {};
    if (modeAfterSummon === 'approach') {
      input = { right: true };
      if (player.x >= 1135 && farWall) { modeAfterSummon = 'drop'; input = { left: true }; }
    } else if (modeAfterSummon === 'drop') {
      if (player.x > 1128) input = { left: true };
      else if (player.y < 1025) input = {};
      else { modeAfterSummon = 'advance'; input = { right: true }; }
    } else {
      input = { right: true };
      if (hop === 'none' && player.x >= 1175 && player.x <= 1195 && player.state === 'chickenWalk'
        && grounded && !player.jumpHeld) { input = { jump: true }; hop = 'rise'; }
      else if (hop === 'rise') {
        input = {};
        if (player.y <= 1048 && player.vy < 0) { hop = 'cross'; input = { right: true }; }
      } else if (hop === 'cross') input = { right: true };
      if (player.x >= 1300 && player.y < 1152) input = {};
      else if (player.state === 'chickenAir' && tick % 5 === 0) input.fire = true;

      const target = world.actors.filter((actor) => actor.active && !actor.removed && isEnemy(actor)
        && actor.x > player.x && actor.x - player.x < 220 && actor.body
        && actor.y + actor.body.bottom > player.y + player.body.top
        && actor.y + actor.body.top < player.y + player.body.bottom)
        .sort((a, b) => a.x - b.x)[0];
      if (player.x > 3300 && grounded && target && ['idle', 'walk', 'chickenIdle', 'chickenWalk'].includes(player.state)
        && !player.jumpHeld && tick - lastGroundJump > 25) {
        input = { right: true, jump: true };
        lastGroundJump = tick;
      }
      const wall = player.x > 2000 && player.x < 8053 && grounded
        && bodyCollision(player.x + 20, player.y, sample, player.body) !== 0;
      if (wall && ['idle', 'walk'].includes(player.state) && !player.jumpHeld && tick - lastGroundJump > 25) {
        input = { right: true, jump: true };
        lastGroundJump = tick;
      }
      if (world.event?.kind === 114) input = { enter: !world.event.enterHeld };
      if (slot6MenuIndex < 0 && player.x >= 3000 && player.y >= 2850 && player.companionItems[4] > 0
        && (!world.inventory || world.inventory.removed) && !world.companion) slot6MenuIndex = 0;
      if (slot6MenuIndex >= 0 && slot6MenuIndex < slot6Menu.length) input = slot6Menu[slot6MenuIndex++];
      if (slot6Wait > 0) { input = {}; slot6Wait--; }
    }
    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
    if (world.companion?.slot === 6 && !slot6Started) { slot6Started = true; slot6Wait = 40; }
  }

  assert.ok(player.x >= 8053, `expected x>=8053, got ${player.x}`);
  assert.equal(player.dead, false);
  assert.equal(player.lives, 2);
  assert.equal(player.state, 'land');
  assert.equal(slot6Started, true);
  assert.deepEqual([player.x, player.y, player.points], [8057, 1880, 978]);
  const upperJumpTargets = [8057, 8282, 8530, 8858, 9085, 9333, 9581, 9752, 9902];
  let upperJumpTarget = 0;
  let crossedFinalUpperWall = false;
  for (let tick = 0; tick < 1400 && player.x < 11021 && !player.dead; tick++) {
    const grounded = supported(player.x, player.y + 4, sample);
    const oldJumpHeld = player.jumpHeld;
    let input = { right: true };
    const target = upperJumpTargets[upperJumpTarget];
    if (target !== undefined && player.x > target + 30) upperJumpTarget++;
    const activeTarget = upperJumpTargets[upperJumpTarget];
    if (activeTarget !== undefined && player.x >= activeTarget - 6 && player.x <= activeTarget + 30
      && grounded && ['idle', 'walk', 'land'].includes(player.state) && !player.jumpHeld) input.jump = true;
    if (activeTarget === undefined && grounded && ['idle', 'walk', 'land'].includes(player.state) && !player.jumpHeld) input.jump = true;
    const crawler = world.actors.filter((actor) => actor.kind === 34 && actor.active && !actor.removed
      && actor.state !== 4 && actor.x > player.x && actor.x - player.x < 160)
      .sort((a, b) => a.x - b.x)[0];
    if (player.x > 10000 && crawler && player.vy < 0 && player.y > crawler.y - 27) {
      input = { left: true };
    }
    if (world.event?.kind === 114) input = { enter: !world.event.enterHeld };
    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
    if (input.jump && player.jumpHeld && !oldJumpHeld) upperJumpTarget++;
    if (player.x >= 9264) crossedFinalUpperWall = true;
  }
  assert.equal(world.event, null);
  assert.equal(player.dead, false);
  assert.ok(player.x >= 11021, `expected the upper route to reach x11021, got ${player.x}`);
  assert.equal(crossedFinalUpperWall, true);
  assert.equal(player.lives, 2);
  assert.equal(player.x, 11021);
  assert.equal(player.state, 'air');
  assert.ok(player.y >= 1070 && player.y <= 1080, `unexpected wall approach height ${player.y}`);

  let springRoute = 'drop';
  let springClock = 0;
  let upperPlatform = false;
  for (let tick = 0; tick < 1800 && springRoute !== 'done' && !player.dead; tick++) {
    const grounded = supported(player.x, player.y + 4, sample);
    let input = {};
    if (springRoute === 'drop') {
      input = { left: true };
      if (player.x <= 10040) springRoute = 'approach';
    } else if (springRoute === 'approach') {
      input = { right: true };
      if (player.vy === -35) { springRoute = 'spring1356'; springClock = 0; }
    } else if (springRoute === 'spring1356') {
      input = springClock < 21 ? { left: true } : {};
      springClock++;
      if (player.vy === -35) { springRoute = 'spring796'; springClock = 0; }
    } else if (springRoute === 'spring796') {
      input = springClock < 16 ? { right: true } : {};
      springClock++;
      if (player.vy === -35) { springRoute = 'spring315'; springClock = 0; }
    } else if (springRoute === 'spring315') {
      input = springClock < 16 ? { left: true } : {};
      springClock++;
      if (player.vy === -35) { springRoute = 'upper'; springClock = 0; }
    } else if (springRoute === 'upper') {
      if (springClock < 18) { input = { right: true }; springClock++; }
      else if (!upperPlatform) {
        if (player.x < 10120 && player.y >= 24 && player.y <= 56) input = { right: true };
        if (grounded) upperPlatform = true;
      } else {
        input = { right: true };
        const crawler = world.actors.filter((actor) => actor.kind === 34 && actor.active && !actor.removed
          && actor.x > player.x && actor.x - player.x < 130)
          .sort((a, b) => a.x - b.x)[0];
        if (grounded && crawler && player.x > crawler.x - 110 && !player.jumpHeld) input.jump = true;
        if (grounded && player.x >= 11012 && player.x <= 11022 && !player.jumpHeld) input.jump = true;
        if (player.x >= 11050) springRoute = 'done';
      }
    }

    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
  }

  assert.equal(springRoute, 'done');
  assert.equal(player.dead, false);
  assert.equal(player.lives, 3);
  assert.ok(player.x >= 11050, `expected spring route to cross the x11024 wall, got ${player.x}`);
  assert.equal(bodyCollision(player.x, player.y, sample, player.body), 0);
});
