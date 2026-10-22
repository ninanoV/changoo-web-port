import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeMap, decodeImage } from '../web/resources.js';
import { createPlayer, collisionAt, playerSprite, stepPlayer } from '../web/game.js';
import { createIntro, stepIntro, introSprites } from '../web/intro.js';
import { createWorld, stepWorld, readStageObjects } from '../web/objects.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-event118.json', import.meta.url)));
const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
const map = decodeMap(archive.get('stage1.map')), mask = decodeImage(archive.get('block1.app'));
const sample = (x, y) => collisionAt(map, mask, x, y);
function setup() {
  const p = Object.assign(createPlayer(670, 3032), { vx: 7, state: 'walk' });
  const prop = { removed: false };
  return { p, prop, event: createIntro(p, prop, 0) };
}
function compare(p, event, prop, expected, label) {
  for (const [key, value] of Object.entries(expected)) {
    const actual = key === 'removed' ? prop.removed : key in event ? event[key] : p[key];
    assert.equal(actual, key === 'state' ? 'walk' : value, `${label}: ${key}`);
  }
}

test('all 1210 original chocobi ticks, audio cues and recall counters match', () => {
  const { p, prop, event } = setup();
  for (const { elapsed, enter, expected, sounds } of fixture.trace) {
    assert.deepEqual(stepIntro(event, p, enter, elapsed, sample), sounds, `audio at ${elapsed}`);
    compare(p, event, prop, expected, elapsed);
    const sprites = introSprites(event, p);
    assert.equal(sprites[0].name, fixture.images[fixture.frames[p.frame]]);
    for (const sprite of sprites) assert.ok(archive.has(sprite.name), sprite.name);
    if (p.frame === 47) {
      assert.equal(sprites.length, 4);
      assert.deepEqual(sprites.slice(1).map(({ x, y }) => [x - p.x, y - p.y]), [[0, -180], [78, -182], [16, -88]]);
    } else assert.equal(sprites.length, 1);
  }
});

test('Enter skips on release and leaves the original chocobi prop visible', () => {
  const { p, prop, event } = setup();
  for (const { elapsed, enter, expected, sounds } of fixture.skip) {
    assert.deepEqual(stepIntro(event, p, enter, elapsed, sample), sounds);
    compare(p, event, prop, expected, elapsed);
  }
  assert.equal(prop.removed, false);
  stepPlayer(p, {}, sample);
  assert.ok(archive.has(playerSprite(p)));
});

test('late skipping renders safely and normal animation counters recover', () => {
  const { p, prop, event } = setup();
  let now;
  for (const row of fixture.trace) {
    stepIntro(event, p, false, row.elapsed, sample);
    now = row.elapsed;
    if (p.frame === 47) break;
  }
  stepIntro(event, p, true, now + 1, sample);
  stepIntro(event, p, false, now + 2, sample);
  assert.equal(event.finished, true);
  assert.ok(archive.has(playerSprite(p)));
  for (let i = 0; i < 6; i++) stepPlayer(p, { right: true }, sample);
  assert.ok(p.frame < 4);
  assert.equal(prop.removed, false);
});

test('the real home route triggers once, finishes, removes the prop and resumes walking', () => {
  const objects = readStageObjects(map, readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG', import.meta.url)), archive);
  const world = createWorld(objects), p = createPlayer(0, 3032), view = { x: 400, y: 2719 };
  let now = 0;
  for (let i = 0; i < 120 && !world.event; i++) stepWorld(world, p, { right: true }, view, sample, now += 1000 / 30);
  assert.equal(world.event?.kind, 118);
  const prop = world.event.prop;
  for (let i = 0; i < 1400 && world.event; i++) stepWorld(world, p, { right: true }, view, sample, now += 1000 / 30);
  assert.equal(world.event, null);
  assert.equal(prop.removed, true);
  const x = p.x;
  for (let i = 0; i < 10; i++) stepWorld(world, p, { right: true }, view, sample, now += 1000 / 30);
  assert.equal(p.x, x + 70);
  assert.equal(world.playedEvents.has(118), true);
  assert.equal(world.event, null);
});
