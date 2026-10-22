import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer, collisionAt, enterNextStage, followCamera } from '../web/game.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { enterBooster } from '../web/booster.js';
import { BOOSTER_POSES } from '../web/booster-data.js';
import { createActor, stepActor, actorSprite, hitActor, hitWeapon, hitCompanion, createProjectile, stepProjectile, resolveProjectileTerrain, hitProjectile, createWorld, stepWorld, readStageObjects } from '../web/objects.js';
import { BOOSTER_BOSS, BOOSTER_SHOT } from '../web/booster-boss-data.js';
import { setBoosterBossState } from '../web/booster-boss.js';
import { createStageEntry } from '../web/stage-entry.js';

const f = JSON.parse(readFileSync(new URL('./fixtures/original-booster-boss.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage3.map')), mask = decodeImage(archive.get('block3.app'));
const sample = (x, y) => collisionAt(map, mask, x, y), camera = {x: 9400, y: 2500};
const states = {0: 'idle', 2: 'air', 4: 'hurt', 17: 'roachDash', 26: 'booster', 27: 'boostHurt', 28: 'boostAttack'};
function compare(actual, expected, label, player = false) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], player && key === 'state' ? states[value] : value, `${label} ${key}`);
}
function player(before) {
  const p = createPlayer(before.x, before.y);
  if (before.state >= 26) enterBooster(p);
  return Object.assign(p, before, {state: states[before.state], ...(before.state >= 26 ? {animationOverride: BOOSTER_POSES[before.state]} : {})});
}

test('booster boss and missile bodies, images and animation tables are native metadata', () => {
  assert.deepEqual(BOOSTER_BOSS, f.metadata); assert.deepEqual(BOOSTER_SHOT, f.projectile);
  const boss = createActor(122, 9823, 2741); compare(boss, f.metadata.initial, 'initial');
  assert.deepEqual(Object.values(boss.body), f.metadata.body);
  for (const name of [...BOOSTER_BOSS.images, ...BOOSTER_SHOT.images, BOOSTER_BOSS.headImage]) decodeImage(archive.get(name));
});
for (const {initial, trace} of f.movement) {
  test(`booster boss state ${initial.state}: native movement, terrain, volleys and sounds agree`, () => {
    const boss = Object.assign(createActor(122, initial.x, initial.y), initial), p = createPlayer(9550, 2850);
    for (const [tick, row] of trace.entries()) {
      p.x = row.playerX;
      assert.deepEqual(stepActor(boss, p, sample, false, camera), row.shots, `tick ${tick} shots`);
      assert.deepEqual(boss.sounds, row.sounds, `tick ${tick} sounds`);
      compare(boss, row.expected, `tick ${tick}`);
      assert.equal(actorSprite(boss), BOOSTER_BOSS.images[row.expected.spriteIndex]);
    }
  });
}

test('normal and booster player contacts match the original boss guards and damage', () => {
  for (const row of f.contacts) {
    const boss = Object.assign(createActor(122, 9823, 2741), row.initial), p = player(row.before);
    assert.deepEqual(hitActor(p, boss), row.sounds);
    compare(boss, row.boss, 'contact boss'); compare(p, row.player, 'contact player', true);
  }
});

test('laser, ball and bomb contacts preserve the native repeat-hit and consumption differences', () => {
  for (const row of f.weapons) {
    const boss = Object.assign(createActor(122, 9823, 2741), row.initial), p = player(row.before);
    const shot = createProjectile({type: row.type, x: 9823, y: 2800, vx: 12, vy: 0});
    for (const expected of row.trace) {
      assert.deepEqual(hitWeapon(p, boss, shot), expected.sounds);
      compare(boss, expected.boss, 'weapon boss'); compare(p, expected.player, 'weapon player', true);
      assert.equal(shot.removed, expected.removed);
    }
  }
});

test('thirty native hits reduce health immediately, retaliate at tick nine and request the exit movie once', () => {
  const boss = createActor(122, 9823, 2741), p = createPlayer(9550, 2850);
  for (const [strike, row] of f.death.entries()) {
    setBoosterBossState(boss, 5); compare(boss, row.hit, `hit ${strike}`);
    for (const [tick, frame] of row.trace.entries()) {
      assert.deepEqual(stepActor(boss, p, sample, false, camera), frame.shots);
      assert.deepEqual(boss.sounds, frame.sounds);
      compare(boss, frame.expected, `${strike}/${tick}`);
      assert.equal(Boolean(boss.exitMovie), frame.requests.length > 0);
    }
  }
});

test('missiles track player height during their delay, then accelerate sideways and expire at native bounds', () => {
  for (const {initial, trace} of f.projectiles) {
    const shot = Object.assign(createProjectile({type: 70, ...initial}), initial);
    for (const [tick, row] of trace.entries()) {
      stepProjectile(shot, () => 0, false, camera, createPlayer(0, row.playerY));
      compare(shot, row.expected, `missile ${tick}`);
    }
  }
});

test('missile damage respects booster immunity, hurt guard and side knockback', () => {
  for (const row of f.projectileContacts) {
    const p = player(row.before), shot = createProjectile({type: 70, x: 9700, y: 2800, vx: row.vx, vy: 0, delay: 20});
    assert.deepEqual(hitProjectile(p, shot), row.sounds);
    compare(p, row.player, 'missile contact', true);
    assert.equal(shot.removed, row.removed);
  }
});

