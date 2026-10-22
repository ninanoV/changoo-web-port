import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer, collisionAt } from '../web/game.js';
import { enterFlight, stepFlightCamera } from '../web/flight.js';
import { readArchive, decodeImage, decodeMap } from '../web/resources.js';
import { createActor, stepActor, actorSprite, hitActor, createProjectile, stepProjectile, resolveProjectileTerrain, hitProjectile, hitWeapon, hitCompanion, readStageObjects, createWorld, stepWorld } from '../web/objects.js';
import { FLIGHT_ACTORS, FLIGHT_BULLETS } from '../web/flight-actor-data.js';
import { createCompanion } from '../web/companions.js';
import { isFlightEnemy } from '../web/flight-actors.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-flight-actors.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
function compare(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], key === 'state' && actual.flight ? value === 18 ? 'flight' : 'flightHurt' : value, `${label}: ${key}`);
}
function player(before) {
  const p = createPlayer(before.x, before.y);
  enterFlight(p);
  return Object.assign(p, before, { state: before.state === 18 ? 'flight' : 'flightHurt' });
}

test('shooting actor and bullet constructors use the original dimensions and animation tables', () => {
  assert.deepEqual(FLIGHT_ACTORS, fixture.metadata);
  assert.deepEqual(FLIGHT_BULLETS, fixture.bullets);
  for (const [kind, metadata] of Object.entries(FLIGHT_ACTORS)) {
    const actor = createActor(Number(kind), 6500, 200);
    compare(actor, metadata.initial, kind);
    assert.deepEqual(actor.body ? Object.values(actor.body) : null, metadata.body);
    for (const name of metadata.images) decodeImage(archive.get(name));
  }
});

for (const { kind, state, initial, trace } of fixture.traces) {
  test(`flight actor ${kind}/state ${state}: native movement, animation and firing agree`, () => {
    const actor = Object.assign(createActor(kind, initial.x, initial.y), initial);
    for (const [tick, row] of trace.entries()) {
      assert.deepEqual(stepActor(actor, createPlayer(row.player.x, row.player.y), () => 0, false, row.camera), row.shots, `${kind}/${state}/${tick} shots`);
      compare(actor, row.expected, `${kind}/${state}/${tick}`);
      assert.equal(actorSprite(actor), FLIGHT_ACTORS[kind].images[row.expected.spriteIndex ?? 0]);
    }
  });
}

test('flight body contacts match native damage, repeated hits, invulnerability and 100-point bonus', () => {
  for (const row of fixture.contacts) {
    const actor = Object.assign(createActor(row.kind, 6500, 200), row.initial), p = player(row.before);
    for (const expected of [row.first, row.second]) {
      assert.deepEqual(hitActor(p, actor), expected.sounds);
      compare(actor, expected.actor, `contact ${row.kind} enemy`);
      compare(p, expected.player, `contact ${row.kind} player`);
    }
  }
});

test('laser hits consume a shot only on a live enemy, and do not reward repeated hits', () => {
  for (const row of fixture.lasers) {
    const actor = Object.assign(createActor(row.kind, 6500, 200), row.initial), p = player(row.before);
    const shot = createProjectile({ type: 35, x: 6500, y: 200, vx: 24, vy: 0 });
    for (const expected of [row.first, row.second]) {
      assert.deepEqual(hitWeapon(p, actor, shot), expected.sounds);
      compare(actor, expected.actor, `laser ${row.kind} enemy`);
      compare(p, expected.player, `laser ${row.kind} player`);
      assert.equal(shot.removed, expected.removed);
    }
  }
});

test('shooting actors are removed at native range boundaries instead of being respawned', () => {
  for (const { kind, initial, expected } of fixture.offscreen) {
    const actor = Object.assign(createActor(kind, initial.x, initial.y), initial);
    stepActor(actor, createPlayer(200, 100), () => 0, false, { x: 0, y: 0 });
    compare(actor, expected, `offscreen ${kind} x${initial.x}`);
  }
});

test('straight and aimed shots retain their native velocity and removal rules', () => {
  for (const { kind, initial, trace } of fixture.bulletTraces) {
    const shot = createProjectile({ type: kind, ...initial });
    for (const expected of trace) {
      stepProjectile(shot, () => 0, false, { x: 6200, y: 0 });
      compare(shot, expected, `bullet ${kind}`);
    }
  }
  for (const { kind, before, player: expected, removed, sounds } of fixture.bulletContacts) {
    const p = player(before), shot = createProjectile({ type: kind, x: 6500, y: 200, vx: -8, vy: 0 });
    assert.deepEqual(hitProjectile(p, shot), sounds);
    compare(p, expected, `bullet ${kind} contact`);
    assert.equal(shot.removed, removed);
  }
});

