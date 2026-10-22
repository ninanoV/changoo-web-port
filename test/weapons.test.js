import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, stepPlayer, collisionAt, overlaps } from '../web/game.js';
import { createActor, hitActor, stepActor, createProjectile, stepProjectile, hitWeapon, createSplash, stepSplash, createWorld, stepWorld, readStageObjects } from '../web/objects.js';
import { createInventory, stepInventory } from '../web/inventory.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-weapons.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage1.map')), mask = decodeImage(archive.get('block1.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
const states = { 0: 'idle', 1: 'walk', 2: 'air', 4: 'hurt', 5: 'land', 6: 'idleLook', 7: 'chickenIdle', 8: 'chickenLand',
  9: 'chickenWalk', 10: 'chickenAir', 11: 'bored', 12: 'roachIdle', 13: 'roachWalk', 14: 'roachAir', 15: 'roachLand',
  16: 'roachBlink', 17: 'roachDash', 94: 'roachRecover' };
function compare(actual, expected, label, player = false) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], player && key === 'state' ? states[value] : value, `${label}: ${key}`);
}

test('both native ammo pickups award one round, bonus life and the original popup once', () => {
  for (const { kind, expected, trace } of fixture.pickups) {
    const p = createPlayer(6500, 3032), actor = createActor(kind, 6500, 3032);
    p.points = 99;
    hitActor(p, actor);
    hitActor(p, actor);
    compare(p, expected, `pickup ${kind}`, true);
    for (const frame of trace) { stepActor(actor, p, sample); compare(actor, frame, `popup ${kind}`); }
  }
});

test('68 native firing sequences match input latch, form restrictions, ammo and spawn position', () => {
  for (const { state, selected, facing, trace } of fixture.firing) {
    const p = Object.assign(createPlayer(6500, 3032), { state: states[state], selectedItem: selected, facing, balls: 2, waterBombs: 2 });
    trace.forEach(({ input, expected, shots }, tick) => {
      const emitted = [];
      stepPlayer(p, input, sample, emitted);
      compare(p, expected, `${state}/${selected}/${facing} tick ${tick}`, true);
      assert.deepEqual(emitted, shots);
    });
  }
});

test('ball bounces and water-bomb splash positions match four native trajectories', () => {
  for (const { type, vx, trace } of fixture.projectiles) {
    const shot = createProjectile({ type, x: 6500, y: 3032, vx, vy: -10 });
    trace.forEach(({ expected, splashes }, tick) => {
      stepProjectile(shot, sample);
      compare(shot, expected, `${type}/${vx} tick ${tick}`);
      assert.deepEqual(shot.exploded ? [shot.splash] : [], splashes);
    });
  }
});

test('native weapon hits kill all three supported enemies and award the 100-point bonus', () => {
  for (const { type, enemyKind, player, enemy, shot: expectedShot, splashes } of fixture.contacts) {
    const p = createPlayer(6500, 3032), actor = createActor(enemyKind, 6608, 3032);
    p.points = 99;
    const shot = createProjectile({ type, x: 6608, y: 3062, vx: 10, vy: -10 });
    hitWeapon(p, actor, shot);
    compare(p, player, 'hit player', true);
    compare(actor, enemy, 'hit enemy');
    compare(shot, expectedShot, 'hit shot');
    assert.deepEqual(shot.exploded ? [shot.splash] : [], splashes);
  }
});

test('splash lifetime and repeated contacts match the original collision dispatcher', () => {
  for (const { enemyKind, trace } of fixture.splashes) {
    const p = createPlayer(6500, 3032), actor = createActor(enemyKind, 6608, 3032), splash = createSplash(6608, 3062);
    for (const expected of trace) {
      stepActor(actor, p, sample);
      stepSplash(splash);
      if (!splash.removed && overlaps(actor, splash)) hitWeapon(p, actor, splash);
      compare(actor, expected.enemy, 'splash enemy');
      assert.equal(p.points, expected.points);
      assert.equal(splash.ticks, expected.ticks);
      assert.equal(splash.removed, expected.removed);
    }
  }
});

test('inventory input matches native clamped navigation and Enter-release selection', () => {
  for (const { initial, trace } of fixture.menus) {
    const p = createPlayer(0, 3032);
    p.selectedItem = initial;
    const menu = createInventory(initial);
    for (const { input, selected, ...expected } of trace) {
      stepInventory(menu, input, p);
      compare(menu, expected, 'inventory');
      assert.equal(p.selectedItem, selected);
    }
  }
});

test('opening the inventory freezes the world and selection consumes no ammo', () => {
  const p = createPlayer(100, 3032), world = createWorld([]), view = { x: 0, y: 2719 };
  p.balls = 2;
  stepWorld(world, p, { enter: true }, view, sample);
  stepWorld(world, p, {}, view, sample);
  assert.ok(world.inventory && !world.inventory.removed);
  const position = [p.x, p.y];
  for (let i = 0; i < 20; i++) stepWorld(world, p, { right: true, fire: true }, view, sample);
  assert.deepEqual([p.x, p.y], position);
  assert.equal(p.balls, 2);
  assert.equal(world.projectiles.length, 0);
  stepWorld(world, p, { enter: true }, view, sample);
  stepWorld(world, p, {}, view, sample);
  assert.equal(world.inventory.removed, true);
  stepWorld(world, p, { fire: true }, view, sample);
  assert.equal(p.balls, 1);
  assert.equal(world.projectiles[0].type, 65);
});

test('a real stage-two pickup can be selected, thrown and turned into a splash', () => {
  const stage = decodeMap(archive.get('stage2.map')), terrain = decodeImage(archive.get('block2.app'));
  const sample2 = (x, y) => collisionAt(stage, terrain, x, y);
  const definitions = readStageObjects(stage, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const world = createWorld(definitions), p = createPlayer(4540, 800), view = { x: 4408, y: 524 };
  for (let i = 0; i < 25; i++) stepWorld(world, p, { right: true }, view, sample2);
  assert.equal(p.waterBombs, 1);
  assert.equal(world.actors.find((a) => a.kind === 44 && a.x === 4600 && a.y === 888).collected, true);
  for (let i = 0; i < 80; i++) stepWorld(world, p, {}, { x: 4500, y: 1200 }, sample2);
  assert.equal(p.y, 1464);
  for (const input of [{ enter: true }, {}, { down: true }, {}, { enter: true }, {}, { fire: true }]) {
    stepWorld(world, p, input, { x: 4500, y: 1200 }, sample2);
  }
  assert.equal(p.selectedItem, 1);
  assert.equal(p.waterBombs, 0);
  assert.equal(world.projectiles.find((shot) => shot.type === 66)?.vy, -10);
  let splashed = false;
  for (let i = 0; i < 40; i++) { stepWorld(world, p, {}, { x: 4500, y: 1200 }, sample2); splashed ||= world.splashes.length > 0; }
  assert.equal(splashed, true);
  assert.equal(p.lives, 5);
});
