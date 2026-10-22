import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, followCamera, enterNextStage } from '../web/game.js';
import { createActor, stepActor, hitActor, hitWeapon, hitCompanion, createProjectile, stepProjectile, createWorld, stepWorld, readStageObjects, createSplash, stepSplash, overlaps } from '../web/objects.js';
import { enterFlight, stepFlightCamera } from '../web/flight.js';
import { createStageEntry } from '../web/stage-entry.js';
import { setStage2BossState } from '../web/stage2-boss.js';
import { STAGE2_BOSS, BOSS2_PROJECTILE_IMAGE } from '../web/stage2-boss-data.js';

const f = JSON.parse(readFileSync(new URL('./fixtures/original-stage2-boss.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage2.map')), mask = decodeImage(archive.get('block2.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
const compare = (actor, expected, label) => { for (const [key, value] of Object.entries(expected)) assert.equal(actor[key], value, `${label} ${key}`); };

test('the second boss constructor, image tables, HUD and 800 movement/attack ticks match the original', () => {
  assert.deepEqual(STAGE2_BOSS, f.metadata);
  assert.equal(BOSS2_PROJECTILE_IMAGE, f.projectileImage);
  const boss = createActor(32, 23018, 2912), p = createPlayer(22800, 3032);
  compare(boss, f.metadata.initial, 'constructor');
  assert.deepEqual(Object.values(boss.body), f.metadata.body);
  for (const name of [...STAGE2_BOSS.images, STAGE2_BOSS.headImage, STAGE2_BOSS.healthImage, BOSS2_PROJECTILE_IMAGE]) decodeImage(archive.get(name));
  f.movement.forEach(({ playerX, expected, shots }, tick) => {
    p.x = playerX;
    assert.deepEqual(stepActor(boss, p, sample), shots, `tick ${tick} shots`);
    compare(boss, expected, `tick ${tick}`);
  });
});

test('72 native boss contacts preserve attack defense, hurt immunity and transformed attacks', () => {
  const states = { 0: 'idle', 2: 'air', 4: 'hurt', 10: 'chickenAir', 14: 'roachAir', 17: 'roachDash' };
  for (const { state, scenario, before, player, boss: expected } of f.contacts) {
    const boss = createActor(32, 23018, 2912), p = Object.assign(createPlayer(before.x, before.y), before, { state: states[before.state] });
    setStage2BossState(boss, state);
    hitActor(p, boss);
    compare(boss, expected, `${state}/${scenario}`);
    for (const [key, value] of Object.entries(player)) assert.equal(p[key], key === 'state' ? states[value] : value, `${state}/${scenario} player ${key}`);
  }
});

test('native weapon hits restart the damage animation even while the second boss is hurt', () => {
  for (const { type, state, boss: expected, points, removed } of f.weapons) {
    const boss = createActor(32, 23018, 2912), p = createPlayer(22800, 3032), shot = createProjectile({ type, x: 23018, y: 2912, vx: 10, vy: -10 });
    setStage2BossState(boss, state);
    hitWeapon(p, boss, shot);
    compare(boss, expected, `${type}/${state}`);
    assert.equal(p.points, points);
    assert.equal(shot.removed, removed);
  }
});

test('ten native hits reduce health only after 22 updates and request the death scene on the last hit', () => {
  const boss = createActor(32, 23018, 2912), p = createPlayer(22800, 3032);
  for (const [strike, trace] of f.death.entries()) {
    setStage2BossState(boss, 7);
    assert.equal(boss.health, 10 - strike);
    trace.forEach(({ expected, requests }, tick) => {
      stepActor(boss, p, sample);
      compare(boss, expected, `hit ${strike} tick ${tick}`);
      assert.equal(boss.deathScene, requests.includes('death'));
    });
  }
});

test('the second boss ball matches three original trajectories and bounces three times', () => {
  for (const { initial, trace } of f.projectiles) {
    const shot = createProjectile({ type: 91, variant: 'boss2', x: initial.x, y: initial.y, vx: initial.vx, vy: initial.vy });
    compare(shot, initial, 'projectile constructor');
    trace.forEach((expected, tick) => { stepProjectile(shot, sample); compare(shot, expected, `shot tick ${tick}`); });
  }
});

test('all five native ordinary projectile variants freeze outside the active area and resume on return', () => {
  for (const { type, variant, before, after } of f.outside) {
    const world = createWorld([]), p = createPlayer(22800, 3032), shot = createProjectile({ type, variant, ...before, vx: 4, vy: -10 });
    world.projectiles.push(shot);
    stepWorld(world, p, {}, { x: 22500, y: 2719 }, () => 0);
    compare(shot, after, `type ${type}/${variant}`);
    stepWorld(world, p, {}, { x: 24000, y: 2719 }, () => 0);
    assert.ok(shot.x > before.x);
  }
});

test('native companion attacks respect the second boss hurt immunity and repeated-contact rules', () => {
  for (const { slot, state, bossState, first, second } of f.allies) {
    const boss = createActor(32, 23018, 2912), p = createPlayer(22800, 3032);
    setStage2BossState(boss, bossState);
    for (const expected of [first, second]) {
      hitCompanion(p, boss, { slot, state });
      compare(boss, expected.boss, `slot ${slot}, state ${state}, boss ${bossState}`);
      assert.equal(p.points, expected.points);
    }
  }
});

test('the native splash dispatcher repeatedly restarts damage but reduces boss health once after it expires', () => {
  const boss = createActor(32, 23018, 2912), p = createPlayer(22800, 3032), splash = createSplash(23018, 2942);
  f.splash.forEach((expected, tick) => {
    stepActor(boss, p, sample);
    if (!splash.removed) stepSplash(splash);
    if (!splash.removed && overlaps(boss, splash)) hitWeapon(p, boss, splash);
    compare(boss, expected.boss, `splash tick ${tick}`);
    assert.equal(p.points, expected.points);
    assert.equal(splash.ticks, expected.ticks); assert.equal(splash.removed, expected.removed);
  });
});

test('the first-boss reward supports a platform/stomp second-boss clear, exit movie and shooting entry', () => {
  const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
  const firstMap = decodeMap(archive.get('stage1.map')), firstMask = decodeImage(archive.get('block1.app'));
  const first = createWorld(readStageObjects(firstMap, config, archive), firstMap), p1 = createPlayer(24680, 3096), c1 = { x: 24548, y: 2719 };
  for (let tick = 0; tick < 1800 && !first.stageComplete && !p1.dead; tick++) {
    stepWorld(first, p1, { right: tick < 7, jump: tick >= 7 && tick < 10 }, c1, (x, y) => collisionAt(firstMap, firstMask, x, y), tick * 1000 / 30);
    followCamera(c1, p1, firstMap);
  }
  assert.equal(first.stageComplete, true);
  enterNextStage(p1);
  const p = createPlayer(22800, 3032), world = createWorld(readStageObjects(map, config, archive), map), view = { x: 22500, y: 2719 };
  p.lives = p1.lives; p.points = p1.points;
  assert.equal(p.lives, 8);
  let side = 1, previousState = 0;
  for (let tick = 0; tick < 6000 && !world.stageComplete && !p.dead && !p.hazard; tick++) {
    const boss = world.actors.find((actor) => actor.kind === 32);
    if (boss.state === 7 && previousState !== 7) side = p.x < boss.x + 38 ? -1 : 1;
    const upper = world.surfaces.filter((s) => s.active && s.y > 2850 && s.y < 2950);
    const lower = world.surfaces.filter((s) => s.active && s.y > 2980 && s.y < 3020);
    const nearest = (list, x) => list.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0]?.x - 5;
    const target = p.y > 2950 ? nearest(lower, p.x) : p.y > 2860 ? nearest(upper, p.x)
      : [6, 7].includes(boss.state) || boss.timer > 170 ? nearest(upper, boss.x + 38 + side * 120) : boss.x + 38;
    const dx = (Number.isFinite(target) ? target : 22909) - p.x;
    previousState = boss.state;
    stepWorld(world, p, { left: dx < -12, right: dx > 12, jump: p.y > 2860 && ['idle', 'walk'].includes(p.state) && !p.jumpHeld }, view, sample, tick * 1000 / 30);
    if (!world.stageEntry) followCamera(view, p, map);
  }
  assert.equal(world.stageComplete, true);
  assert.equal(world.stageEntry.stage, 'stage2Exit'); assert.equal(world.stageEntry.transitions, 1);
  assert.equal(world.actors.find((actor) => actor.kind === 32).health, 0);
  assert.ok(p.lives > 0);
  assert.equal(p.balls + p.waterBombs + p.companionItems.reduce((a, b) => a + b, 0), 0);
  const lives = p.lives;
  enterNextStage(p, 2); enterFlight(p);
  const shootMap = decodeMap(archive.get('shoot.map')), shootMask = decodeImage(archive.get('sblock.app'));
  const shootWorld = createWorld(readStageObjects(shootMap, config, archive), shootMap), shootCamera = { x: 0, y: 0 };
  shootWorld.stageEntry = createStageEntry(3);
  let fired = false;
  for (let tick = 0; tick < 450; tick++) {
    if (shootWorld.stageEntry.finished) stepFlightCamera(shootCamera, p, shootMap, shootWorld.flightStopped);
    stepWorld(shootWorld, p, { right: true, fire: tick > 330, enter: tick === 340 }, shootCamera, (x, y) => collisionAt(shootMap, shootMask, x, y), 100000 + tick * 1000 / 30);
    fired ||= shootWorld.projectiles.some((shot) => shot.type === 35);
  }
  assert.equal(p.flight, true); assert.equal(p.lives, lives + 3);
  assert.ok(p.x > 0); assert.equal(fired, true);
});
