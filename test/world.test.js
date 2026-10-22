import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, playerSprite, playerAnimation } from '../web/game.js';
import { createWorld, stepWorld } from '../web/objects.js';
import { createEvent } from '../web/events.js';
import { createCompanion, activateDog } from '../web/companions.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-world.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage1.map')), mask = decodeImage(archive.get('block1.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
const states = { 0: 'idle', 1: 'walk', 2: 'air', 4: 'hurt', 5: 'land', 6: 'idleLook', 11: 'bored',
  20: 'scene20', 21: 'scene21', 22: 'scene22', 23: 'scene23', 24: 'scene24', 25: 'scene25' };
function comparePlayer(p, expected, tick) {
  for (const [key, value] of Object.entries(expected)) {
    const actual = key === 'sprite' ? playerSprite(p) : key === 'period' || key === 'count' ? playerAnimation(p)[key] : p[key];
    assert.equal(actual, key === 'state' ? states[value] : value, `tick ${tick} player ${key}`);
  }
}

test('220 coupled player, enemy and pickup ticks match the original scheduler and collision managers', () => {
  const p = createPlayer(6500, 3032), camera = { x: 6400, y: 2719 };
  const world = createWorld([{ kind: 0, x: 6608, y: 3032 }, { kind: 1, x: 6808, y: 3032 }, { kind: 10, x: 6540, y: 3032 }]);
  world.actors.forEach((actor, index) => { actor.active = true; actor.spawnOrder = index; });
  fixture.trace.forEach(({ input, player, actors }, tick) => {
    stepWorld(world, p, input, camera, sample, tick * 1000 / 30);
    comparePlayer(p, player, tick);
    actors.forEach((expected, index) => {
      for (const [key, value] of Object.entries(expected)) assert.equal(world.actors[index][key], value, `tick ${tick} actor ${index} ${key}`);
    });
  });
});

test('a complete dialogue and return to play match 1220 original scheduler ticks', () => {
  const p = createPlayer(4223, 2680), camera = { x: 4000, y: 2400 }, world = createWorld([]);
  p.state = 'walk';
  world.event = createEvent(65, p, camera, 0);
  world.npcs.push(...world.event.npcs);
  fixture.scene.forEach(({ elapsed, input, player, phase, removed }, tick) => {
    stepWorld(world, p, input, camera, sample, elapsed);
    comparePlayer(p, player, tick);
    if (world.event) assert.equal(world.event.phase, phase);
    assert.equal(world.event === null, removed);
  });
});

test('father and Shiro match 520 native scheduler ticks while player and enemies move', () => {
  for (const { slot, trace } of fixture.allies) {
    const p = createPlayer(6500, 3032), camera = { x: 6400, y: 2719 };
    const world = createWorld([0, 1, 2].map((kind) => ({ kind, x: 6608 + kind * 100, y: 3032 })));
    world.actors.forEach((actor, index) => { actor.active = true; actor.spawnOrder = index; });
    if (slot === 3) world.companion = createCompanion(3, 1, camera);
    else activateDog(world.dog);
    trace.forEach(({ input, player, ally, enemies }, tick) => {
      stepWorld(world, p, input, camera, sample, tick * 1000 / 30);
      comparePlayer(p, player, tick);
      if (slot === 3 && ally.removed) assert.equal(world.companion, null);
      else {
        const actual = slot === 3 ? world.companion : world.dog;
        for (const [key, value] of Object.entries(ally)) {
          if (key !== 'removed') assert.equal(actual[key], value, `slot ${slot} tick ${tick} ${key}`);
        }
      }
      enemies.forEach((expected, index) => {
        for (const [key, value] of Object.entries(expected)) assert.equal(world.actors[index][key], value, `slot ${slot} tick ${tick} enemy ${index} ${key}`);
      });
    });
  }
});