test('booster boss ally attacks preserve the native immediate damage and repeated-hit guard', () => {
  for (const {slot, state, trace} of f.allies) {
    const boss = createActor(122, 9823, 2741), p = createPlayer(9550, 2850);
    for (const expected of trace) {
      assert.deepEqual(hitCompanion(p, boss, {slot, state}), expected.sounds);
      compare(boss, expected.boss, `ally ${slot}`); assert.equal(p.points, expected.points);
    }
  }
});

test('tracking missiles disappear on all native collision types with matching terrain corrections', () => {
  for (const {pixel, initial, expected} of f.terrain) {
    const shot = Object.assign(createProjectile({type: 70, ...initial}), initial);
    resolveProjectileTerrain(shot, (x, y) => x >= 320 && x < 352 && y >= 320 && y < 352 ? pixel : 0);
    compare(shot, expected, `terrain ${pixel}`);
  }
});

test('native exit controller loads stage4.map, adds three lives and restores normal movement', () => {
  for (const row of f.transitions) {
    const p = player(row.before);
    enterNextStage(p, 4);
    compare(p, row.player, row.strategy, true);
    assert.equal(p.booster, false); assert.equal(p.flight, false);
    assert.equal(p.animationOverride, undefined);
    assert.equal(row.update, '0x405cf0'); assert.equal(row.contact, '0x4098f0');
    assert.deepEqual([row.stage, row.width, row.height], [4, 999, 200]);
  }
});

test('complete native booster battle, missile ordering, exit movie and next-map player state agree', () => {
  const p = createPlayer(9550, 2850), world = createWorld([{kind: 122, x: 9823, y: 2741}], map);
  enterBooster(p); world.actors[0].active = true; world.actors[0].spawnOrder = 0;
  for (const [tick, row] of f.coupled.entries()) {
    const clips = stepWorld(world, p, {...row.input, jump: row.input.up}, camera, sample, 1000 + tick * 1000 / 30);
    assert.deepEqual(clips.map((clip) => typeof clip === 'string' ? clip : clip.name), row.sounds, `${tick} sounds`);
    compare(world.actors[0], row.boss, `${tick} boss`);
    assert.equal(world.stageComplete, row.stage === 4);
    if (world.stageComplete) enterNextStage(p, 4);
    compare(p, row.player, `${tick} player`, true);
    if (row.moviePhase !== null) assert.equal(world.stageEntry.phase, row.moviePhase, `${tick} movie`);
    if (!world.stageComplete) assert.deepEqual(world.projectiles.map((shot) => ({type: shot.type, x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy,
      ...(shot.type === 70 ? {frame: shot.frame, ticks: shot.ticks, delay: shot.delay} : {})})), row.shots, `${tick} projectiles`);
  }
  assert.equal(p.lives, 8); assert.equal(p.points, 30);
  assert.equal(world.stageComplete, true);
});

test('actual booster arena clears, plays exit/entry/fall, then resumes normal movement', () => {
  const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
  const p = createPlayer(9550, 2850), world = createWorld(readStageObjects(map, config, archive), map), view = {...camera};
  enterBooster(p);
  for (let tick = 0; tick < 1800 && !world.stageComplete && !p.dead; tick++) {
    const boss = world.actors.find((actor) => actor.kind === 122), x = boss.x + 60, y = boss.y + 160;
    stepWorld(world, p, {left: p.x > x + 5, right: p.x < x - 5, jump: p.y > y + 5, down: p.y < y - 5,
      fire: !world.stageEntry && tick % 12 === 0}, view, sample, tick * 1000 / 30);
    if (!world.stageEntry || world.stageEntry.finished) followCamera(view, p, map);
  }
  assert.equal(world.stageComplete, true);
  assert.equal(world.stageEntry.stage, 'boosterExit'); assert.equal(world.stageEntry.transitions, 1);
  assert.equal(p.lives, 5); assert.equal(p.points, 30);
  enterNextStage(p, 4);
  const nextMap = decodeMap(archive.get('stage4.map')), nextMask = decodeImage(archive.get('block4.app'));
  const next = createWorld(readStageObjects(nextMap, config, archive), nextMap), nextCamera = {x: 0, y: 0};
  next.stageEntry = createStageEntry(5);
  let fallingX, resumed = 0;
  for (let tick = 0; tick < 1300 && resumed < 20; tick++) {
    stepWorld(next, p, {right: true}, nextCamera, (x, y) => collisionAt(nextMap, nextMask, x, y), 100000 + tick * 1000 / 30);
    if (next.stageEntry.finished) followCamera(nextCamera, p, nextMap);
    if (next.falling) {
      fallingX ??= p.x;
      assert.equal(p.x, fallingX, 'held direction cannot interrupt the original fall');
    } else if (fallingX !== undefined) resumed++;
  }
  assert.equal(next.stageEntry.finished, true);
  assert.equal(p.booster, false); assert.equal(p.flight, false);
  assert.equal(resumed, 20); assert.equal(next.falling, false);
  assert.ok(p.x > fallingX + 100); assert.equal(p.y, 6232);
  assert.equal(p.lives, 8); assert.equal(p.points, 30);
});
