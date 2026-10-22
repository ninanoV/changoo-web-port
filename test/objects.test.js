import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeImage, decodeMap } from '../web/resources.js';
import { collisionAt, createPlayer, stepPlayer } from '../web/game.js';
import { createActor, stepActor, hitActor, turnActor, createProjectile, stepProjectile, overlaps, createWorld, stepWorld, hitProjectile } from '../web/objects.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-objects.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage1.map'));
const mask = decodeImage(archive.get('block1.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
const states = ['idle', 'walk', 'air', '', 'hurt', 'land'];

function compare(actual, expected, label, player = false) {
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(actual[key], player && key === 'state' ? states[value] : value, `${label}: ${key}`);
  }
}

test('all 780 enemy ticks and emitted projectiles match original x86 updates', () => {
  const player = createPlayer(6500, 3032);
  for (const { kind, initial, trace } of fixture.enemies) {
    const actor = createActor(kind, 6608, 3032);
    compare(actor, initial, `kind ${kind} constructor`);
    trace.forEach(({ expected, shots }, tick) => {
      assert.deepEqual(stepActor(actor, player, sample), shots, `kind ${kind} tick ${tick} shots`);
      compare(actor, expected, `kind ${kind} tick ${tick}`);
    });
  }
});

test('pickup, 100-point bonus, stomp, side contact and immunity match the original callbacks', () => {
  for (const { kind, initial, expected, objectState, scenario } of fixture.contacts) {
    const player = Object.assign(createPlayer(initial.x, initial.y), initial, { state: states[initial.state] });
    const actor = createActor(kind, 6608, 3032);
    hitActor(player, actor);
    compare(player, expected, `${kind} ${scenario}`, true);
    assert.equal(kind >= 10 ? Number(actor.collected) : actor.state, objectState);
    hitActor(player, actor);
    compare(player, expected, `${kind} duplicate ${scenario}`, true);
  }
});

test('hurt animation, delayed life loss and invulnerability match 30 original ticks', () => {
  const player = createPlayer(6608, 3032);
  hitActor(player, createActor(0, 6608, 3032));
  fixture.damage.forEach((expected, tick) => {
    stepPlayer(player, {}, sample);
    compare(player, expected, `hurt tick ${tick}`, true);
  });
});

test('map direction markers set the same enemy states as original callbacks', () => {
  for (const { kind, direction, expected } of fixture.markers) {
    const actor = createActor(kind, 6608, 3032);
    turnActor(actor, direction);
    compare(actor, expected, `kind ${kind} direction ${direction}`);
  }
});

test('bouncing balls and straight shots match original movement and terrain collisions', () => {
  for (const { kind, trace } of fixture.projectiles) {
    const shot = createProjectile({ type: kind, x: 6608, y: 3062, vx: -4, vy: kind === 91 ? -16 : 0 });
    trace.forEach((expected, tick) => {
      stepProjectile(shot, sample);
      compare(shot, expected, `projectile ${kind} tick ${tick}`);
    });
  }
});

test('touching rectangle edges is not an overlap; one pixel of overlap is', () => {
  const rect = { left: 0, top: 0, right: 10, bottom: 10 };
  assert.equal(overlaps({ x: 0, y: 0, body: rect }, { x: 10, y: 0, body: rect }), false);
  assert.equal(overlaps({ x: 0, y: 0, body: rect }, { x: 9, y: 9, body: rect }), true);
});

test('defeated enemies and pickup animations match original ticks until removal', () => {
  for (const { kind, trace } of [...fixture.defeats, ...fixture.pickups]) {
    const p = Object.assign(createPlayer(6608, 2980), { state: 'air', vy: 5 });
    const actor = createActor(kind, 6608, 3032);
    hitActor(p, actor);
    trace.forEach((expected, tick) => {
      stepActor(actor, p, sample);
      compare(actor, expected, `removal kind ${kind} tick ${tick}`);
    });
  }
});

test('actors activate at their map cells; pickups cannot be farmed by leaving and returning', () => {
  const definitions = [{ kind: 45, x: 120, y: 360, column: 4, row: 12 }, { kind: 1, x: 3200, y: 328, column: 100, row: 12 }];
  const world = createWorld(definitions);
  const p = createPlayer(100, 328), camera = { x: 0, y: 0 };
  const floor = (x, y) => y >= 400 ? 1 : 0;
  stepWorld(world, p, {}, camera, floor);
  assert.equal(p.cans, 0, 'new objects wait one tick');
  stepWorld(world, p, {}, camera, floor);
  assert.equal(p.cans, 1);
  assert.equal(world.actors[1].active, false);
  for (let i = 0; i < 100; i++) stepWorld(world, p, {}, camera, floor);
  assert.equal(p.cans, 1);
  camera.x = 3000;
  p.x = 4000;
  stepWorld(world, p, {}, camera, floor);
  assert.equal(world.actors[1].active, true);
  camera.x = 0;
  p.x = 100;
  stepWorld(world, p, {}, camera, floor);
  assert.equal(p.cans, 1);
  assert.equal(createWorld(definitions).actors[0].collected, false, 'reset restores the original map');
});

test('projectile contact respects damage grace and the final life ends the run', () => {
  const p = createPlayer(100, 328);
  p.invulnerable = 1;
  const shot = createProjectile({ type: 95, x: 100, y: 340, vx: -4, vy: 0 });
  assert.deepEqual(hitProjectile(p, shot), []);
  assert.equal(shot.removed, false);
  p.invulnerable = 0;
  p.lives = 1;
  assert.deepEqual(hitProjectile(p, shot), ['DEM-SHIN.WAV']);
  assert.equal(p.vx, -16);
  assert.equal(shot.removed, true);
  for (let i = 0; i < 11; i++) stepPlayer(p, {}, (x, y) => y >= 400 ? 1 : 0);
  assert.equal(p.lives, 0);
  assert.equal(p.dead, true);
});
