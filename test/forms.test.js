import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, stepPlayer, collisionAt, playerSprite, followCamera } from '../web/game.js';
import { createActor, hitActor, createWorld, stepWorld, readStageObjects } from '../web/objects.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-forms.json', import.meta.url)));
const names = { 0: 'idle', 1: 'walk', 2: 'air', 4: 'hurt', 5: 'land', 6: 'idleLook', 7: 'chickenIdle',
  8: 'chickenLand', 9: 'chickenWalk', 10: 'chickenAir', 11: 'bored', 12: 'roachIdle', 13: 'roachWalk',
  14: 'roachAir', 15: 'roachLand', 16: 'roachBlink', 17: 'roachDash', 94: 'roachRecover' };
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage1.map')), mask = decodeImage(archive.get('block1.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
function compare(p, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(key === 'sprite' ? playerSprite(p) : p[key], key === 'state' ? names[value] : value, `${label}: ${key}`);
  }
}

test('transformation pickups switch to the original state and consume the pickup without points', () => {
  for (const { kind, expected, removed } of fixture.pickups) {
    const p = createPlayer(100, 3032), actor = createActor(kind, 100, 3032);
    hitActor(p, actor);
    compare(p, expected, `pickup ${kind}`);
    assert.equal(actor.removed, removed);
  }
});

test('normal idle, chicken flight and roach dash/landing match every original tick and sprite', () => {
  for (const { name, initial, trace } of fixture.traces) {
    const p = Object.assign(createPlayer(initial.x, initial.y), initial, { state: names[initial.state] });
    trace.forEach(({ input, expected }, tick) => {
      stepPlayer(p, input, sample);
      compare(p, expected, `${name} ${tick}`);
    });
  }
});

test('36 transformed contacts preserve stomp, dash kills, recovery vulnerability and loss of form', () => {
  for (const { kind, initial, expected, enemyState, scenario } of fixture.contacts) {
    const p = Object.assign(createPlayer(initial.x, initial.y), initial, { state: names[initial.state] });
    const enemy = createActor(kind, 6608, 3032);
    hitActor(p, enemy);
    compare(p, expected, `${initial.state} ${kind} ${scenario}`);
    assert.equal(enemy.state, enemyState);
  }
});

test('the real spring and moving platform route collects the first roach item', () => {
  const objects = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const world = createWorld(objects), p = createPlayer(6288, 3032), camera = { x: 6156, y: 2719 };
  function run(ticks, input) {
    for (let i = 0; i < ticks; i++) { stepWorld(world, p, input, camera, sample); followCamera(camera, p, map); }
  }
  run(15, { right: true });
  run(27, { right: true, jump: true });
  run(40, { right: true });
  run(50, {});
  run(30, { left: true });
  run(27, { left: true, jump: true });
  assert.equal(world.actors.find((a) => a.kind === 12 && a.column === 200).removed, true);
  assert.equal(p.state, 'roachAir');
  assert.equal(p.lives, 5);
  assert.equal(p.points, 1, 'only the defeated enemy gives a point');
  run(45, {});
  run(2, { fire: true });
  assert.equal(p.state, 'roachDash');
  assert.equal(Math.abs(p.vx), 15);
});
