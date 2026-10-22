import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readArchive, decodeImage, decodeMap } from '../web/resources.js';
import { collisionAt, bodyCollision, createPlayer, stepPlayer } from '../web/game.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-stage1.json', import.meta.url)));
const original = readFileSync(new URL('../Changoo (E)/SHIN.EXE', import.meta.url));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage1.map'));
const mask = decodeImage(archive.get('block1.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);

test('600 collision samples match the isolated original x86 function', () => {
  assert.equal(createHash('sha256').update(original).digest('hex'), fixture.sha256);
  for (const [x, y, expected] of fixture.collisions) {
    assert.equal(bodyCollision(x, y, sample), expected, `(${x}, ${y})`);
  }
});

test('every player tick matches the original update and terrain resolver', () => {
  const player = createPlayer(fixture.initial.x, fixture.initial.y);
  const states = ['idle', 'walk', 'air', '', '', 'land'];
  fixture.trace.forEach(({ input, expected }, i) => {
    stepPlayer(player, input, sample);
    for (const [field, value] of Object.entries(expected)) {
      const converted = field === 'state' ? states[value] : field === 'jumpHeld' ? Boolean(value) : value;
      assert.equal(player[field], converted, `tick ${i} ${field}`);
    }
  });
});
