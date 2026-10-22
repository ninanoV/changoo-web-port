import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer, enterNextStage, collisionAt, followCamera } from '../web/game.js';
import { enterFlight, stepFlightCamera } from '../web/flight.js';
import { createActor, stepActor, actorSprite, hitActor, hitWeapon, hitCompanion, createProjectile, createWorld, stepWorld, readStageObjects, initializeWorldCamera, advanceWorldCamera } from '../web/objects.js';
import { FLIGHT_BOSS } from '../web/flight-boss-data.js';
import { setFlightBossState } from '../web/flight-boss.js';
import { enterBooster } from '../web/booster.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createStageEntry } from '../web/stage-entry.js';
import { isFlightEnemy } from '../web/flight-actors.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-flight-boss.json', import.meta.url)));
const camera = { x: 37700, y: 0 }, sample = () => 0;
function compare(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], actual.flight && key === 'state' ? value === 18 ? 'flight' : 'flightHurt' : value, `${label} ${key}`);
}
function player(before = { x: 37900, y: 200, state: 18 }) {
  const p = createPlayer(before.x, before.y); enterFlight(p);
  return Object.assign(p, before, { state: before.state === 18 ? 'flight' : 'flightHurt' });
}

test('shooting boss constructor, twenty health and animation data come from the executable', () => {
  assert.deepEqual(FLIGHT_BOSS, fixture.metadata);
  const boss = createActor(33, 38262, 187);
  compare(boss, FLIGHT_BOSS.initial, 'initial');
  assert.deepEqual(Object.values(boss.body), FLIGHT_BOSS.body);
  assert.equal(boss.health, 20);
});

for (const { seed, trace } of fixture.movement) {
  test(`shooting boss random movement and firing agree with native seed ${seed}`, () => {
    const boss = createActor(33, 38262, 187), random = { randomSeed: seed };
    trace.forEach((row, tick) => {
      assert.deepEqual(stepActor(boss, player({ ...row.player, state: 18 }), sample, false, camera, random), row.shots);
      compare(boss, row.expected, `${seed}/${tick}`);
      assert.equal(random.randomSeed, row.randomSeed);
      assert.equal(actorSprite(boss), FLIGHT_BOSS.images[row.expected.spriteIndex]);
    });
  });
}

test('shooting boss range and position corrections preserve native order and requeue requests', () => {
  for (const { initial, expected, randomSeed, shots, respawns } of fixture.boundaries) {
    const boss = Object.assign(createActor(33, initial.x, initial.y), initial), random = { randomSeed: 1 };
    assert.deepEqual(stepActor(boss, player(), sample, false, camera, random), shots);
    compare(boss, expected, 'boundary');
    assert.equal(random.randomSeed, randomSeed);
    assert.equal(Boolean(boss.requeue), respawns.length > 0);
  }
});

test('body and laser contacts use the original hurt-state and invulnerability rules', () => {
  for (const row of fixture.contacts) {
    const boss = Object.assign(createActor(33, row.boss.x, row.boss.y), row.boss), p = player(row.before);
    for (const expected of row.trace) {
      assert.deepEqual(hitActor(p, boss), expected.sounds);
      compare(p, expected.player, 'body player'); compare(boss, expected.boss, 'body boss');
    }
  }
  for (const row of fixture.lasers) {
    const boss = Object.assign(createActor(33, row.boss.x, row.boss.y), row.boss), p = player(row.before);
    const shot = createProjectile({ type: 35, x: boss.x, y: boss.y, vx: 24, vy: 0 });
    for (const expected of row.trace) {
      assert.deepEqual(hitWeapon(p, boss, shot), expected.sounds);
      compare(p, expected.player, 'laser player'); compare(boss, expected.boss, 'laser boss');
      assert.equal(shot.removed, expected.removed);
    }
  }
});

test('shooting boss companion contacts and repeat guards match the native callbacks', () => {
  for (const { slot, state, trace } of fixture.allies) {
    const boss = createActor(33, 38262, 187), p = player();
    for (const expected of trace) {
      assert.deepEqual(hitCompanion(p, boss, { slot, state }), expected.sounds);
      compare(boss, expected.boss, `ally ${slot}/${state}`);
      assert.equal(p.points, expected.points);
    }
  }
});

test('twenty native delayed hits fire 21 retaliation bullets each and request one next-stage transition', () => {
  const boss = createActor(33, 38262, 187), p = player();
  for (const [hit, trace] of fixture.death.entries()) {
    setFlightBossState(boss, 4);
    for (const [tick, row] of trace.entries()) {
      assert.deepEqual(stepActor(boss, p, sample, false, camera), row.shots);
      compare(boss, row.expected, `hit ${hit}/${tick}`);
      assert.equal(Boolean(boss.levelComplete), row.requests.length > 0);
    }
  }
  assert.equal(boss.health, 0);
});

test('the real native map reader transitions from shooting to booster with three lives and preserved velocity', () => {
  const final = fixture.transition.at(-1), p = player();
  Object.assign(p, { vx: -4, vy: 3, invulnerable: 17, flightReady: true });
  enterNextStage(p, 3); enterBooster(p);
  for (const [key, value] of Object.entries(final.player)) assert.equal(p[key], key === 'state' ? 'booster' : value, key);
  assert.equal(p.boostReady, final.ready);
  assert.equal(p.flight, false);
  assert.equal(final.stage, 3);
  assert.deepEqual(fixture.mapLoads.map((row) => row.stage), [2, 3]);
});

