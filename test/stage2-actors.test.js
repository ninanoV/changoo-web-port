import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeImage, decodeMap } from '../web/resources.js';
import { createPlayer, collisionAt, followCamera } from '../web/game.js';
import { createActor, stepActor, hitActor, actorSprite, createProjectile, hitWeapon, readStageObjects, hitCompanion, createWorld, stepWorld, stepProjectile, resolveProjectileTerrain, hitProjectile } from '../web/objects.js';
import { createStageEntry } from '../web/stage-entry.js';
import { setStage2State, resolveEnemyTerrain } from '../web/stage2-actors.js';
import { STAGE2_ACTORS, IGNORED_KINDS, JUNGLE_PROJECTILE } from '../web/stage2-actor-data.js';
import { enterBooster } from '../web/booster.js';
import { BOOSTER_POSES } from '../web/booster-data.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-stage2-actors.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage2.map')), mask = decodeImage(archive.get('block2.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
const states = { 0: 'idle', 2: 'air', 4: 'hurt', 10: 'chickenAir', 14: 'roachAir', 17: 'roachDash' };
test('bat spawn and each direction-marker contact retain the native sound calls', () => {
  const world = createWorld([{kind: 119, x: 320, y: 320, column: 10, row: 10}, {kind: 15, x: 330, y: 325, column: 10, row: 10}]);
  const p = createPlayer(0, 0), camera = {x: 0, y: 0};
  assert.deepEqual(stepWorld(world, p, {}, camera, () => 0), STAGE2_ACTORS[119].spawnSounds);
  for (let i = 0; i < 2; i++) assert.deepEqual(stepWorld(world, p, {}, camera, () => 0), STAGE2_ACTORS[119].turnSounds[2]);
});
test('jungle projectile uses the native coconut image, movement and first-bounce removal', () => {
  assert.deepEqual(JUNGLE_PROJECTILE, fixture.projectile);
  decodeImage(archive.get(JUNGLE_PROJECTILE.name));
  for (const {initial, trace} of fixture.projectileTraces) {
    const shot = createProjectile({type: 97, ...initial});
    for (const [tick, expected] of trace.entries()) {
      stepProjectile(shot, sample, false, {x: 6200, y: 1000});
      for (const [key, value] of Object.entries(expected)) assert.equal(shot[key], value, `${initial.vx}/${tick} ${key}`);
    }
  }
  for (const {pixel, initial, expected} of fixture.projectileTerrain) {
    const shot = Object.assign(createProjectile({type: 97, ...initial}), initial);
    resolveProjectileTerrain(shot, (x, y) => x >= 320 && x < 352 && y >= 320 && y < 352 ? pixel : 0);
    for (const [key, value] of Object.entries(expected)) assert.equal(shot[key], value, `terrain/${pixel}/${initial.x}/${initial.y} ${key}`);
  }
});
test('jungle coconut contacts preserve native direction, immunity and consumption', () => {
  for (const {before, vx, player, removed, sounds} of fixture.projectileContacts) {
    const p = Object.assign(createPlayer(before.x, before.y), before, {state: states[before.state]});
    const shot = createProjectile({type: 97, x: 6500, y: 1200, vx, vy: 6});
    assert.deepEqual(hitProjectile(p, shot), sounds);
    assert.equal(shot.removed, removed);
    for (const [key, value] of Object.entries(player)) assert.equal(p[key], key === 'state' ? states[value] : value, `${before.state}/${vx} ${key}`);
  }
});
function compare(actor, expected, label) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actor[key], value, `${label}: ${key}`);
  assert.equal(actorSprite(actor), STAGE2_ACTORS[actor.kind].images[expected.spriteIndex]);
}

test('stage-two enemy dimensions, bodies and animation tables match native constructors', () => {
  assert.deepEqual(STAGE2_ACTORS, fixture.metadata);
  assert.deepEqual(IGNORED_KINDS, fixture.ignored);
  for (const [kind, data] of Object.entries(fixture.metadata)) {
    const actor = createActor(Number(kind), 6500, 1200);
    compare(actor, data.initial, kind);
    assert.deepEqual(Object.values(actor.body), data.body);
    for (const name of data.images) decodeImage(archive.get(name));
  }
  const objects = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  assert.ok(objects.filter((o) => o.kind === 20 || o.kind === 21).every((o) => !o.hidden));
});

for (const { kind, scenario, initial, trace } of fixture.movement) {
  test(`stage-two kind ${kind}/${scenario}: native movement, terrain, animations and shots agree`, () => {
    const actor = Object.assign(createActor(kind, initial.x, initial.y), initial), p = createPlayer(0, 1336);
    trace.forEach(({ state, playerX, playerY, expected, shots, sounds }, tick) => {
      if (state !== null) setStage2State(actor, state);
      p.x = playerX;
      p.y = playerY;
      assert.deepEqual(stepActor(actor, p, sample), shots, `kind ${kind} tick ${tick} shots`);
      assert.deepEqual(actor.sounds, sounds, `kind ${kind} tick ${tick} sounds`);
      compare(actor, expected, `kind ${kind} tick ${tick}`);
    });
  });
}

