import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, stepPlayer, collisionAt, bodyCollision, followCamera, objectPlacement } from '../web/game.js';

const floor = (x, y) => y >= 400 ? 1 : 0;

test('walking sets ±8 then applies friction before movement; first idle frame only changes state', () => {
  const p = createPlayer(100, 328);
  stepPlayer(p, { right: true }, floor);
  assert.equal(p.x, 100);
  stepPlayer(p, { right: true }, floor);
  assert.equal(p.x, 107);
  assert.equal(p.vx, 7);
  stepPlayer(p, { left: true }, floor);
  assert.equal(p.x, 100);
  stepPlayer(p, {}, floor);
  assert.equal(p.x, 94);
});

test('jump starts at -15, adds gravity before movement, reaches a 105 pixel apex, and lands', () => {
  const p = createPlayer(100, 328);
  stepPlayer(p, { jump: true }, floor);
  assert.equal(p.vy, -14);
  assert.equal(p.y, 314);
  let minimum = p.y;
  for (let i = 0; i < 80; i++) {
    stepPlayer(p, { jump: true }, floor);
    minimum = Math.min(minimum, p.y);
  }
  assert.equal(minimum, 223);
  assert.equal(p.y, 328);
  assert.notEqual(p.state, 'air');
  stepPlayer(p, {}, floor);
  stepPlayer(p, { jump: true }, floor);
  assert.equal(p.vy, -14);
});

test('falling speed caps at 11 and terrain correction leaves no solid overlap', () => {
  const p = createPlayer(100, 200);
  for (let i = 0; i < 70; i++) stepPlayer(p, {}, floor);
  assert.equal(p.y, 328);
  assert.equal(bodyCollision(p.x, p.y, floor), 0);
  const falling = createPlayer(100, 0);
  for (let i = 0; i < 40; i++) stepPlayer(falling, {}, () => 0);
  assert.equal(falling.vy, 11);
});

test('a tall wall rolls horizontal movement back instead of passing through', () => {
  const solid = (x, y) => x >= 180 || y >= 400 ? 1 : 0;
  const p = createPlayer(100, 328);
  for (let i = 0; i < 30; i++) stepPlayer(p, { right: true }, solid);
  assert.equal(p.x, 129);
  assert.equal(bodyCollision(p.x, p.y, solid), 0);
});

test('map field 1 selects the collision tile; empty cells and out-of-bounds are safe', () => {
  const pixels = new Uint8Array(640 * 32);
  pixels[3 * 640 + 32 + 7] = 1;
  const map = { width: 1, height: 1, cells: new Int16Array([-1, 1, -1, 0, 0]) };
  const mask = { width: 640, height: 32, pixels };
  assert.equal(collisionAt(map, mask, 7, 3), 1);
  assert.equal(collisionAt(map, mask, 8, 3), 0);
  assert.equal(collisionAt(map, mask, -1, 3), 0);
  assert.equal(collisionAt(map, mask, 32, 3), 0);
  map.cells[1] = -1;
  assert.equal(collisionAt(map, mask, 7, 3), 0);
});

test('object positions include signed offsets, half width, and the bottom of the tile', () => {
  assert.deepEqual(objectPlacement(24, 97, -4, -32, 31, 19), { x: 765, y: 3085 });
});

test('camera follows the facing direction and stays within original map bounds', () => {
  const camera = { x: 0, y: 0 };
  const player = createPlayer(1000, 3050);
  for (let i = 0; i < 200; i++) followCamera(camera, player, { width: 1059, height: 100 });
  assert.ok(camera.x > 800 && camera.x < 900);
  assert.equal(camera.y, 2719);
  player.x = 0;
  player.y = 0;
  for (let i = 0; i < 200; i++) followCamera(camera, player, { width: 1059, height: 100 });
  assert.equal(camera.x, 0);
  assert.equal(camera.y, 0);
});