test('complete original scheduler battle: twenty boss hits, live retaliation and booster transition agree', () => {
  const p = player(), world = createWorld(fixture.placements, { width: 1400, height: 20 });
  world.actors.forEach((actor, index) => { actor.active = true; actor.spawnOrder = index; });
  world.flightStopped = true;
  for (const [tick, row] of fixture.coupled.entries()) {
    assert.deepEqual(stepWorld(world, p, { ...row.input, jump: row.input.up }, row.camera, sample, tick * 1000 / 30), row.sounds, `battle ${tick} sounds`);
    compare(world.actors[2], row.boss, `battle ${tick} boss`);
    assert.equal(world.randomSeed, row.randomSeed);
    assert.equal(world.stageComplete, row.stage === 3);
    if (world.stageComplete) { enterNextStage(p, 3); enterBooster(p); }
    for (const [key, value] of Object.entries(row.player)) {
      const expected = key === 'state' ? value === 26 ? 'booster' : value === 18 ? 'flight' : 'flightHurt' : value;
      assert.equal(p[key], expected, `battle ${tick} player ${key}`);
    }
  }
  assert.equal(world.stageComplete, true);
  assert.equal(p.lives, 4);
  assert.equal(p.points, 22);
});

test('actual boss arena clears with existing lives, enters stage3.map and resumes booster after its movie', () => {
  const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
  const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
  const map = decodeMap(archive.get('shoot.map')), mask = decodeImage(archive.get('sblock.app'));
  const world = createWorld(readStageObjects(map, config, archive), map), p = player(), camera = { x: 37700, y: 0 };
  for (let tick = 0; tick < 2200 && !world.stageComplete && !p.dead; tick++) {
    stepFlightCamera(camera, p, map, world.flightStopped);
    const boss = world.actors.find((actor) => actor.kind === 33), y = boss.y + 70 + (Math.floor(tick / 18) % 2 ? 80 : -80);
    stepWorld(world, p, { left: p.x > camera.x + 160, jump: p.y > y + 5, down: p.y < y - 5, fire: tick % 8 === 0 }, camera,
      (x, y) => collisionAt(map, mask, x, y), tick * 1000 / 30);
  }
  assert.equal(world.stageComplete, true);
  assert.equal(p.dead, false); assert.equal(p.lives, 1);
  const score = p.points;
  enterNextStage(p, 3); enterBooster(p);
  assert.equal(p.points, score, 'the stage transition itself preserves points');
  const nextMap = decodeMap(archive.get('stage3.map')), nextMask = decodeImage(archive.get('block3.app'));
  const next = createWorld(readStageObjects(nextMap, config, archive), nextMap, world.randomSeed), view = { x: 0, y: 0 };
  next.stageEntry = createStageEntry(4);
  let fired = false;
  for (let tick = 0; tick < 160; tick++) {
    stepWorld(next, p, { right: true, down: true, fire: tick === 100 }, view, (x, y) => collisionAt(nextMap, nextMask, x, y), 100000 + tick * 1000 / 30);
    if (next.stageEntry.finished) followCamera(view, p, nextMap);
    fired ||= next.projectiles.some((shot) => shot.type === 35);
  }
  assert.equal(next.stageEntry.finished, true);
  assert.equal(p.booster, true); assert.equal(p.flight, false);
  assert.ok(p.x > 0 && p.y > 0); assert.equal(fired, true);
  assert.equal(p.points, score + 1, 'the restored first booster enemy is hit by the fired laser');
  assert.ok(next.actors.some((actor) => actor.kind === 21 && actor.state === 4));
  assert.equal(p.lives, 4);
});

test('natural shoot.map run from the origin spawns and defeats the boss before game over', () => {
  const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
  const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
  const map = decodeMap(archive.get('shoot.map')), mask = decodeImage(archive.get('sblock.app'));
  const world = createWorld(readStageObjects(map, config, archive), map);
  const p = createPlayer(0, 0), camera = { x: 0, y: 0 }, sample = (x, y) => collisionAt(map, mask, x, y);
  enterFlight(p); world.stageEntry = createStageEntry(3); initializeWorldCamera(world, p, camera);
  let spawned;
  for (let tick = 0; tick < 16000 && !p.dead && !world.stageComplete; tick++) {
    if (world.stageEntry.finished) advanceWorldCamera(world, p, camera, 3, tick * 1000 / 30);
    const boss = world.actors.find(actor => actor.kind === 33 && actor.active && !actor.removed);
    if (boss && !spawned) spawned = { x: boss.x, y: boss.y, health: boss.health };
    const target = boss ?? world.actors.filter(actor => isFlightEnemy(actor.kind) && actor.active && !actor.removed && actor.state !== 4 && actor.x > p.x + 100)
      .sort((a, b) => a.x - b.x)[0];
    const y = target ? target.y + (boss ? 70 : 6) : 240;
    stepWorld(world, p, { right: boss ? p.x < boss.x - 140 : p.x < camera.x + 350,
      jump: p.y > y + 12, down: p.y < y - 12, fire: tick % 10 === 0 }, camera, sample, tick * 1000 / 30);
  }
  const boss = world.actors.find(actor => actor.kind === 33);
  assert.deepEqual(spawned, { x: 38262, y: 187, health: 20 });
  assert.equal(boss.health, 0);
  assert.equal(world.stageComplete, true);
  assert.equal(p.dead, false);
  assert.ok(p.lives > 0);
});
