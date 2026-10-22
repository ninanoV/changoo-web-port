import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, enterNextStage, followCamera } from '../web/game.js';
import { createWorld, stepWorld, readStageObjects, actorSprite } from '../web/objects.js';
import { createEvent, eventPlayerSprites } from '../web/events.js';
import { createStageEntry } from '../web/stage-entry.js';
import { STAGE6_EXIT, STAGE6_EXIT_POSE } from '../web/stage6-exit-data.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-stage6-exit.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage5.map')), mask = decodeImage(archive.get('block5.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
const stateName = value => value === 0 ? 'idle' : value === 4 ? 'hurt' : `scene${value}`;
const compare = (actual, expected, label) => {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `${label}/${key}`);
};

test('stage6 ending cast, original sprites and player pose match the executable', () => {
  assert.deepEqual(STAGE6_EXIT, fixture.scene); assert.deepEqual(STAGE6_EXIT_POSE, fixture.pose);
  for (const actor of STAGE6_EXIT.cast) for (const name of actor.images) decodeImage(archive.get(name));
  for (const name of STAGE6_EXIT_POSE.frames) decodeImage(archive.get(`${name}.app`));
});

for (const {scenario, previousState, initial, camera, trace} of fixture.traces) {
  test(`stage6 ending/${scenario}: native cast, player, terrain, drawing and destination state agree`, () => {
    const p = Object.assign(createPlayer(initial.x, initial.y), initial, {state: stateName(previousState)}), world = createWorld([], map);
    world.event = createEvent(112, p, camera, 1000); world.actors.push(...world.event.enemies);
    for (const [tick, row] of trace.entries()) {
      if (row.draws) {
        const render = [...world.actors.filter(actor => !actor.born).map(actor => ({name: actorSprite(actor), x: actor.x, y: actor.y})), ...eventPlayerSprites(p)];
        assert.deepEqual(render.map(({name, x, y}) => ({name, x: x - camera.x, y: y - camera.y})), row.draws, `${scenario}/${tick}/draws`);
      }
      const sounds = stepWorld(world, p, {enter: row.enter}, camera, sample, 1000 + row.elapsed);
      if (!row.transitioned) assert.deepEqual(sounds, row.sounds, `${scenario}/${tick}/sounds`);
      // New-map eager actor creation (including its four BAT calls) remains a separate factory audit.
      if (row.transitioned) { assert.deepEqual(row.sounds, Array(4).fill('BAT.WAV')); enterNextStage(p, 6); }
      compare(p, {...row.player, state: stateName(row.player.state)}, `${scenario}/${tick}/player`);
      assert.equal(world.stageComplete, row.transitioned);
      if (!row.transitioned) {
        assert.equal(world.event.phase, row.phase);
        for (const actor of world.actors) compare(actor, row.cast[actor.kind], `${scenario}/${tick}/${actor.kind}`);
      }
    }
  });
}

test('real stage5 ending marker leads to the final entry, life reward and resumed walking', () => {
  const defs = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const trigger = defs.find(d => d.kind === 112);
  const p = createPlayer(trigger.x - 65, trigger.y - 100), world = createWorld(defs, map);
  const camera = {x: p.x - 200, y: p.y - 250}; let now = 1000;
  for (let i = 0; i < 90 && !world.event; i++) {
    stepWorld(world, p, {right: true}, camera, sample, now += 1000 / 30);
    followCamera(camera, p, map);
  }
  assert.equal(world.event?.kind, 112);
  for (let i = 0; i < 90 && !world.stageComplete; i++) stepWorld(world, p, {}, camera, sample, now += 1000 / 30);
  assert.equal(world.stageComplete, true);
  const lives = p.lives; enterNextStage(p, 6); assert.equal(p.lives, lives + 3);
  const nextMap = decodeMap(archive.get('stage6.map')), nextMask = decodeImage(archive.get('block6.app'));
  const nextDefs = readStageObjects(nextMap, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const next = createWorld(nextDefs, nextMap), view = {x: 0, y: 0};
  next.stageEntry = createStageEntry(7, now);
  for (let i = 0; i < 1000 && !next.stageEntry.finished; i++) stepWorld(next, p, {}, view, (x, y) => collisionAt(nextMap, nextMask, x, y), now += 1000 / 30);
  assert.equal(next.stageEntry.finished, true);
  const startX = p.x;
  for (let i = 0; i < 30; i++) {
    stepWorld(next, p, {right: true}, view, (x, y) => collisionAt(nextMap, nextMask, x, y), now += 1000 / 30);
    followCamera(view, p, nextMap);
  }
  assert.ok(p.x > startX); assert.equal(p.dead, false);
});
