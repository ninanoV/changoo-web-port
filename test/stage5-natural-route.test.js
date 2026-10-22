import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, supported, enterNextStage } from '../web/game.js';
import { createWorld, readStageObjects, stepWorld, initializeWorldCamera, advanceWorldCamera, cameraActive } from '../web/objects.js';
import { cameraMode } from '../web/camera.js';

const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const map = decodeMap(archive.get('stage4.map'));
const mask = decodeImage(archive.get('block4.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);

test('the Stage 05 entry reaches the paired bosses and completes the stage', () => {
  const world = createWorld(readStageObjects(map, config, archive), map);
  const player = createPlayer(0, 6232);
  const camera = { x: 0, y: 5760 };
  player.state = 'land';
  player.vx = 0;
  player.vy = 0;
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
  assert.deepEqual([player.x, player.y, player.lives, player.points, player.state], [4173, 5336, 5, 850, 'land']);
  for (let tick = 0; tick < 30; tick++) {
    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 5, now);
    stepWorld(world, player, {}, camera, sample, now);
  }
  let lastEvent;
  let chickenLaunched = false;
  let chickenFlapUsed = false;
  let ceilingEscapeAt = null;
  let spring16964Hit = false;
  let lateJumpStarted = false;
  let spring2Approach = false;
  let spring2Hit = false;
  let spring3Approach = false;
  let spring3Hit = false;
  let spring4Hit = false;
  let spring5Hit = false;
  let spring5ApproachAt = null;
  let springTargetIndex = 0;
  let lowerSpringApproach = false;
  let lowerSpringHit = false;
  let lowerLanded = false;
  let upperSpringHit = false;
  let upperLedgeReached = false;
  let gapJumpStarted = false;
  let monkeyJumpDone = false;
  let bossMode = false;
  let bossStart = 0;

  const spring2 = world.surfaces.find((surface) => surface.kind === 68 && Math.abs(surface.x - 9858) < 40);
  const spring3 = world.surfaces.find((surface) => surface.kind === 91 && Math.abs(surface.x - 11375) < 40);
  const spring4 = world.surfaces.find((surface) => surface.kind === 68 && Math.abs(surface.x - 13248) < 60);
  const spring5 = world.surfaces.find((surface) => surface.kind === 68 && Math.abs(surface.x - 13049) < 60);
  const springTargets = [16116, 16452, 16649, 16964].map((x) => world.surfaces.find((surface) => surface.spring && Math.abs(surface.x - x) < 80));
  const spring16964 = world.surfaces.find((surface) => surface.spring && Math.abs(surface.x - 16964) < 60);
  const lowerSpring = world.surfaces.find((surface) => surface.kind === 68 && Math.abs(surface.x - 21920) < 60);
  const upperSpring = world.surfaces.find((surface) => surface.kind === 68 && Math.abs(surface.x - 22077) < 50);

  for (let tick = 0; tick < 32000 && !player.dead && !world.stageComplete; tick++) {
    let jump;
    if (tick < 60) jump = tick % 8 === 0;
    else if (player.x < 4600) jump = tick % 8 === 0;
    else if (!spring2Approach && player.x >= 9810 && player.x < 9890 && player.y >= 5790 && player.y < 5865) {
      spring2Approach = true; jump = false;
    } else if (spring2Approach && !spring2Hit) jump = false;
    else if (spring2Hit && !spring3Approach && player.x >= 11350 && player.x <= 11405 && player.y >= 4700 && player.y <= 4800 && player.vy > 0) {
      spring3Approach = true; jump = false;
    } else if (spring3Approach && !spring3Hit) jump = false;
    else if (spring3Hit && spring4Hit && !spring5Hit) jump = false;
    else jump = tick % 3 === 0;

    let input = { left: tick < 60, right: tick >= 60 && !spring2Approach || spring2Hit, jump };
    if (spring3Approach && !spring3Hit) input = {};
    if (spring3Hit && spring4Hit && !spring5Hit) {
      if (spring5ApproachAt === null) { spring5ApproachAt = tick; input = { left: true }; }
      else if (tick - spring5ApproachAt < 22) input = { left: true };
      else input = {};
    }

    if (player.x >= 14900 && player.state.startsWith('chicken')) {
      while (springTargetIndex < springTargets.length && springTargets[springTargetIndex]?.state === 1) {
        if (springTargetIndex === 2) ceilingEscapeAt = tick;
        springTargetIndex++;
      }
      if (!chickenLaunched) {
        if (player.state === 'chickenIdle' && player.x > 15300) { chickenLaunched = true; input = { right: true, jump: true }; }
        else if (player.x < 15340) input = { right: true };
        else input = {};
      } else {
        const target = springTargets[springTargetIndex];
        if (springTargetIndex >= 4) input = { right: true };
        else if (springTargetIndex === 3 && ceilingEscapeAt !== null && tick - ceilingEscapeAt < 5) input = { left: true };
        else if (target) {
          if (player.x < target.x - 40) input = { right: true, ...(springTargetIndex === 0 && tick % 8 === 0 ? { fire: true } : {}) };
          else if (player.x > target.x + 30) input = { left: true };
          else input = {};
        }
        if (springTargetIndex === 3 && !chickenFlapUsed && player.state === 'chickenAir'
          && player.x >= 16845 && player.x <= 16895 && player.y >= 4320 && player.y <= 4420 && player.vy > 0) {
          chickenFlapUsed = true; input = { right: true, fire: true };
        }
      }
    }
    if (spring16964Hit && player.state === 'chickenAir' && player.x >= 18850 && player.x <= 19300) input = { right: true, fire: tick % 10 === 0 };
    if (!lateJumpStarted && player.x >= 19500 && ['chickenWalk', 'chickenIdle', 'chickenLand'].includes(player.state)) {
      lateJumpStarted = true; input = { right: true, jump: true };
    } else if (lateJumpStarted && player.x >= 19500 && player.x < 21000 && player.state === 'chickenAir') input = { right: true, fire: tick % 10 === 0 };

    if (!lowerSpringApproach && player.x >= 21650 && player.x < 21850 && player.y >= 5800 && player.vy > 0 && player.state === 'chickenAir') {
      lowerSpringApproach = true; input = { right: true };
    }
    if (lowerSpringApproach && !lowerSpringHit) input = player.x < 21890 ? { right: true } : player.x > 21930 ? { left: true } : {};
    if (lowerSpringHit && !lowerLanded) {
      input = { right: player.x < 21960 };
      if (['chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state)
        && player.y > 5500 && player.y < 5900 && supported(player.x, player.y + 4, sample)) lowerLanded = true;
    }

    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 5, now);
    stepWorld(world, player, input, camera, sample, now);

    if (spring2?.state === 1) spring2Hit = true;
    if (spring3?.state === 1) spring3Hit = true;
    if (spring4?.state === 1) spring4Hit = true;
    if (spring5?.state === 1) spring5Hit = true;
    if (spring16964?.state === 1) spring16964Hit = true;
    if (lowerSpring?.state === 1) lowerSpringHit = true;
    if (upperSpring?.state === 1) upperSpringHit = true;
    if (player.y === 4504 && supported(player.x, player.y + 4, sample)) upperLedgeReached = true;
    if (world.event?.kind !== lastEvent) lastEvent = world.event?.kind;
    if (lowerLanded) break;
  }

  assert.equal(lowerSpringHit, true, 'the x21920 lower spring must be activated from the x4173 route');
  assert.equal(lowerLanded, true, 'the lower spring continuation must reach the y5848 ledge');
  assert.deepEqual([player.x, player.y, player.lives, player.points], [21982, 5848, 2, 920]);

  let mode = 'left1';
  let jumpStarted = false;
  for (let tick = 0; tick < 3000 && !player.dead && !world.stageComplete; tick++) {
    let input = {};
    if (mode === 'left1') {
      input = { left: player.x > 21930, jump: !jumpStarted && player.state === 'chickenIdle' };
      if (input.jump) jumpStarted = true;
      if (player.x <= 21930) mode = 'ascend1';
    } else if (mode === 'ascend1') {
      input = { fire: tick % 2 === 0 };
      if (player.y <= 5040) mode = 'wallWait';
    } else if (mode === 'wallWait') {
      if (player.y >= 5028 && player.vy > 0) { mode = 'approach'; input = { right: true }; }
    } else if (mode === 'approach') {
      if (player.x <= 21933) input = { right: true };
      else if (player.x > 21940) input = { left: true };
      if (['chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state) && supported(player.x, player.y + 4, sample)) {
        mode = 'left2'; jumpStarted = false;
      }
    } else if (mode === 'left2') {
      input = { left: player.x > 21930, jump: !jumpStarted && player.state === 'chickenIdle' };
      if (input.jump) jumpStarted = true;
      if (player.x <= 21930) mode = 'ascend2';
    } else if (mode === 'ascend2') {
      input = { fire: tick % 2 === 0 };
      if (player.y <= 4900) mode = 'springApproach';
    } else if (mode === 'springApproach') {
      input = { right: player.x < 22050, fire: tick % 2 === 0 };
      if (player.x >= 22050) mode = 'spring';
    } else if (mode === 'spring') {
      if (upperSpring?.state === 1) mode = 'backLeft';
    } else if (mode === 'backLeft') {
      input = { left: player.x > 21920 };
      if (player.x <= 21920) mode = 'waitFall';
    } else if (mode === 'waitFall') {
      if (player.y >= 4250 && player.vy > 0) { mode = 'toLedge'; input = { right: true }; }
    } else if (mode === 'toLedge') {
      input = { right: player.x < 21950 };
      if (player.x >= 21950) mode = 'landLedge';
    } else if (mode === 'landLedge') {
      if (['chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state) && supported(player.x, player.y + 4, sample)) mode = 'runway1';
    } else if (mode === 'runway1') {
      input = { right: true };
      if (player.x >= 22025) { mode = 'gapJump'; gapJumpStarted = false; }
    } else if (mode === 'gapJump') {
      input = { right: true, jump: !gapJumpStarted };
      gapJumpStarted = true;
      if (player.x >= 22150) mode = 'runway2';
    } else if (mode === 'runway2') {
      if (!monkeyJumpDone && ['chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state)
        && supported(player.x, player.y + 4, sample) && player.x >= 22520) {
        input = { right: true, jump: true }; monkeyJumpDone = true;
      } else input = { right: true };
      if (player.x >= 23710) mode = 'edge';
    } else if (mode === 'edge') {
      if (player.x < 24520) input = { right: true };
      else if (!bossMode && player.y >= 5800) { bossMode = true; bossStart = tick; input = { left: true, jump: true }; }
      if (bossMode) {
        const fightTick = tick - bossStart;
        if (fightTick < 15) input = { left: true, jump: true };
        else { const pulse = (fightTick - 15) % 4; input = { jump: true, left: pulse === 3, right: pulse === 1 }; }
      }
    }
    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 5, now);
    stepWorld(world, player, input, camera, sample, now);
    if (upperSpring?.state === 1) upperSpringHit = true;
    if (player.y === 4504 && supported(player.x, player.y + 4, sample)) upperLedgeReached = true;
  }

  const bosses = world.actors.filter((actor) => actor.kind === 39 || actor.kind === 40);
  assert.equal(upperSpringHit, true);
  assert.equal(upperLedgeReached, true);
  assert.equal(bossMode, true);
  assert.equal(world.stageComplete, true);
  assert.deepEqual(bosses.map((boss) => boss.health), [0, 0]);
  assert.equal(player.lives, 2);
  assert.equal(player.points, 954);
  assert.deepEqual([player.state, player.flightTicks, player.waterBombs, player.companionItems[4], player.chocobi],
    ['chickenAir', 982, 1, 1, 2]);
  enterNextStage(player, 5);
  assert.equal(player.lives, 5);
  assert.deepEqual([player.x, player.y], [0, 0]);
});
