import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer } from '../web/game.js';
import { enterFlight, hurtFlight } from '../web/flight.js';
import { createEvent, stepEventPlayer, eventPlayerSprites } from '../web/events.js';
import { createWorld, stepWorld } from '../web/objects.js';
import { FLIGHT_EVENTS, FLIGHT_POSES } from '../web/flight-event-data.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/original-flight-events.json', import.meta.url)));
const state = (value) => value === 18 ? 'flight' : value === 19 ? 'flightHurt' : `scene${value}`;
function compare(p, expected, label) {
  for (const [key, value] of Object.entries(expected)) assert.equal(p[key], key === 'state' ? state(value) : value, `${label} ${key}`);
}
test('flight dialogue data preserves the native timeline, voices and script velocities', () => {
  assert.deepEqual(FLIGHT_EVENTS, fixture.metadata);
  assert.deepEqual(FLIGHT_POSES, fixture.animations);
});
for (const { state: pose, trace } of fixture.poses) {
  test(`flight scene pose ${pose}: native coordinates and animation frames agree`, () => {
    const p = Object.assign(createPlayer(60, 40), trace[0].before, { state: state(pose), animationOverride: FLIGHT_POSES[pose] });
    for (const [tick, row] of trace.entries()) {
      assert.deepEqual(eventPlayerSprites(p).map(({name, x, y}) => ({name, x, y})), row.draws, `${pose}/${tick} draw`);
      stepEventPlayer(p, () => 0);
      compare(p, row.expected, `${pose}/${tick}`);
    }
  });
}
for (const { kind, scenario, initial, trace } of fixture.sequences) {
  test(`flight dialogue ${kind}/${scenario}: controller, return to flight and scroll stop agree`, () => {
    const p = createPlayer(60, 40), camera = { x: 0, y: 0 }, world = createWorld([], { width: 1400, height: 20 });
    enterFlight(p);
    if (scenario === 'hurt-entry') hurtFlight(p);
    world.event = createEvent(kind, p, camera, 1000);
    world.flightStopped = kind === 76;
    compare(p, initial.player, 'initial');
    for (const [tick, row] of trace.entries()) {
      const sounds = stepWorld(world, p, { enter: row.enter }, camera, () => 0, 1000 + row.elapsed);
      assert.deepEqual(sounds, row.sounds, `${kind}/${scenario}/${tick} sound`);
      compare(p, row.expected.player, `${kind}/${scenario}/${tick}`);
      assert.equal(world.flightStopped, row.expected.stopped);
      assert.equal(!world.event, row.expected.removed);
      if (world.event) assert.equal(world.event.phase, row.expected.phase);
      assert.equal(p.animationOverride.count, row.expected.count);
      assert.equal(p.animationOverride.period, row.expected.period);
    }
  });
}
