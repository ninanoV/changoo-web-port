import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createMinigame, stepMinigame } from '../web/minigames.js';
import { CAR_ROAD, FLAG_COMMANDS, MINIGAME_ASSETS } from '../web/minigame-data.js';
import { readArchive, decodeMap, decodeImage, decodePalette } from '../web/resources.js';
import { createPlayer, stepPlayer, collisionAt, followCamera } from '../web/game.js';
import { readStageObjects, createWorld, stepWorld, actorSprite } from '../web/objects.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-minigames.json', import.meta.url)));

test('runtime minigame tables and assets are the native extracted data', () => {
  assert.deepEqual(CAR_ROAD, fixture.road);
  assert.deepEqual(FLAG_COMMANDS, fixture.commands);
  assert.deepEqual(MINIGAME_ASSETS, fixture.assets);
  assert.ok(CAR_ROAD.slice(180).every((row) => row.every((cell) => cell === 1)), 'preserve the original blocked ending');
});

for (const { kind, strategy, initial, trace } of fixture.traces) {
  test(`${kind}/${strategy}: every native state, sound, CD command and sampled drawing agrees`, () => {
    const game = Object.assign(createMinigame(kind), initial);
    trace.forEach(({ now, input, expected, sounds, cd, draws }, tick) => {
      const effects = stepMinigame(game, input, now);
      for (const [key, value] of Object.entries(expected)) assert.equal(game[key], value, `${kind}/${strategy} tick ${tick}: ${key}`);
      assert.deepEqual(effects.sounds, sounds, `${kind}/${strategy} tick ${tick}: sounds`);
      assert.deepEqual(effects.cd, cd, `${kind}/${strategy} tick ${tick}: CD output`);
      if (draws) assert.deepEqual(game.render, draws, `${kind}/${strategy} tick ${tick}: drawing`);
    });
    assert.equal(game.finished, true);
  });
}

const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage1.map')), mask = decodeImage(archive.get('block1.app'));
const definitions = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
const sample = (x, y) => collisionAt(map, mask, x, y);

test('every native minigame image, palette and WAV is available', () => {
  for (const assets of Object.values(MINIGAME_ASSETS)) {
    decodePalette(archive.get(assets.palette));
    for (const name of Object.values(assets).flat().filter((value) => typeof value === 'string')) {
      if (name.endsWith('.app')) decodeImage(archive.get(name));
      if (name.endsWith('.WAV')) assert.ok(existsSync(new URL(`../Changoo (E)/RESOURCE/${name}`, import.meta.url)), name);
    }
  }
  for (const name of ['CAR.WAV', 'CRASH.WAV']) assert.ok(existsSync(new URL(`../Changoo (E)/RESOURCE/${name}`, import.meta.url)));
});

for (const [kind, name] of [[123, 'car'], [124, 'flag']]) {
  test(`${name}: walk into the actual map portal, finish, and resume without rewards or retrigger`, () => {
    const portal = definitions.find((object) => object.kind === kind);
    const p = createPlayer(portal.x - 100, portal.y), world = createWorld(definitions);
    for (let i = 0; i < 500; i++) stepPlayer(p, {}, sample);
    assert.ok(p.y < map.height * 32 && !p.hazard);
    const camera = { x: p.x + 38 - 170, y: 0 };
    for (let i = 0; i < 300; i++) followCamera(camera, p, map);
    let now = 1000;
    for (let i = 0; i < 100 && !world.minigame; i++) {
      stepWorld(world, p, { right: true }, camera, sample, now += 1000 / 30);
      followCamera(camera, p, map);
    }
    assert.equal(world.minigame?.kind, name);
    const actor = world.actors.find((a) => a.kind === kind);
    assert.equal(actor.removed, true);
    assert.equal(actorSprite(actor), portal.name);
    assert.deepEqual(actor.body, { left: 0, top: 0, right: 79, bottom: 91 });
    const before = structuredClone(p);
    for (let i = 0; i < 600 && !world.minigame.finished; i++) stepWorld(world, p, {}, camera, sample, now += 1000 / 30);
    assert.equal(world.minigame.finished, true);
    assert.equal(world.minigame.outcome, 'lost');
    for (const key of ['points','chocobi','cans','lives','balls','waterBombs','bananas','jungleItems','companionItems','selectedItem']) assert.deepEqual(p[key], before[key], key);
    // The native priority5 exit resumes actors, player and dog before this tick ends.
    assert.notEqual(p.ticks, before.ticks);
    const mini = world.minigame;
    for (let i = 0; i < 10; i++) stepWorld(world, p, { right: true }, camera, sample, now += 1000 / 30);
    assert.ok(p.x > before.x);
    assert.equal(world.minigame, mini);
    assert.equal(p.points, before.points);
    assert.equal(p.lives, before.lives);
  });
}
