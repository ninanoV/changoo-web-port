import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer, collisionAt, followCamera } from '../web/game.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createActor, hitActor, stepActor, defeatEnemy, hitCompanion, createWorld, stepWorld, readStageObjects } from '../web/objects.js';
import { createCompanion, stepCompanion, companionSprite, createDog, activateDog, stepDog, dogSprite, createRabbit, stepRabbit } from '../web/companions.js';
import { createInventory, stepInventory } from '../web/inventory.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-companions.json', import.meta.url)));
const camera = { x: 6400, y: 2719 };
const enemies = () => [0, 1, 2].map((kind) => createActor(kind, 6608 + kind * 100, 3032));
function compare(actual, expected, label) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, `${label}: ${key}`);
}

test('six companion pickups add inventory without points and reproduce the native popup', () => {
  for (const { kind, counts, points, trace, sounds } of fixture.pickups) {
    const p = createPlayer(6500, 3032), pickup = createActor(kind, 6500, 3032);
    assert.deepEqual(hitActor(p, pickup), sounds);
    hitActor(p, pickup);
    assert.deepEqual(p.companionItems, counts);
    assert.equal(p.points, points);
    for (const row of trace) { stepActor(pickup, p, () => 0); compare(pickup, row, `pickup ${kind}`); }
  }
});

test('eight native companion scenarios match every state, frame, position and effect', () => {
  for (const { slot, cost, initial, withEnemies, images, trace, body } of fixture.traces) {
    const p = createPlayer(6500, 3032), targets = withEnemies ? enemies() : [];
    const ally = createCompanion(slot, cost, camera);
    assert.deepEqual(Object.values(ally.body), body);
    assert.deepEqual(ally.startSounds, initial.sounds);
    trace.forEach((expected, tick) => {
      const effects = stepCompanion(ally, p, camera, targets);
      if (effects.clear) for (const enemy of targets) defeatEnemy(p, enemy, false);
      const { frameTable, busy, sounds, spriteIndex, enemies: originalEnemies, points, rabbits, ...state } = expected;
      compare(ally, state, `slot ${slot}/${cost}/${withEnemies} tick ${tick}`);
      assert.equal(companionSprite(ally), images[spriteIndex]);
      assert.deepEqual(effects.sounds, sounds.filter((name) => name !== 'existing-effect'));
      assert.deepEqual(effects.rabbit ? [effects.rabbit] : [], rabbits);
      targets.forEach((enemy, index) => compare(enemy, originalEnemies[index], 'enemy'));
      assert.equal(p.points, points);
    });
    assert.equal(ally.removed, true);
  }
});

test('native contact gates prevent duplicate rewards and respect each companion attack state', () => {
  for (const { slot, cost, state, enemyKind, first, second } of fixture.contacts) {
    const p = createPlayer(6500, 3032), ally = createCompanion(slot, cost, camera), enemy = enemies()[enemyKind];
    ally.state = state;
    for (const expected of [first, second]) {
      hitCompanion(p, enemy, ally);
      compare(enemy, expected.enemy, 'companion hit');
      assert.equal(p.points, expected.points);
    }
  }
  for (const { state, enemyKind, first, second } of fixture.dogContacts) {
    const p = createPlayer(6500, 3032), dog = createDog(), enemy = enemies()[enemyKind];
    dog.state = state;
    for (const expected of [first, second]) {
      hitCompanion(p, enemy, dog);
      compare(enemy, expected.enemy, 'dog hit');
      assert.equal(p.points, expected.points);
    }
  }
});

test('Shiro matches 240 native HUD, targeting, attack and recovery ticks', () => {
  const p = createPlayer(6500, 3032), dog = createDog(), targets = enemies();
  activateDog(dog);
  fixture.dog.trace.forEach(({ spriteIndex, busy, ...expected }, tick) => {
    stepDog(dog, p, camera, targets);
    compare(dog, expected, `dog ${tick}`);
    assert.equal(dog.state !== 0, busy);
    assert.equal(dogSprite(dog), fixture.dog.images[spriteIndex]);
  });
});

test('Yuri mother rabbit visual matches its native lifetime and ballistic motion', () => {
  const rabbit = createRabbit({ x: 6500, y: 2831, vx: 5, vy: -15 });
  for (const expected of fixture.rabbit) {
    stepRabbit(rabbit, camera);
    compare(rabbit, expected, 'rabbit');
  }
});

test('36 original inventory cases preserve quantity, variant cost and busy exclusion', () => {
  for (const { slot, count, busy, remaining, selected, busyAfter } of fixture.consumption) {
    const p = createPlayer(0, 0), menu = createInventory(slot);
    p.companionItems[slot - 2] = count;
    assert.equal(stepInventory(menu, { enter: true }, p, busy), undefined);
    const summoned = stepInventory(menu, {}, p, busy);
    assert.equal(p.selectedItem, selected);
    assert.equal(p.companionItems[slot - 2], remaining);
    assert.equal(busy || Boolean(summoned), busyAfter);
    if (count !== remaining) assert.deepEqual(summoned, { slot, cost: count - remaining });
    else assert.equal(summoned, undefined);
  }
});

test('the actual stage-one spring route collects and summons the mother item without granting inventory', () => {
  const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
  const map = decodeMap(archive.get('stage1.map')), mask = decodeImage(archive.get('block1.app'));
  const sample = (x, y) => collisionAt(map, mask, x, y);
  const objects = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const world = createWorld(objects), p = createPlayer(6288, 3032), view = { x: 6156, y: 2719 };
  let time = 0;
  function run(ticks, input) {
    for (let i = 0; i < ticks; i++) { stepWorld(world, p, input, view, sample, time += 1000 / 30); followCamera(view, p, map); }
  }
  run(15, { right: true });
  run(27, { right: true, jump: true });
  run(40, { right: true });
  for (let i = 0; i < 5; i++) { run(35, { right: true, jump: true }); run(10, { right: true }); }
  run(12, { left: true });
  run(10, {});
  run(50, { jump: true });
  run(25, { left: true });
  run(40, {});
  assert.equal(world.actors.find((a) => a.kind === 24 && a.x === 7725).collected, true);
  assert.deepEqual(p.companionItems, [1, 0, 0, 0, 0, 0]);
  for (const input of [{ enter: true }, {}, { down: true }, {}, { down: true }, {}, { enter: true }, {}]) run(1, input);
  assert.equal(world.companion.slot, 2);
  assert.equal(world.companion.cost, 1);
  assert.equal(p.companionItems[0], 0);
  run(10, {});
  run(1, { enter: true }); run(1, {});
  const before = { ...world.companion };
  run(30, {});
  assert.deepEqual(world.companion, before, 'inventory also pauses an active companion');
  run(1, { enter: true }); run(1, {});
  run(180, {});
  assert.equal(world.companion, null);
  assert.equal(p.lives, 5);
  assert.equal(world.dog.state, 0);
});
