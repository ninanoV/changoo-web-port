import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer } from '../web/game.js';
import { createActor, actorSprite, stepActor, hitActor, resolveProjectileTerrain, createWorld, stepWorld } from '../web/objects.js';
import { ROCK } from '../web/rock-data.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-rock.json', import.meta.url)));
const states = {0: 'idle', 2: 'air', 4: 'hurt', 10: 'chickenAir', 14: 'roachAir', 17: 'roachDash'};
const compare = (actual, expected, label) => {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, `${label}: ${key}`);
};
const floor = (x, y) => x >= 0 && x < 2560 && y >= 320 && y < 352 ? 1 : 0;

test('rock factory preserves original dimensions, velocity and looping sound', () => {
  assert.deepEqual(ROCK, fixture.metadata);
  const a = createActor(121, 272, 224);
  compare(a, fixture.factory.expected, 'factory');
  assert.equal(actorSprite(a), 'dol.app');
  assert.deepEqual(Object.values(a.body), ROCK.body);
  const p = createPlayer(0, 0), world = createWorld([{kind: 121, x: 272, y: 224, column: 10, row: 10}]);
  assert.deepEqual(stepWorld(world, p, {}, {x: 0, y: 0}, () => 0), fixture.factory.sounds);
  assert.deepEqual(stepWorld(world, p, {}, {x: 5000, y: 0}, () => 0), []);
  assert.equal(world.actors[0].active, true);
  assert.equal(world.actors[0].removed, false);
  assert.equal(world.actors[0].x, 272);
});

test('rock follows 900 native movement ticks, repeated bounces and offscreen freeze/resume', () => {
  for (const {scenario, initial, trace} of fixture.movement) {
    const a = Object.assign(createActor(121, initial.x, initial.y), initial);
    for (const [tick, {camera, expected}] of trace.entries()) {
      stepActor(a, createPlayer(0, 0), floor, true, camera);
      resolveProjectileTerrain(a, floor);
      compare(a, expected, `${scenario} tick ${tick}`);
    }
  }
});

test('rock terrain callbacks match all five native terrain types', () => {
  for (const {pixel, initial, expected} of fixture.terrain) {
    const a = Object.assign(createActor(121, initial.x, initial.y), initial);
    resolveProjectileTerrain(a, (x, y) => x >= 320 && x < 352 && y >= 320 && y < 352 ? pixel : 0);
    compare(a, expected, `terrain ${pixel}`);
  }
});

test('rock hurts normal and transformed players without disappearing or awarding points', () => {
  for (const {initial, vx, player, actor, sounds} of fixture.contacts) {
    const p = Object.assign(createPlayer(initial.x, initial.y), initial, {state: states[initial.state]});
    const a = Object.assign(createActor(121, 650, 150), {vx});
    assert.deepEqual(hitActor(p, a), sounds.map(name => name === 'existing-effect' ? 'DEM-SHIN.WAV' : name));
    compare(p, {...player, state: states[player.state]}, 'contact player');
    compare(a, actor, 'contact rock');
    assert.deepEqual(hitActor(p, a), []);
  }
});

test('world resolves rock terrain and persistent body contacts in the actor path', () => {
  const world = createWorld([{kind: 121, x: 650, y: 205, column: 22, row: 10}]);
  const a = world.actors[0];
  Object.assign(a, {active: true, born: false, vx: 0, vy: 10});
  const p = createPlayer(660, 238);
  const sounds = stepWorld(world, p, {}, {x: 400, y: 100}, floor);
  assert.deepEqual(sounds, ['DEM-SHIN.WAV']);
  assert.equal(a.bounces, 1);
  assert.equal(a.removed, false);
  assert.equal(p.state, 'hurt');
});
