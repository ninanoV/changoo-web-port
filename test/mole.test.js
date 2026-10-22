import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createMinigame, stepMinigame } from '../web/minigames.js';
import { MOLE_ASSETS, MOLE_PORTAL } from '../web/mole-data.js';
import { readArchive, decodeMap, decodeImage, decodePalette } from '../web/resources.js';
import { createPlayer, stepPlayer, collisionAt, followCamera } from '../web/game.js';
import { readStageObjects, createWorld, stepWorld, actorSprite } from '../web/objects.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-mole.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));

test('mole assets, original random seed and F6 exit are grounded in the executable', () => {
  assert.deepEqual(MOLE_ASSETS, fixture.assets);
  assert.deepEqual(MOLE_PORTAL, fixture.portal);
  assert.equal(fixture.initialSeed, 1);
  assert.equal(fixture.exitKey, 'F6');
  decodePalette(archive.get(MOLE_ASSETS.palette));
  for (const value of Object.values(MOLE_ASSETS).flat()) {
    if (typeof value === 'string' && value.endsWith('.app')) decodeImage(archive.get(value));
  }
  assert.ok(existsSync(new URL(`../Changoo (E)/RESOURCE/${MOLE_ASSETS.hitSound}`, import.meta.url)));
});

for (const { strategy, initial, trace, unlocks } of fixture.traces) {
  test(`mole/${strategy}: native state, RNG, impact sound, layered drawing and return agree`, () => {
    const game = createMinigame('mole', initial.randomSeed);
    for (const [key, value] of Object.entries(initial)) assert.deepEqual(game[key], value, `initial ${key}`);
    assert.equal(game.unlockIndex, unlocks.indexOf(1));
    trace.forEach(({ now, input, expected, sounds, cd, draws }, tick) => {
      const effects = stepMinigame(game, input, now);
      for (const [key, value] of Object.entries(expected)) assert.deepEqual(game[key], value, `${strategy} tick ${tick}: ${key}`);
      assert.deepEqual(effects.sounds, sounds, `${strategy} tick ${tick}: sounds`);
      assert.deepEqual(effects.cd, cd, `${strategy} tick ${tick}: CD`);
      if (draws) assert.deepEqual(game.render, draws, `${strategy} tick ${tick}: drawing`);
    });
    assert.equal(game.outcome, strategy === 'cancel' ? 'cancelled' : 'completed');
    if (strategy === 'hit') assert.equal(game.score, 101);
    if (strategy !== 'cancel') assert.equal(trace.length, 60 * 20);
  });
}

test('mole actual stage2 portal: enter, retain inventory, finish and walk away without retrigger', () => {
  const map = decodeMap(archive.get('stage2.map')), mask = decodeImage(archive.get('block2.app'));
  const definitions = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const portal = definitions.find((d) => d.kind === 87);
  const p = createPlayer(portal.x - 74, portal.y), world = createWorld(definitions, map);
  const sample = (x, y) => collisionAt(map, mask, x, y);
  for (let i = 0; i < 500; i++) stepPlayer(p, {}, sample);
  assert.ok(p.y < map.height * 32 && !p.hazard);
  const camera = { x: p.x + 38 - 170, y: 0 };
  for (let i = 0; i < 300; i++) followCamera(camera, p, map);
  let now = 1000;
  for (let i = 0; i < 100 && !world.minigame; i++) {
    stepWorld(world, p, { jump: i === 12, right: p.y < 730 && p.x < portal.x - 32 }, camera, sample, now += 1000 / 30);
    followCamera(camera, p, map);
  }
  assert.equal(world.minigame?.kind, 'mole');
  const actor = world.actors.find((a) => a.kind === 87);
  assert.equal(actor.removed, true);
  assert.equal(actorSprite(actor), portal.name);
  assert.equal(actor.width, MOLE_PORTAL.width);
  assert.equal(actor.height, MOLE_PORTAL.height);
  const before = structuredClone(p);
  for (let i = 0; i < 1200; i++) stepWorld(world, p, {}, camera, sample, now += 1000 / 30);
  assert.equal(world.minigame.finished, true);
  assert.equal(world.minigame.outcome, 'completed');
  for (const key of ['points','chocobi','cans','lives','balls','waterBombs','bananas','jungleItems','companionItems','selectedItem']) assert.deepEqual(p[key], before[key], key);
  assert.equal(world.randomSeed, world.minigame.randomSeed);
  const mini = world.minigame;
  for (let i = 0; i < 10; i++) stepWorld(world, p, { right: true }, camera, sample, now += 1000 / 30);
  assert.ok(p.x > before.x);
  assert.equal(world.minigame, mini);
  const next = createWorld(definitions, map, world.randomSeed);
  assert.equal(next.randomSeed, world.randomSeed, 'stage changes retain the original shared RNG state');
});
