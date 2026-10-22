import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, playerAnimation } from '../web/game.js';
import { createWorld, stepWorld, actorSprite } from '../web/objects.js';
import { createEvent, eventPlayerSprites, eventNpcSprite } from '../web/events.js';
import { FINAL_SCENES, FINAL_POSES } from '../web/final-scene-data.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-final-scenes.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage6.map')), mask = decodeImage(archive.get('block6.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
const stateName = state => ({0: 'idle', 1: 'walk', 2: 'air', 4: 'hurt', 5: 'land'})[state] ?? `scene${state}`;
const compare = (actual, expected, label) => {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `${label}/${key}`);
};

test('final dialogue and introduction assets match original pose tables and cast loaders', () => {
  assert.deepEqual(FINAL_SCENES, fixture.scenes); assert.deepEqual(FINAL_POSES, fixture.poses);
  for (const pose of Object.values(FINAL_POSES)) for (const name of pose.frames) decodeImage(archive.get(`${name}.app`));
  for (const scene of Object.values(FINAL_SCENES)) {
    for (const actor of [...Object.values(scene.enemies), ...(scene.prop ? [scene.prop] : [])]) {
      for (const name of actor.images) decodeImage(archive.get(name));
    }
  }
});

for (const {kind, scenario, initial, trace} of fixture.sequences) {
  test(`final scene ${kind}/${scenario}: native spawn timing, movement, state, audio and cleanup agree`, () => {
    const before = initial.player, p = createPlayer(before.x, before.y), camera = {x: before.x - 300, y: 2719};
    const world = createWorld([], map);
    if (scenario === 'hurt-entry') p.state = 'hurt';
    world.event = createEvent(kind, p, camera, 1000);
    world.actors.push(...(world.event.enemies ?? []));
    for (const [tick, row] of trace.entries()) {
      if (row.draws && row.expected.phase === world.event?.phase && !row.expected.removed) {
        const render = [...world.actors.filter(a => !a.born && !a.removed).map(a => ({name: actorSprite(a), x: a.x, y: a.y})),
          ...world.npcs.filter(a => !a.born && !a.removed).map(a => ({name: eventNpcSprite(a), x: a.x, y: a.y})), ...eventPlayerSprites(p)];
        assert.deepEqual(render.map(({name, x, y}) => ({name, x: x - camera.x, y: y - camera.y})), row.draws, `${kind}/${scenario}/${tick}/drawing`);
      }
      assert.deepEqual(stepWorld(world, p, {enter: row.enter}, camera, sample, 1000 + row.elapsed), row.sounds, `${kind}/${scenario}/${tick}/sounds`);
      compare(p, {...row.expected.player, state: stateName(row.expected.player.state)}, `${kind}/${scenario}/${tick}/player`);
      assert.equal(playerAnimation(p).count, row.expected.count); assert.equal(playerAnimation(p).period, row.expected.period);
      assert.equal(world.event === null, row.expected.removed);
      if (world.event) assert.equal(world.event.phase, row.expected.phase);
      for (const [actorKind, expected] of Object.entries(row.expected.actors)) {
        compare(world.actors.find(a => a.kind === Number(actorKind)), expected, `${kind}/${scenario}/${tick}/${actorKind}`);
      }
      assert.equal(world.npcs.length > 0, row.expected.prop !== null);
      if (row.expected.prop) compare(world.npcs[0], row.expected.prop, `${kind}/${scenario}/${tick}/prop`);
    }
    assert.equal(world.finalBossesRemaining, 2);
  });
}
