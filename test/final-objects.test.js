import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer, collisionAt, followCamera } from '../web/game.js';
import { createActor, actorSprite, stepActor, createProjectile, stepProjectile, resolveProjectileTerrain, hitProjectile, createWorld, stepWorld, readStageObjects } from '../web/objects.js';
import { FIRE_EFFECT, FINAL_PROJECTILE } from '../web/final-stage-data.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-final-objects.json', import.meta.url)));
const states = {0: 'idle', 2: 'air', 4: 'hurt', 10: 'chickenAir', 14: 'roachAir', 17: 'roachDash'};
const compare = (actual, expected, label) => {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `${label}/${key}`);
};

test('fire is a native non-colliding decoration with 200 matching animation ticks', () => {
  assert.deepEqual(FIRE_EFFECT, fixture.fire); assert.deepEqual(FIRE_EFFECT.collisionRegistrations, []);
  const actor = createActor(95, 6500, 1200), p = createPlayer(6500, 1200), camera = {x: 6200, y: 1000};
  assert.equal(actor.body, null); compare(actor, FIRE_EFFECT.initial, 'initial');
  for (const [tick, {expected, draws}] of fixture.fireTrace.entries()) {
    assert.deepEqual([{name: actorSprite(actor), x: actor.x - camera.x, y: actor.y - camera.y}], draws, `draw ${tick}`);
    assert.deepEqual(stepActor(actor, p, () => 0, false, camera), []);
    compare(actor, expected, `fire ${tick}`);
  }
  const world = createWorld([{kind: 95, x: 6500, y: 1200, column: 204, row: 40}]);
  const control = createPlayer(6500, 1200), emptyWorld = createWorld([]);
  for (let i = 0; i < 10; i++) { stepWorld(world, p, {}, camera, () => 0); stepWorld(emptyWorld, control, {}, camera, () => 0); }
  assert.deepEqual(p, control);
});

test('fire range callbacks finish their native final tick and requeue without a body', () => {
  for (const {initial, expected} of fixture.fireRanges) {
    const actor = Object.assign(createActor(95, initial.x, initial.y), initial);
    stepActor(actor, createPlayer(0, 0), () => 0, false, {x: 5000, y: 1000});
    compare(actor, expected, `range ${initial.x}`);
  }
  const world = createWorld([{kind: 95, x: 9000, y: 1200, column: 284, row: 43}]);
  world.actors[0].active = true;
  stepWorld(world, createPlayer(0, 0), {}, {x: 5000, y: 1000}, () => 0);
  assert.equal(world.actors[0].active, false); assert.equal(world.actors[0].body, null);
});

test('ghost projectile preserves native geometry and 600 movement/freeze/resume ticks', () => {
  assert.deepEqual(FINAL_PROJECTILE, fixture.projectile);
  for (const {initial, trace} of fixture.movement) {
    const shot = createProjectile({type: 94, ...initial});
    assert.deepEqual(Object.values(shot.body), FINAL_PROJECTILE.body);
    for (const [tick, {camera, expected}] of trace.entries()) {
      stepProjectile(shot, () => 0, false, camera);
      compare(shot, expected, `${initial.vx}/${tick}`);
    }
  }
});

test('ghost projectile terrain uses three bounces and native type-2 correction', () => {
  for (const {pixel, initial, expected} of fixture.terrain) {
    const shot = Object.assign(createProjectile({type: 94, ...initial}), initial);
    resolveProjectileTerrain(shot, (x, y) => x >= 320 && x < 352 && y >= 320 && y < 352 ? pixel : 0);
    compare(shot, expected, `terrain ${pixel}/${initial.bounces}`);
  }
});

test('ghost projectile contacts match all native player forms and invulnerability', () => {
  for (const {before, vx, player, actor, sounds} of fixture.contacts) {
    const p = Object.assign(createPlayer(before.x, before.y), before, {state: states[before.state]});
    const shot = createProjectile({type: 94, x: 6500, y: 1200, vx, vy: -16});
    assert.deepEqual(hitProjectile(p, shot), sounds.map(name => name === 'existing-effect' ? 'DEM-SHIN.WAV' : name));
    compare(p, {...player, state: states[player.state]}, 'player'); compare(shot, actor, 'projectile');
  }
});

test('actual final-stage enemy can be stomped without supplied weapons or a forced defeat', () => {
  const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
  const map = decodeMap(archive.get('stage6.map')), mask = decodeImage(archive.get('block6.app'));
  const defs = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const p = createPlayer(16220, 3032), world = createWorld(defs, map), camera = {x: p.x - 132, y: 0};
  for (let i = 0; i < 300; i++) followCamera(camera, p, map);
  for (let i = 0; i < 60; i++) {
    stepWorld(world, p, {right: i < 27, jump: i < 27}, camera, (x, y) => collisionAt(map, mask, x, y), i * 1000 / 30);
    followCamera(camera, p, map);
  }
  assert.equal(p.lives, 5); assert.equal(p.points, 2); assert.equal(p.hazard, false);
  assert.equal(world.actors.find(actor => actor.kind === 34 && actor.column === defs.find(d => d.kind === 34 && d.x === 16360).column).removed, true);
});

test('actual fire checkpoint stays inside the map and animates beside its original enemy placements', () => {
  const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
  const map = decodeMap(archive.get('stage6.map')), mask = decodeImage(archive.get('block6.app'));
  const defs = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const p = createPlayer(7680, 1820), world = createWorld(defs, map), camera = {x: p.x - 132, y: 0}, frames = new Set();
  for (let i = 0; i < 300; i++) followCamera(camera, p, map);
  for (let i = 0; i < 180; i++) {
    stepWorld(world, p, {}, camera, (x, y) => collisionAt(map, mask, x, y), i * 1000 / 30);
    followCamera(camera, p, map);
    assert.equal(p.hazard, false);
    for (const actor of world.actors) if (actor.kind === 95 && actor.active) frames.add(actor.spriteIndex);
  }
  assert.deepEqual([...frames].sort(), [0, 1, 2]); assert.equal(p.dead, false); assert.ok(p.y < map.height * 32);
});
