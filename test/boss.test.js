import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, enterNextStage, followCamera } from '../web/game.js';
import { createActor, stepActor, hitActor, hitWeapon, createProjectile, createWorld, stepWorld, readStageObjects } from '../web/objects.js';
import { bossSprite, damageBoss } from '../web/boss.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-boss.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage1.map')), mask = decodeImage(archive.get('block1.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
const states = { 0: 'idle', 2: 'air', 4: 'hurt', 10: 'chickenAir', 14: 'roachAir', 17: 'roachDash' };
function compareBoss(boss, expected, label) {
  for (const [key, value] of Object.entries(expected)) assert.equal(key === 'sprite' ? bossSprite(boss) : boss[key], value, `${label}: ${key}`);
}

test('the stage-one boss matches 520 native movement, charge and terrain ticks', () => {
  const boss = createActor(18, 25063, 2991), p = createPlayer(24900, 3096);
  compareBoss(boss, fixture.initial, 'constructor');
  assert.deepEqual(Object.values(boss.body), fixture.body);
  fixture.movement.forEach(({ playerX, expected }, tick) => {
    p.x = playerX;
    stepActor(boss, p, sample);
    compareBoss(boss, expected, tick);
    assert.ok(archive.has(bossSprite(boss)));
  });
});

test('72 native boss contacts preserve stomp, charge defense, dash and immunity rules', () => {
  for (const { boss: initial, player: before, expectedBoss, expectedPlayer, scenario } of fixture.contacts) {
    const boss = Object.assign(createActor(18, 25063, 2991), initial);
    const p = Object.assign(createPlayer(before.x, before.y), before, { state: states[before.state] });
    hitActor(p, boss);
    compareBoss(boss, expectedBoss, scenario);
    for (const [key, value] of Object.entries(expectedPlayer)) assert.equal(p[key], key === 'state' ? states[value] : value, `${scenario}: ${key}`);
  }
});

test('native projectiles also damage a boss during its hurt animation', () => {
  for (const { type, initial, expected, points, shotRemoved } of fixture.weaponContacts) {
    const boss = Object.assign(createActor(18, 25063, 2991), initial), p = createPlayer(24900, 3096);
    const shot = createProjectile({ type, x: 25063, y: 2991, vx: 10, vy: -10 });
    hitWeapon(p, boss, shot);
    compareBoss(boss, expected, 'projectile');
    assert.equal(p.points, points);
    assert.equal(shot.removed, shotRemoved);
  }
});

test('the final hit waits for the native hurt tick before requesting a stage transition', () => {
  const boss = createActor(18, 25063, 2991), p = createPlayer(24900, 3096);
  boss.health = 1;
  damageBoss(boss);
  fixture.death.forEach(({ boss: expected, stage }, tick) => {
    stepActor(boss, p, () => 0);
    compareBoss(boss, expected, `death ${tick}`);
    assert.equal(boss.levelComplete, stage === 1);
  });
});

test('native map transition adds three lives and preserves inventory while moving to the new origin', () => {
  const p = createPlayer(24900, 3096);
  p.balls = 4;
  p.companionItems[2] = 1;
  enterNextStage(p);
  for (const [key, value] of Object.entries(fixture.death.at(-1).player)) assert.equal(p[key], key === 'state' ? 'idle' : value, key);
  assert.equal(p.balls, 4);
  assert.equal(p.companionItems[2], 1);
  assert.equal(p.moveEnabled, false);
});

test('the original map activator enables horizontal movement on its twentieth update', () => {
  const p = createPlayer(0, 3032), world = createWorld([{ kind: 90, column: 0, row: 98, x: 6, y: 3157 }]);
  p.moveEnabled = false;
  const camera = { x: 0, y: 2719 };
  stepWorld(world, p, { right: true }, camera, sample);
  fixture.activation.forEach(({ enabled, removed }, tick) => {
    stepWorld(world, p, { right: true }, camera, sample);
    assert.equal(p.moveEnabled, enabled, `tick ${tick}`);
    assert.equal(world.activators[0].removed, removed);
    assert.equal(p.x, enabled ? 7 : 0);
  });
});

test('the real boss arena can be cleared with its springs and standard five lives', () => {
  const definitions = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const world = createWorld(definitions), p = createPlayer(24680, 3096), camera = { x: 24548, y: 2719 };
  let tick = 0;
  while (tick < 1800 && !world.stageComplete && !p.dead && !p.hazard) {
    const dx = 24743 - p.x;
    stepWorld(world, p, { right: dx > 20, left: dx < -20, jump: ['idle', 'walk'].includes(p.state) && !p.jumpHeld }, camera, sample, tick++ * 1000 / 30);
    followCamera(camera, p, map);
  }
  assert.equal(world.stageComplete, true, 'a normal spring/stomp route must defeat all ten HP');
  assert.equal(world.actors.find((a) => a.kind === 18).health, 0);
  assert.ok(p.lives > 0);
  assert.equal(p.balls + p.waterBombs + p.companionItems.reduce((a, b) => a + b, 0), 0);
  const lives = p.lives;
  enterNextStage(p);
  assert.equal(p.lives, lives + 3);
  assert.equal(p.x, 0);
  assert.equal(p.y, 0);
});