test('native contacts preserve stomp, dash, hurt, immunity, defeat and bonus rules', () => {
  for (const { kind, enemyState, before, scenario, player, enemy } of fixture.contacts) {
    const actor = createActor(kind, 6500, 1200);
    setStage2State(actor, enemyState);
    const p = Object.assign(createPlayer(before.x, before.y), before, { state: states[before.state] });
    hitActor(p, actor);
    compare(actor, enemy, `${kind}/${scenario}`);
    for (const [key, value] of Object.entries(player)) assert.equal(p[key], key === 'state' ? states[value] : value, `${kind}/${scenario} player ${key}`);
  }
});

test('both native weapons hit each new enemy and preserve projectile consumption', () => {
  for (const { kind, type, enemyState, enemy, points, removed } of fixture.weapons) {
    const actor = createActor(kind, 6500, 1200), p = createPlayer(6500, 3032);
    setStage2State(actor, enemyState);
    const shot = createProjectile({ type, x: 6500, y: 1200, vx: 10, vy: -10 });
    hitWeapon(p, actor, shot);
    compare(actor, enemy, `${kind}/${type}`);
    assert.equal(p.points, points);
    assert.equal(shot.removed, removed);
  }
});

test('native companion contacts agree for every shared enemy, including repeated hits', () => {
  for (const { slot, state, kind, enemyState, first, second } of fixture.allies) {
    const actor = createActor(kind, 6500, 1200), p = createPlayer(6500, 1336);
    setStage2State(actor, enemyState);
    for (const expected of [first, second]) {
      hitCompanion(p, actor, { slot, state });
      compare(actor, expected.enemy, `slot ${slot}, state ${state}, kind ${kind}`);
      assert.equal(p.points, expected.points);
    }
  }
});

test('isolated native type-1/type-2 corrections preserve the enemies vertical velocity', () => {
  for (const { kind, pixel, before, expected } of fixture.terrain) {
    const actor = Object.assign(createActor(kind, before.x, before.y), before);
    resolveEnemyTerrain(actor, (x, y) => x >= 320 && x < 352 && y >= 320 && y < 352 ? pixel : 0);
    compare(actor, expected, `${kind} type ${pixel} at ${before.x},${before.y}`);
  }
});

test('prefetched enemies use the booster-specific damage pose and preserve hurt immunity', () => {
  const names = {26: 'booster', 27: 'boostHurt', 28: 'boostAttack'};
  for (const row of fixture.boosterContacts) {
    const actor = createActor(row.kind, 6500, 1200); setStage2State(actor, row.enemyState);
    const p = createPlayer(row.before.x, row.before.y); enterBooster(p);
    Object.assign(p, row.before, { state: names[row.before.state], animationOverride: BOOSTER_POSES[row.before.state] });
    assert.deepEqual(hitActor(p, actor), row.sounds);
    compare(actor, row.enemy, `${row.kind} booster enemy`);
    for (const [key, value] of Object.entries(row.player)) assert.equal(p[key], key === 'state' ? names[value] : value, `${row.kind} booster ${key}`);
  }
});

test('booster laser hits kill prefetched enemies and ignore their death animation', () => {
  for (const row of fixture.lasers) {
    const actor = createActor(row.kind, 6500, 1200); setStage2State(actor, row.enemyState);
    const p = createPlayer(6500, 1250); p.points = 99;
    const shot = createProjectile({type: 35, x: 6500, y: 1200, vx: 12, vy: 0});
    assert.deepEqual(hitWeapon(p, actor, shot), row.sounds);
    compare(actor, row.enemy, `${row.kind} laser`);
    assert.equal(p.points, row.points); assert.equal(p.lives, row.lives);
    assert.equal(shot.removed, row.removed);
  }
});

test('prefetched enemy range checks preserve the native final update and requeue position', () => {
  for (const {kind, initial, expected} of fixture.ranges) {
    const actor = Object.assign(createActor(kind, initial.x, initial.y), initial);
    stepActor(actor, createPlayer(6500, 1250), () => 0, false, {x: 5000, y: 2000});
    compare(actor, expected, `${kind} range`);
    assert.equal(Boolean(actor.requeue), expected.removed);
    if (actor.requeue) assert.deepEqual(actor.requeue, {x: initial.x, y: initial.y});
  }
});

test('the actual stage-two entry route can stomp its first enemies without granting inventory', () => {
  const objects = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const world = createWorld(objects), p = createPlayer(0, 0), camera = { x: 0, y: 0 };
  world.stageEntry = createStageEntry(2); p.moveEnabled = false;
  for (let tick = 0; tick < 750 && p.x < 2800 && !p.dead; tick++) {
    const enemy = world.actors.find((actor) => actor.active && !actor.removed && [29, 30].includes(actor.kind) && actor.x > p.x && actor.x - p.x < 145);
    stepWorld(world, p, { right: true, fire: tick === 1, jump: Boolean(enemy) && ['idle', 'walk'].includes(p.state) && !p.jumpHeld }, camera, sample, 1000 + tick * 1000 / 30);
    if (world.stageEntry.finished) followCamera(camera, p, map);
  }
  assert.ok(p.x >= 2800);
  assert.equal(p.lives, 5);
  assert.equal(p.points, 3);
  assert.equal(p.balls + p.waterBombs + p.companionItems.reduce((a, b) => a + b, 0), 0);
});
