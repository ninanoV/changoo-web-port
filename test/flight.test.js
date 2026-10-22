import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayer } from '../web/game.js';
import { enterFlight, hurtFlight, stepFlight, stepFlightCamera } from '../web/flight.js';
import { createProjectile, stepProjectile, createActor, hitActor } from '../web/objects.js';
import { FLIGHT_IMAGES, FLIGHT_LASER } from '../web/flight-data.js';

const f = JSON.parse(readFileSync(new URL('./fixtures/original-flight.json', import.meta.url)));
const map = { width: 1400, height: 20 }, camera = { x: 0, y: 0 };
function compare(p, expected, label) {
  for (const [key, value] of Object.entries(expected)) assert.equal(p[key], key === 'state' ? value === 18 ? 'flight' : 'flightHurt' : value, `${label} ${key}`);
}

for (const { scenario, initial, trace } of f.traces) {
  test(`flight/${scenario}: every original input, burst, health, animation and clamp agrees`, () => {
    const p = createPlayer(0, 0); enterFlight(p);
    compare(p, initial, 'initial');
    trace.forEach(({ input, hurt, stopped, expected, shots }, tick) => {
      if (hurt) hurtFlight(p);
      assert.deepEqual(stepFlight(p, input, camera, map, stopped), shots, `tick ${tick} shots`);
      compare(p, expected, `tick ${tick}`);
    });
  });
}

test('72 native flight-camera tracking branch probes match next-frame offsets', () => {
  for (const { x, y, playerY, stopped, nextX, nextY } of f.camera) {
    const view = { x, y };
    stepFlightCamera(view, { y: playerY }, map, stopped);
    assert.equal(view.nextX, nextX);
    assert.equal(view.nextY, nextY);
  }
});

test('flight images and laser dimensions, motion and offscreen expiry match the original', () => {
  assert.deepEqual(FLIGHT_IMAGES, f.animations);
  assert.equal(FLIGHT_LASER.image, f.laser.image);
  const shot = createProjectile({ type: 35, x: 100, y: 200, vx: 24, vy: 0 });
  assert.equal(shot.width, f.laser.width); assert.equal(shot.height, f.laser.height);
  assert.deepEqual(Object.values(shot.body), f.laser.body);
  f.laser.trace.forEach((expected, tick) => {
    stepProjectile(shot, () => 0, false, camera);
    for (const [key, value] of Object.entries(expected)) assert.equal(shot[key], value, `tick ${tick} ${key}`);
  });
});

test('the original flight contact handler still collects chocobi and awards its point', () => {
  const p = createPlayer(100, 200), pickup = createActor(10, 100, 200);
  enterFlight(p); hitActor(p, pickup);
  compare(p, f.pickup.player, 'flight pickup');
  assert.equal(pickup.collected, f.pickup.collected);
});
