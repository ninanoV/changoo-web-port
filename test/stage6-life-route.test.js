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

test('the Stage 05 handoff route bypasses the Stage 06 wall and collects its first life pickup', () => {
  const world = createWorld(readStageObjects(map, config, archive), map);
  const player = createPlayer(24418, 5976);
  const camera = { x: 0, y: 0 };
  player.state = 'chickenAir';
  player.vx = -7;
  player.vy = 7;
  player.flightTicks = 982;
  player.lives = 2;
  player.points = 946;
  enterNextStage(player, 5);
  world.stageEntry = createStageEntry(6, 100000);
  initializeWorldCamera(world, player, camera, 100000);

  let now = 100000;
  let mode = 'entry';
  let firstBatFlaps = 0;
  let wallJumping = false;
  let wallJumpIssued = false;
  let wallJumpStartX = 0;
  let stompPlan = false;
  let stompJump = false;
  let firstCrawlerStomped = false;
  let lowerFloorReached = false;
  let lifeDropStarted = false;
  let wallReached = false;
  let lastLifeJumpTick = -1000;
  const lifePickup = world.actors.find((actor) => actor.kind === 42 && actor.x === 8154);

  for (let tick = 0; tick < 5000 && !player.dead; tick++) {
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
    const wantJump = gap || wall || danger || (grounded && tick % 75 === 0);

    if (mode === 'entry') {
      if (world.stageEntry?.finished && player.x > 100 && player.y < 300) mode = 'run';
    } else if (mode === 'run') {
      if (player.x >= 1100 && player.x <= 1160 && farWall) mode = 'wallDrop';
      else input = { right: true, jump: wantJump && !player.jumpHeld };
    } else if (mode === 'wallDrop') {
      input = { left: player.x > 1128 };
      if (player.x <= 1128) mode = 'fall';
    } else if (mode === 'fall') {
      input = {};
      if (player.y >= 960 && player.vy > 0) { mode = 'lowerRun'; lowerFloorReached = true; input = { right: true }; }
    } else if (mode === 'lifeDrop') {
      if (player.x > 8220) input = { left: true };
      else if (player.y < 2400) input = {};
      else if (player.x > 8120) input = { left: true };
      else if (player.y < 2420) input = {};
      else input = { right: true };
    } else if (mode === 'lifeRun') {
      if (grounded && !player.jumpHeld && player.state !== 'land' && tick - lastLifeJumpTick > 25) {
        input = { right: true, jump: true };
        lastLifeJumpTick = tick;
      }
    } else if (mode === 'lowerRun') {
      if (player.x >= 8220 && player.x <= 8250 && player.y < 2400 && wall) {
        mode = 'lifeDrop'; lifeDropStarted = true; input = { left: true };
      }
      const crawler = world.actors.filter((actor) => actor.kind === 34 && actor.active && !actor.removed
        && actor.x > player.x && actor.x - player.x < 160).sort((a, b) => a.x - b.x)[0];
      if (!firstCrawlerStomped && player.x >= 7200 && player.x < 7450 && crawler) {
        if (!stompPlan && crawler.x - player.x <= 130) stompPlan = true;
        if (stompPlan && !stompJump) {
          if (crawler.x - player.x > 44) input = {};
          else if (grounded && !player.jumpHeld) { input = { jump: true }; stompJump = true; }
          else input = {};
        } else if (stompJump && crawler.state !== 4 && !crawler.removed) input = {};
        else if (stompJump) { firstCrawlerStomped = true; input = { right: true }; }
      } else if (wall && grounded && !wallJumping
        && (!firstCrawlerStomped || !enemy || enemy.kind !== 34 || enemy.x - player.x <= 85)) {
        wallJumping = true; wallJumpIssued = false; wallJumpStartX = player.x;
      }

      if (mode === 'lowerRun' && (!stompPlan || firstCrawlerStomped)) {
        if (wallJumping) {
          if (grounded && !player.jumpHeld && !wallJumpIssued) { input = { jump: true }; wallJumpIssued = true; }
          else if (firstCrawlerStomped && player.x > 7400 && wallJumpIssued && player.vy < 0) {
            input = enemy?.kind === 34 && enemy.x - player.x > 100 ? { right: true } : {};
          } else input = { right: true };
          if (player.x >= wallJumpStartX + 160) wallJumping = false;
        } else if (!firstCrawlerStomped) {
          input = { right: true, jump: (gap || danger) && !player.jumpHeld,
            fire: player.state === 'chickenAir' && player.flightTicks < 320 && tick % 2 === 0 };
        }
      }
    }

    if (bats.length && player.state === 'chickenAir' && !player.flapHeld && mode !== 'entry') {
      input.fire = true;
      firstBatFlaps++;
    }
    now += 1000 / 60;
    camera.scrollMode = cameraMode(player, world.event, 0);
    if (cameraActive(world)) advanceWorldCamera(world, player, camera, 7, now);
    stepWorld(world, player, input, camera, sample, now);
    if (lifePickup?.collected && mode === 'lifeDrop') mode = 'lifeRun';
    if (player.x >= 9261) { wallReached = true; break; }
  }

  assert.equal(lowerFloorReached, true);
  assert.equal(firstBatFlaps >= 1, true);
  assert.equal(firstCrawlerStomped, true);
  assert.equal(lifeDropStarted, true);
  assert.equal(lifePickup?.collected, true);
  assert.equal(wallReached, true);
  assert.equal(player.dead, false);
  assert.deepEqual([player.x, player.y, player.lives, player.points], [9261, 2318, 1, 960]);
});
