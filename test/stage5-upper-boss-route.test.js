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

test('Stage 05 route from the lower-spring ledge reaches the paired bosses and advances to Stage 06', () => {
  const world = createWorld(readStageObjects(map, config, archive), map);
  const player = createPlayer(21982, 5848);
  const camera = { x: 21821, y: 5599 };
  player.state = 'chickenIdle';
  player.lives = 2;
  player.points = 912;
  world.stageEntry = { stage: 5, phase: 46, ticks: 0, startedAt: 0, now: 0, finished: true, transitions: 0, render: [] };
  initializeWorldCamera(world, player, camera, 0);

  let mode = 'left';
  let now = 0;
  let phase = 0;
  let jumpStarted = false;
  let gapJumpStarted = false;
  let monkeyJumpDone = false;
  let bossMode = false;
  let bossStart = 0;
  let upperSpringHit = false;
  let upperLedgeReached = false;

  for (let tick = 0; tick < 3000 && !player.dead && !world.stageComplete; tick++) {
    let input = {};
    if (mode === 'left' && phase === 0) {
      input = { left: player.x > 21930, jump: tick === 0 };
      if (player.x <= 21930) mode = 'ascend';
    } else if (mode === 'ascend' && phase === 0) {
      input = { fire: tick % 2 === 0 };
      if (player.y <= 5040) mode = 'wallWait';
    } else if (mode === 'wallWait') {
      if (player.y >= 5028 && player.vy > 0) { mode = 'approach'; input = { right: true }; }
    } else if (mode === 'approach') {
      if (player.x <= 21933) input = { right: true };
      else if (player.x > 21940) input = { left: true };
      if (['chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state) && supported(player.x, player.y + 4, sample)) {
        phase = 1;
        mode = 'left';
        jumpStarted = false;
      }
    } else if (mode === 'left' && phase === 1) {
      input = { left: player.x > 21930, jump: !jumpStarted };
      jumpStarted = true;
      if (player.x <= 21930) mode = 'ascend';
    } else if (mode === 'ascend' && phase === 1) {
      input = { fire: tick % 2 === 0 };
      if (player.y <= 4900) mode = 'springApproach';
    } else if (mode === 'springApproach') {
      input = { right: player.x < 22050, fire: tick % 2 === 0 };
      if (player.x >= 22050) mode = 'spring';
    } else if (mode === 'spring') {
      if (world.surfaces.some((surface) => surface.kind === 68 && surface.state === 1 && Math.abs(surface.x - 22077) < 50)) {
        upperSpringHit = true;
        mode = 'backLeft';
      }
    } else if (mode === 'backLeft') {
      input = { left: player.x > 21920 };
      if (player.x <= 21920) mode = 'waitFall';
    } else if (mode === 'waitFall') {
      if (player.y >= 4250 && player.vy > 0) { mode = 'toLedge'; input = { right: true }; }
    } else if (mode === 'toLedge') {
      input = { right: player.x < 21950 };
      if (player.x >= 21950) mode = 'landLedge';
    } else if (mode === 'landLedge') {
      if (['chickenIdle', 'chickenWalk', 'chickenLand'].includes(player.state) && supported(player.x, player.y + 4, sample)) {
        upperLedgeReached = true;
        mode = 'runway1';
      }
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
        input = { right: true, jump: true };
        monkeyJumpDone = true;
      } else input = { right: true };
      if (player.x >= 23710) mode = 'edge';
    } else if (mode === 'edge') {
      if (player.x < 24520) input = { right: true };
      else if (!bossMode && player.y >= 5800) { bossMode = true; bossStart = tick; input = { left: true, jump: true }; }
      if (bossMode) {
        const fightTick = tick - bossStart;
        if (fightTick < 15) input = { left: true, jump: true };
        else {
          const pulse = (fightTick - 15) % 4;
          input = { jump: true, left: pulse === 3, right: pulse === 1 };
        }
      }
    }

    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 5, now);
    stepWorld(world, player, input, camera, sample, now);
  }

  const bosses = world.actors.filter((actor) => actor.kind === 39 || actor.kind === 40);
  assert.equal(upperSpringHit, true, 'the upper kind68 spring must be activated');
  assert.equal(upperLedgeReached, true, 'the player must land on the upper terrain ledge');
  assert.equal(bossMode, true, 'the paired-boss arena must be entered');
  assert.equal(world.stageComplete, true, 'defeating both jungle bosses must finish Stage 05');
  assert.deepEqual(bosses.map((boss) => boss.health), [0, 0]);
  assert.equal(player.lives, 2);
  assert.equal(player.points, 946);

  enterNextStage(player, 5);
  assert.equal(player.lives, 5);
  assert.deepEqual([player.x, player.y], [0, 0]);
});
