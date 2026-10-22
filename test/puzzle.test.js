import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createMinigame, stepMinigame } from '../web/minigames.js';
import { PUZZLE_ASSETS, PUZZLE_PORTAL } from '../web/puzzle-data.js';
import { readArchive, decodeImage, decodePalette, decodeMap } from '../web/resources.js';
import { createPlayer, collisionAt, followCamera } from '../web/game.js';
import { createActor, actorSprite, createWorld, stepWorld, readStageObjects } from '../web/objects.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-puzzle.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const compare = (game, expected, label) => {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(game[key], value, `${label}/${key}`);
};

test('puzzle resources and final unlock slot match original data', () => {
  assert.deepEqual(PUZZLE_ASSETS, fixture.assets); assert.deepEqual(PUZZLE_PORTAL, fixture.portal);
  decodePalette(archive.get(PUZZLE_ASSETS.palette));
  for (const value of Object.values(PUZZLE_ASSETS).flat()) {
    if (typeof value === 'string' && value.endsWith('.app')) decodeImage(archive.get(value));
    if (typeof value === 'string' && value.endsWith('.WAV')) assert.ok(existsSync(new URL(`../Changoo (E)/RESOURCE/${value}`, import.meta.url)));
  }
});

test('puzzle native shuffle, solve, reentry, held keys, clock boundaries and drawing agree', () => {
  let previous;
  for (const {strategy, seed, initial, trace, unlocks} of fixture.traces) {
    const game = createMinigame('puzzle', seed, strategy === 'reentry' ? previous : undefined);
    compare(game, initial, `${strategy}/initial`); assert.equal(game.unlockIndex, unlocks.indexOf(1));
    for (const [tick, {now, input, expected, sounds, cd, draws}] of trace.entries()) {
      const effects = stepMinigame(game, input, now);
      compare(game, expected, `${strategy}/${tick}`);
      assert.deepEqual(effects.sounds, sounds, `${strategy}/${tick}/sounds`);
      assert.deepEqual(effects.cd, cd, `${strategy}/${tick}/CD`);
      if (draws) assert.deepEqual(game.render, draws, `${strategy}/${tick}/draws`);
    }
    assert.equal(game.outcome, ['solve', 'reentry'].includes(strategy) ? 'won' : null);
    previous = game;
  }
});

test('puzzle portal preserves native dimensions and accepts hurt/transformed players', () => {
  const states = {0: 'idle', 4: 'hurt', 10: 'chickenAir', 14: 'roachAir', 17: 'roachDash'};
  const actor = createActor(125, 6500, 1200);
  assert.equal(actorSprite(actor), PUZZLE_PORTAL.name);
  assert.deepEqual(Object.values(actor.body), PUZZLE_PORTAL.body);
  assert.equal(actor.width, PUZZLE_PORTAL.width); assert.equal(actor.height, PUZZLE_PORTAL.height);
  for (const {player} of fixture.contacts) {
    const p = Object.assign(createPlayer(6500, 1200), {state: states[player.state]});
    const world = createWorld([{kind: 125, x: 6500, y: 1200, column: 204, row: 40}]);
    Object.assign(world.actors[0], {active: true, born: false});
    stepWorld(world, p, {}, {x: 6200, y: 1000}, () => 0);
    assert.equal(world.minigame?.kind, 'puzzle'); assert.equal(world.actors[0].removed, true);
  }
});

test('actual last-stage puzzle portal enters, solves and returns with original inventory', () => {
  const map = decodeMap(archive.get('stage6.map')), mask = decodeImage(archive.get('block6.app'));
  const defs = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const portal = defs.find(d => d.kind === 125), sample = (x, y) => collisionAt(map, mask, x, y);
  const p = createPlayer(portal.x - 100, portal.y - 100), world = createWorld(defs, map);
  Object.assign(p, {points: 42, bananas: 3, balls: 4, companionItems: [1, 0, 1, 0, 0, 0]});
  const camera = {x: p.x - 132, y: 0};
  for (let i = 0; i < 300; i++) followCamera(camera, p, map);
  for (let i = 0; i < 120 && !world.minigame; i++) {
    stepWorld(world, p, {right: true}, camera, sample, i * 1000 / 30);
    followCamera(camera, p, map);
    assert.equal(p.hazard, false);
  }
  assert.equal(world.minigame?.kind, 'puzzle');
  const before = structuredClone(p), game = world.minigame;
  for (const {input, now} of fixture.traces[0].trace) stepWorld(world, p, {...input, jump: input.up}, camera, sample, now);
  assert.equal(game.finished, true); assert.equal(game.outcome, 'won'); for (const key of ['points','chocobi','cans','lives','balls','waterBombs','bananas','jungleItems','companionItems','selectedItem']) assert.deepEqual(p[key], before[key], key);
  assert.equal(world.randomSeed, game.randomSeed);
  for (let i = 0; i < 10; i++) stepWorld(world, p, {right: true}, camera, sample, 20000 + i * 1000 / 30);
  assert.equal(world.minigame, game); assert.ok(p.x > before.x); assert.equal(p.hazard, false);
});
