import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer, collisionAt, followCamera } from '../web/game.js';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { enterBooster, hurtBooster, stepBooster } from '../web/booster.js';
import { BOOSTER_POSES } from '../web/booster-data.js';
import { readStageObjects, createWorld, stepWorld } from '../web/objects.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-booster.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage3.map')), mask = decodeImage(archive.get('block3.app'));
const states = { 26: 'booster', 27: 'boostHurt', 28: 'boostAttack' };
test('booster animation frames and map dimensions are the native extracted values', () => {
  assert.deepEqual(BOOSTER_POSES, fixture.animations);
  assert.deepEqual({ width: map.width, height: map.height }, fixture.map);
  for (const pose of Object.values(BOOSTER_POSES)) for (const frame of pose.frames) decodeImage(archive.get(`${frame}.app`));
});
for (const { scenario, initial, trace } of fixture.traces) {
  test(`booster/${scenario}: native acceleration, fire timing, bounds, damage and terrain agree`, () => {
    const p = createPlayer(initial.x, initial.y);
    enterBooster(p); Object.assign(p, initial, { state: states[initial.state] });
    const sample = scenario === 'terrain' ? (x, y) => collisionAt(map, mask, x, y) : () => 0;
    for (const [tick, row] of trace.entries()) {
      if (row.hurt) hurtBooster(p);
      assert.deepEqual(stepBooster(p, row.input, row.camera, map, sample), row.shots, `${scenario}/${tick} shots`);
      for (const [key, value] of Object.entries(row.expected)) assert.equal(p[key], key === 'state' ? states[value] : value, `${scenario}/${tick} ${key}`);
    }
  });
}

test('the actual booster opening supports first-enemy laser defeat and body damage without inventory grants', () => {
  const definitions = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  for (const attack of [true, false]) {
    const p = createPlayer(0, 0), world = createWorld(definitions, map), camera = {x: 0, y: 0};
    enterBooster(p);
    for (let tick = 0; tick < 180; tick++) {
      const input = attack ? {right: tick < 66, down: tick >= 66 && tick < 72, jump: tick >= 72 && tick < 78, fire: tick === 93}
        : {right: tick < 108, down: tick >= 96 && tick < 108};
      stepWorld(world, p, input, camera, (x, y) => collisionAt(map, mask, x, y), tick * 1000 / 30);
      followCamera(camera, p, map);
    }
    assert.equal(p.lives, attack ? 5 : 4);
    assert.equal(p.points, attack ? 1 : 0);
    assert.equal(world.actors.find((actor) => actor.kind === 21).removed, attack);
    assert.equal(p.balls + p.waterBombs + p.cans, 0);
  }
});
