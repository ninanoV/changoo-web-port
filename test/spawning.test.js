import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap } from '../web/resources.js';
import { objectPlacement, createPlayer } from '../web/game.js';
import { readStageObjects, createWorld, stepWorld } from '../web/objects.js';
import { SECONDARY_KINDS } from '../web/spawn-data.js';
import { IGNORED_KINDS } from '../web/stage2-actor-data.js';
import { entersSpawnWindow } from '../web/spawning.js';

const f = JSON.parse(readFileSync(new URL('./fixtures/original-spawning.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const config = readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url));
const names = config.toString().trim().split(/\s+/).map((name) => name.replace('.raw', '.app'));
test('both native dispatchers contribute to the ignored-kind decision', () => {
  assert.deepEqual(SECONDARY_KINDS, f.secondaryKinds);
  assert.deepEqual(IGNORED_KINDS, f.ignored);
  assert.deepEqual(IGNORED_KINDS, [6, 7, 8]);
  for (const probe of f.placements) {
    const bytes = archive.get(names[probe.kind]), header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const position = objectPlacement(probe.column, probe.row, probe.dx, probe.dy, header.getUint32(0, true), header.getUint32(4, true));
    const valid = probe.column > 0 && probe.column < 100 && probe.row > 0 && probe.row < 60;
    assert.equal(probe.consumed, valid);
    assert.equal(probe.created.length, Number(valid));
    if (valid) assert.deepEqual({ x: probe.created[0].x, y: probe.created[0].y }, position);
  }
});

for (const { name, scans } of f.maps) {
  test(`${name}: prefetch edges match original dispatch and do not respawn consumed cells`, () => {
    const map = decodeMap(archive.get(name)), objects = readStageObjects(map, config, archive).filter((o) => SECONDARY_KINDS.includes(o.kind));
    const consumed = new Set(); let previous = null;
    for (const { column, row, created } of scans) {
      const current = { column, row };
      const actual = objects.filter((o) => !consumed.has(o) && entersSpawnWindow(o, current, previous, map));
      assert.deepEqual(actual.map(({kind, x, y}) => ({kind, x, y})), created.map(({kind, x, y}) => ({kind, x, y})));
      for (const object of actual) consumed.add(object);
      previous = current;
    }
  });
}

test('the first booster enemy is created by the wider prefetch area before it becomes visible', () => {
  const map = decodeMap(archive.get('stage3.map')), objects = readStageObjects(map, config, archive);
  const world = createWorld(objects, map), p = createPlayer(0, 0);
  stepWorld(world, p, {}, { x: 0, y: 0 }, () => 0);
  const enemy = world.actors.find((a) => a.kind === 21 && a.column === 25);
  assert.equal(enemy.active, true);
  assert.equal(enemy.x, 731);
  assert.equal(objects.find((o) => o.kind === 20).hidden, false);
  assert.equal(objects.find((o) => o.kind === 122).hidden, false);
});

test('an offscreen enemy requeued inside an already scanned window is not recreated every tick', () => {
  const world = createWorld([{kind: 21, x: 4359, y: 2000, column: 138, row: 69}], {width: 1401, height: 100});
  const p = createPlayer(5000, 2000), camera = {x: 5000, y: 2000};
  world.actors[0].active = true;
  for (let tick = 0; tick < 3; tick++) {
    stepWorld(world, p, {}, camera, () => 0, tick * 1000 / 30);
    assert.equal(world.actors[0].active, false);
    assert.equal(world.actors[0].x, 4359);
  }
});
