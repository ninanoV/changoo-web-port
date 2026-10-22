import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { collisionAt, bodyCollision, createPlayer, resolveTerrain } from '../web/game.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-terrain.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage2.map')), mask = decodeImage(archive.get('block2.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);

test('2500 stage-two mask probes and native slope corrections agree', () => {
  for (const [x, y, expected] of fixture.collisions) assert.equal(bodyCollision(x, y, sample), expected, `${x},${y}`);
  for (const { x, y, oldX, oldY, expected } of fixture.corrections) {
    const p = createPlayer(x, y);
    resolveTerrain(p, oldX, oldY, sample);
    for (const [key, value] of Object.entries(expected)) assert.equal(p[key], value, `${x},${y}: ${key}`);
  }
});

test('all four solid/special masks reproduce the native edge probes and correction', () => {
  for (const { kind, x, y, type, expected } of fixture.synthetic) {
    const tile = (px, py) => px >= 320 && px < 352 && py >= 320 && py < 352 ? kind : 0;
    assert.equal(bodyCollision(x, y, tile), type, `${kind}: ${x},${y}`);
    const p = createPlayer(x, y);
    resolveTerrain(p, x - 7, y - 11, tile);
    for (const [key, value] of Object.entries(expected)) assert.equal(p[key], value, `${kind}: ${x},${y}: ${key}`);
  }
});
