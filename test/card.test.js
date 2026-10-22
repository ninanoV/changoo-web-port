import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createMinigame, stepMinigame } from '../web/minigames.js';
import { CARD_ASSETS, CARD_PORTAL } from '../web/card-data.js';
import { readArchive, decodeImage, decodePalette, decodeMap } from '../web/resources.js';
import { createPlayer, stepPlayer, collisionAt, followCamera } from '../web/game.js';
import { readStageObjects, createActor, actorSprite, createWorld, stepWorld } from '../web/objects.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-card.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const compare = (game, expected, label) => {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(game[key], value, `${label}: ${key}`);
};

test('card resources and unlock slot match original loaders', () => {
  assert.deepEqual(CARD_ASSETS, fixture.assets);
  assert.deepEqual(CARD_PORTAL, fixture.portal);
  decodePalette(archive.get(CARD_ASSETS.palette));
  for (const value of Object.values(CARD_ASSETS).flat()) {
    if (typeof value === 'string' && value.endsWith('.app')) decodeImage(archive.get(value));
    if (typeof value === 'string' && value.endsWith('.WAV')) assert.ok(existsSync(new URL(`../Changoo (E)/RESOURCE/${value}`, import.meta.url)));
  }
});

test('card native wins, loss, reentry, held keys, shuffle, timers, audio and drawing match', () => {
  let previous;
  for (const {strategy, seed, initial, trace, unlocks} of fixture.traces) {
    const game = createMinigame('card', seed, strategy === 'reentry' ? previous : undefined);
    compare(game, initial, `${strategy} initial`);
    assert.equal(game.unlockIndex, unlocks.indexOf(1));
    for (const [tick, {now, input, expected, sounds, cd, draws}] of trace.entries()) {
      const effects = stepMinigame(game, input, now);
      compare(game, expected, `${strategy} tick ${tick}`);
      assert.deepEqual(effects.sounds, sounds, `${strategy} tick ${tick}: audio`);
      assert.deepEqual(effects.cd, cd, `${strategy} tick ${tick}: music`);
      if (draws) assert.deepEqual(game.render, draws, `${strategy} tick ${tick}: render`);
    }
    assert.equal(game.outcome, strategy === 'controls' ? null : strategy === 'lose' ? 'lost' : 'won');
    previous = game;
  }
});

test('card portal retains native geometry and accepts even hurt or transformed players', () => {
  const states = {0: 'idle', 4: 'hurt', 10: 'chickenAir', 14: 'roachAir', 17: 'roachDash'};
  const actor = createActor(126, 6500, 1200);
  assert.equal(actorSprite(actor), CARD_PORTAL.name);
  assert.deepEqual(Object.values(actor.body), CARD_PORTAL.body);
  assert.equal(actor.width, CARD_PORTAL.width); assert.equal(actor.height, CARD_PORTAL.height);
  for (const {player} of fixture.contacts) {
    const p = Object.assign(createPlayer(6500, 1200), {state: states[player.state]});
    const world = createWorld([{kind: 126, x: 6500, y: 1200, column: 204, row: 40}]);
    Object.assign(world.actors[0], {active: true, born: false});
    stepWorld(world, p, {}, {x: 6200, y: 1000}, () => 0);
    assert.equal(world.minigame?.kind, 'card');
    assert.equal(world.actors[0].removed, true);
  }
});

test('actual stage5 card portal enters, wins, retains inventory and returns without retrigger', () => {
  const map = decodeMap(archive.get('stage5.map')), mask = decodeImage(archive.get('block5.app'));
  const definitions = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const portal = definitions.find(d => d.kind === 126), sample = (x, y) => collisionAt(map, mask, x, y);
  const p = createPlayer(portal.x - 100, portal.y), world = createWorld(definitions, map);
  Object.assign(p, {points: 42, bananas: 3, waterBombs: 2, companionItems: [1, 0, 1, 0, 0, 0]});
  for (let i = 0; i < 500; i++) stepPlayer(p, {}, sample);
  const camera = {x: p.x - 132, y: 0};
  for (let i = 0; i < 300; i++) followCamera(camera, p, map);
  for (let i = 0; i < 100 && !world.minigame; i++) {
    stepWorld(world, p, {right: true}, camera, sample, i * 1000 / 30);
    followCamera(camera, p, map);
  }
  assert.equal(world.minigame?.kind, 'card');
  const before = structuredClone(p), game = world.minigame;
  for (const {input, now} of fixture.traces[0].trace) stepWorld(world, p, {...input, jump: input.up}, camera, sample, now);
  assert.equal(game.finished, true); assert.equal(game.outcome, 'won');
  for (const key of ['points','chocobi','cans','lives','balls','waterBombs','bananas','jungleItems','companionItems','selectedItem']) assert.deepEqual(p[key], before[key], key);
  assert.equal(world.randomSeed, game.randomSeed);
  for (let i = 0; i < 10; i++) stepWorld(world, p, {right: true}, camera, sample, 20000 + i * 1000 / 30);
  assert.equal(world.minigame, game); assert.ok(p.x > before.x);
});