test('flight bullets use the native first-impact removal on type-1 and type-2 terrain', () => {
  for (const { kind, pixel, before, expected } of fixture.terrain) {
    const shot = Object.assign(createProjectile({ type: kind, ...before }), before);
    resolveProjectileTerrain(shot, (x, y) => x >= 320 && x < 352 && y >= 320 && y < 352 ? pixel : 0);
    compare(shot, expected, `terrain ${kind}/${pixel}`);
  }
});

test('native companion contact callbacks leave shooting enemies untouched', () => {
  for (const { kind, slot, state, first, second } of fixture.allies) {
    const actor = createActor(kind, 6500, 200), p = createPlayer(6500, 200);
    for (const expected of [first, second]) {
      hitCompanion(p, actor, { slot, state });
      compare(actor, expected.enemy, `ally ${slot} enemy ${kind}`);
      assert.equal(p.points, expected.points);
    }
  }
});

test('companion target searches and area attacks preserve the native exclusion of shooting enemies', () => {
  for (const { slot, cost, trace } of fixture.allyUpdates) {
    assert.ok(trace.every((row) => row.enemies.every((actor) => actor.state === 1)), 'native targets stay untouched');
    const world = createWorld([55, 56, 57].map((kind, index) => ({ kind, x: 300 + index * 100, y: 200 })), { width: 1400, height: 20 });
    world.actors.forEach((actor, index) => { actor.active = true; actor.spawnOrder = index; });
    const p = createPlayer(100, 200), camera = { x: 0, y: 0 };
    enterFlight(p); p.invulnerable = 10000;
    world.companion = createCompanion(slot, cost, camera);
    for (const [tick, expected] of trace.entries()) {
      p.x = 100; p.y = 200; // Native isolated companion fixture holds its player target still.
      stepWorld(world, p, {}, camera, () => 0, tick * 1000 / 30);
      assert.ok(world.actors.every((actor) => actor.state !== 4), `slot ${slot} must not defeat a flight target`);
      if (expected.removed) assert.equal(world.companion, null);
      else for (const key of ['x', 'y', 'state']) assert.equal(world.companion[key], expected[key], `${slot}/${cost}/${tick} ${key}`);
    }
  }
});

for (const { scenario, placements, trace } of fixture.coupled) {
  test(`coupled flight ${scenario}: native scheduler and collision managers agree`, () => {
    const p = createPlayer(100, 200), world = createWorld(placements, { width: 1400, height: 20 });
    enterFlight(p);
    world.actors.forEach((actor, index) => { actor.active = true; actor.spawnOrder = index; });
    for (const [tick, row] of trace.entries()) {
      const sounds = stepWorld(world, p, { ...row.input, jump: row.input.up }, row.camera, () => 0, tick * 1000 / 30);
      compare(p, row.player, `${scenario} ${tick} player`);
      row.actors.forEach((expected, index) => compare(world.actors[index], expected, `${scenario} ${tick} actor ${index}`));
      assert.deepEqual(world.projectiles.map(({ type, x, y, vx, vy }) => ({ type, x, y, vx, vy })), row.shots, `${scenario} ${tick} shots`);
      assert.deepEqual(sounds, row.sounds, `${scenario} ${tick} sounds`);
    }
  });
}

test('actual shooting map: fly from the origin through the first waves using movement and firing only', () => {
  const map = decodeMap(archive.get('shoot.map')), mask = decodeImage(archive.get('sblock.app'));
  const definitions = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const world = createWorld(definitions, map), p = createPlayer(0, 0), camera = { x: 0, y: 0 };
  enterFlight(p);
  for (let tick = 0; tick < 2600 && !p.dead; tick++) {
    stepFlightCamera(camera, p, map, world.flightStopped);
    const target = world.actors.filter((actor) => isFlightEnemy(actor.kind) && actor.active && !actor.removed && actor.state !== 4 && actor.x > p.x + 100)
      .sort((a, b) => a.x - b.x)[0];
    const y = target ? target.y + 6 : 240;
    stepWorld(world, p, { right: p.x < camera.x + 350, jump: p.y > y + 12, down: p.y < y - 12, fire: tick % 10 === 0 },
      camera, (x, y) => collisionAt(map, mask, x, y), tick * 1000 / 30);
  }
  assert.ok(p.x > 6300 && !p.dead);
  assert.equal(p.lives, 5);
  assert.equal(p.points, 14);
  assert.ok(world.actors.filter((actor) => isFlightEnemy(actor.kind) && actor.state === 4).length >= 10);
  assert.equal(p.balls + p.waterBombs + p.cans + p.companionItems.reduce((sum, count) => sum + count, 0), 0);
});
