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

test('the Stage 05 handoff reaches the x11058 Stage 06 passage without companions', () => {
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
  let lowerFloorReached = false;
  let firstBatFlaps = 0;
  let wallJumping = false;
  let wallJumpIssued = false;
  let wallJumpStartX = 0;

  for (let tick = 0; tick < 1300 && !player.dead && player.x < 1192; tick++) {
    let input = { right: true };
    const grounded = supported(player.x, player.y + 4, sample)
      && ['idle', 'walk', 'land', 'chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state);
    const gap = grounded && !supported(player.x + 30, player.y + 4, sample);
    const wall = grounded && bodyCollision(player.x + 20, player.y, sample, player.body) !== 0;
    const farWall = grounded && bodyCollision(player.x + 90, player.y, sample, player.body) !== 0;
    const bats = world.actors.filter((actor) => actor.kind === 119 && actor.active && !actor.removed
      && actor.x > player.x && actor.x - player.x <= 100 && player.vy > 0
      && player.y + player.body.top < actor.y + actor.body.top - 25).sort((a, b) => a.x - b.x);
    const enemy = world.actors.filter((actor) => actor.active && !actor.removed && isEnemy(actor)
      && Math.abs(actor.x - player.x) < 300 && Math.abs(actor.y - player.y) < 280)
      .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
    const verticalEnemy = enemy?.body && enemy.y + enemy.body.bottom > player.y + player.body.top
      && enemy.y + enemy.body.top < player.y + player.body.bottom;
    const danger = grounded && verticalEnemy && enemy.x > player.x - 30 && enemy.x < player.x + 260;

    if (mode === 'entry') {
      if (world.stageEntry?.finished && player.x > 100 && player.y < 300) mode = 'run';
    } else if (mode === 'run') {
      if (player.x >= 1100 && player.x <= 1160 && farWall) mode = 'wallDrop';
      else input = { right: true, jump: (gap || danger) && !player.jumpHeld };
    } else if (mode === 'wallDrop') {
      input = { left: player.x > 1128 };
      if (player.x <= 1128) mode = 'fall';
    } else if (mode === 'fall') {
      input = {};
      if (player.y >= 1025 && player.vy > 0) { mode = 'lowerRun'; lowerFloorReached = true; }
    } else if (mode === 'lowerRun') {
      if (wall && grounded && !wallJumping) {
        wallJumping = true; wallJumpIssued = false; wallJumpStartX = player.x;
      }
      if (wallJumping) {
        if (grounded && !player.jumpHeld && !wallJumpIssued) { input = { jump: true }; wallJumpIssued = true; }
        else input = { right: true };
        if (player.x >= wallJumpStartX + 160) wallJumping = false;
      }
      // Stay below the first bat cluster while moving into the lower corridor.
      if (player.x < 1300) input = { right: true };
    }

    if (bats.length && player.state === 'chickenAir' && !player.flapHeld && mode !== 'entry') {
      input.fire = true;
      firstBatFlaps++;
    }
    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
  }

  assert.equal(lowerFloorReached, true);
  assert.ok(firstBatFlaps > 0);
  assert.equal(player.dead, false);
  assert.equal(player.state, 'chickenWalk');
  assert.deepEqual([player.x, player.y, player.lives, player.points], [1182, 1105, 5, 954]);

  let lastX = player.x;
  let lastProgressTick = 0;
  let lastJump = -100;
  for (let tick = 0; tick < 6000 && player.x < 8053 && !player.dead; tick++) {
    const grounded = supported(player.x, player.y + 4, sample)
      && ['chickenIdle', 'chickenWalk', 'chickenLand', 'idle', 'walk', 'land'].includes(player.state);
    const wall = grounded && bodyCollision(player.x + 24, player.y, sample, player.body) !== 0;
    const gap = grounded && !supported(player.x + 36, player.y + 4, sample);
    const enemy = world.actors.filter((actor) => actor.active && !actor.removed && isEnemy(actor)
      && actor.x > player.x && actor.x - player.x < 200 && Math.abs(actor.y - player.y) < 300)
      .sort((a, b) => a.x - b.x)[0];
    let input = { right: true };
    if (grounded && !player.jumpHeld && tick - lastJump > 18
      && (wall || gap || (enemy && enemy.x - player.x < 140))) {
      input.jump = true;
      lastJump = tick;
    }
    if (player.state === 'chickenAir' && !player.flapHeld && player.y > 350 && player.y < 1450
      && tick % 6 === 0) input.fire = true;
    if (world.event?.kind === 114) input = { enter: !world.event.enterHeld };

    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
    if (player.x >= lastX + 300) { lastX = player.x; lastProgressTick = tick; }
    if (tick - lastProgressTick > 500) break;
  }

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
    if (player.x > 10000 && crawler && player.vy < 0 && player.y > crawler.y - 27) input = { left: true };
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
  assert.ok(crossedFinalUpperWall);
  assert.deepEqual([player.x, player.y, player.lives, player.points], [11021, 1078, 1, 981]);

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
  assert.equal(world.event, null);
  assert.deepEqual([player.x, player.y, player.lives, player.points], [11058, 211, 1, 993]);

  let jumpCooldown = 0;
  for (let tick = 0; tick < 6000 && player.x < 16666 && !player.dead; tick++) {
    const grounded = supported(player.x, player.y + 4, sample)
      && ['idle', 'walk', 'land', 'chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state);
    const wall = grounded && bodyCollision(player.x + 24, player.y, sample, player.body) !== 0;
    const gap = grounded && !supported(player.x + 36, player.y + 4, sample);
    const enemy = world.actors.filter((actor) => actor.active && !actor.removed && isEnemy(actor)
      && actor.x > player.x && actor.x - player.x < 220 && Math.abs(actor.y - player.y) < 300)
      .sort((a, b) => a.x - b.x)[0];
    const rock = world.actors.find((actor) => actor.kind === 121 && actor.active && !actor.removed
      && actor.x > player.x && actor.x - player.x < 600 && Math.abs(actor.y - player.y) < 500);
    let input = { right: true };
    if (grounded && !player.jumpHeld && tick - jumpCooldown > 18
      && (wall || gap || (enemy && enemy.x - player.x < 160))) {
      input.jump = true;
      jumpCooldown = tick;
    }
    if (player.x >= 11580 && player.x <= 11650 && player.state === 'air' && player.vy > 0) input = { left: true };
    if (rock && grounded && player.x >= 11580 && player.x <= 11660 && !player.jumpHeld) {
      input = { right: true, jump: true };
    }

    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
  }

  assert.equal(player.dead, false);
  assert.deepEqual([player.x, player.y, player.lives, player.points], [15341, 1980, 2, 1016]);

  let lowerRoute = 'wait2643';
  let lowerClock = 0;
  for (let tick = 0; tick < 700 && !player.dead && lowerRoute !== 'done'; tick++) {
    let input = {};
    if (lowerRoute === 'wait2643') {
      input = { right: true };
      if (player.vy === -35 && player.y > 2300) { lowerRoute = 'to2206'; lowerClock = 0; }
    } else if (lowerRoute === 'to2206') {
      input = lowerClock < 11 ? { left: true } : {};
      lowerClock++;
      if (player.vy === -35 && player.y < 2300) { lowerRoute = 'to1797'; lowerClock = 0; }
    } else if (lowerRoute === 'to1797') {
      input = lowerClock < 10 ? { right: true } : {};
      lowerClock++;
      if (player.vy === -35 && player.y < 1800) { lowerRoute = 'to1336'; lowerClock = 0; }
    } else if (lowerRoute === 'to1336') {
      input = lowerClock < 16 ? { left: true } : {};
      lowerClock++;
      if (player.vy === -35 && player.y < 1400) { lowerRoute = 'advance'; lowerClock = 0; }
    } else if (lowerRoute === 'advance') {
      const grounded = supported(player.x, player.y + 4, sample)
        && ['idle', 'walk', 'land'].includes(player.state);
      const wall = grounded && bodyCollision(player.x + 24, player.y, sample, player.body) !== 0;
      input = { right: true };
      if (grounded && wall && lowerClock > 20 && !player.jumpHeld) {
        input.jump = true;
        lowerClock = 0;
      }
      lowerClock++;
      if (player.x >= 15600) lowerRoute = 'done';
    }

    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
  }

  assert.equal(lowerRoute, 'done');
  assert.equal(player.dead, false);
  assert.deepEqual([player.x, player.y, player.lives, player.points], [15613, 680, 2, 1025]);

  let lastJumpTick = 0;
  for (let tick = 0; tick < 1000 && player.x < 16397 && !player.dead; tick++) {
    const grounded = supported(player.x, player.y + 4, sample)
      && ['idle', 'walk', 'land', 'chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state);
    const wall = grounded && bodyCollision(player.x + 24, player.y, sample, player.body) !== 0;
    const gap = grounded && !supported(player.x + 36, player.y + 4, sample);
    const enemy = world.actors.filter((actor) => actor.active && !actor.removed && isEnemy(actor)
      && actor.x > player.x && actor.x - player.x < 220 && Math.abs(actor.y - player.y) < 300)
      .sort((a, b) => a.x - b.x)[0];
    let input = { right: true };
    if (grounded && !player.jumpHeld && tick - lastJumpTick > 18
      && (wall || gap || (enemy && enemy.x - player.x < 160))) {
      input.jump = true;
      lastJumpTick = tick;
    }

    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
  }

  assert.ok(player.x >= 16397);
  assert.equal(player.dead, false);
  assert.equal(player.lives, 2);
  assert.ok(player.points >= 1035);

  for (let tick = 0; tick < 1000 && player.x > 16030; tick++) {
    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, { left: true }, camera, sample, now);
  }
  for (let tick = 0; tick < 200 && !supported(player.x, player.y + 4, sample); tick++) {
    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, {}, camera, sample, now);
  }

  let towerRoute = 'approach';
  let towerClock = 0;
  for (let tick = 0; tick < 1800 && towerRoute !== 'done' && !player.dead; tick++) {
    let input = {};
    if (towerRoute === 'approach') {
      input = { right: true };
      if (player.x >= 16200) towerRoute = 'clear892';
    } else if (towerRoute === 'clear892') {
      input = { right: true };
      if (player.x >= 16390) towerRoute = 'wait1306';
    } else if (towerRoute === 'wait1306') {
      if (player.y > 850 && player.vy > 0) towerRoute = 'left1306';
    } else if (towerRoute === 'left1306') {
      input = { left: true };
      if (player.x <= 16200) towerRoute = 'wait1306Bounce';
    } else if (towerRoute === 'wait1306Bounce') {
      if (player.y > 1250 && player.vy > 0) towerRoute = 'right1659';
    } else if (towerRoute === 'right1659') {
      input = { right: true };
      if (player.x >= 16252) towerRoute = 'wait1659Pass';
    } else if (towerRoute === 'wait1659Pass') {
      if (player.y > 1600 && player.vy > 0) towerRoute = 'right1981';
    } else if (towerRoute === 'right1981') {
      input = { right: true };
      if (player.x >= 16390) towerRoute = 'wait1981';
    } else if (towerRoute === 'wait1981') {
      if (player.y > 1915 && player.vy > 0) towerRoute = 'wait2365';
    } else if (towerRoute === 'wait2365') {
      if (player.y > 2294 && player.vy > 0) { towerRoute = 'gap2716'; towerClock = 0; }
    } else if (towerRoute === 'gap2716') {
      input = towerClock < 20 ? { left: true } : {};
      if (++towerClock >= 20) towerRoute = 'waitBottom';
    } else if (towerRoute === 'waitBottom') {
      if (player.y > 2670 && player.vy > 0) towerRoute = 'crossWall';
    } else if (towerRoute === 'crossWall') {
      input = { right: true };
      if (player.x > 16430) towerRoute = 'bottomRun';
    } else if (towerRoute === 'bottomRun') {
      input = { right: true };
      if (player.x >= 16666) towerRoute = 'done';
    }

    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
  }

  assert.equal(towerRoute, 'done');
  assert.equal(player.dead, false);
  assert.deepEqual([player.x, player.y, player.lives, player.points], [16673, 3032, 2, 1046]);

  let continuation = 'retreat';
  let jumped = false;
  let springHop = false;
  for (let tick = 0; tick < 2200 && continuation !== 'done' && !player.dead; tick++) {
    let input = {};
    if (continuation === 'retreat') {
      input = { left: true };
      if (player.x <= 16650) continuation = 'settle';
    } else if (continuation === 'settle') {
      if (supported(player.x, player.y + 4, sample) && !['air', 'hurt'].includes(player.state)) continuation = 'jump';
    } else if (continuation === 'jump') {
      if (!jumped && player.x > 16610 && player.x < 16670) {
        input.jump = true;
        jumped = true;
      } else if (jumped && player.vy === -35 && player.y < 3000) {
        continuation = 'toPlatform';
      }
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
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
  }

  assert.equal(continuation, 'done');
  assert.equal(player.dead, false);
  assert.deepEqual([player.x, player.y, player.lives, player.points], [17256, 2258, 2, 1047]);

  let finalJumpTick = 0;
  for (let tick = 0; tick < 3000 && player.x < 18154 && !player.dead; tick++) {
    const grounded = supported(player.x, player.y + 4, sample)
      && ['idle', 'walk', 'land', 'chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state);
    const wall = grounded && bodyCollision(player.x + 24, player.y, sample, player.body) !== 0;
    const gap = grounded && !supported(player.x + 36, player.y + 4, sample);
    const enemy = world.actors.filter((actor) => actor.active && !actor.removed && isEnemy(actor)
      && actor.x > player.x && actor.x - player.x < 220 && Math.abs(actor.y - player.y) < 300)
      .sort((a, b) => a.x - b.x)[0];
    let input = { right: true };
    if (grounded && !player.jumpHeld && tick - finalJumpTick > 18
      && (wall || gap || (enemy && enemy.x - player.x < 160))) {
      input.jump = true;
      finalJumpTick = tick;
    }
    if (world.event?.kind === 114) input = { enter: !world.event.enterHeld };

    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
  }

  assert.equal(player.dead, false);
  assert.deepEqual([player.x, player.y, player.lives, player.points], [17581, 2073, 2, 1051]);
  assert.ok(player.x >= 17581);
  assert.ok(player.x >= 17249);

});
