import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeImage, decodePalette, decodeMap } from '../web/resources.js';

const original = readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url));

test('the original archive contains 1052 bounded resources and all 1038 images decode', () => {
  const archive = readArchive(original);
  assert.equal(archive.size, 1052);
  let count = 0;
  for (const [name, bytes] of archive) {
    if (!name.endsWith('.app')) continue;
    const { width, height, pixels } = decodeImage(bytes);
    assert.equal(pixels.length, width * height, name);
    count++;
  }
  assert.equal(count, 1038);
  assert.equal(decodeImage(archive.get('tile1.app')).height, 3680);
});

test('RLE stores color then count; runs may cross a scanline', () => {
  const bytes = new Uint8Array(18);
  const view = new DataView(bytes.buffer);
  [3, 2, 6].forEach((value, i) => view.setUint32(i * 4, value, true));
  bytes.set([7, 4, 254, 1, 8, 1], 12);
  assert.deepEqual([...decodeImage(bytes).pixels], [7, 7, 7, 7, 254, 8]);
  bytes[17] = 2;
  assert.throws(() => decodeImage(bytes), /RLE/);
  assert.throws(() => decodeImage(bytes.subarray(0, 17)), /length/i);
});

test('palette channels use the original left shift by two', () => {
  const palette = decodePalette(readArchive(original).get('shin.pal'));
  assert.deepEqual([...palette.subarray(3, 6)], [0, 0, 252]);
  assert.throws(() => decodePalette(new Uint8Array(12)), /palette/i);
});

test('all seven maps have five signed 16-bit fields per cell in row order', () => {
  const archive = readArchive(original);
  const maps = [...archive].filter(([name]) => name.endsWith('.map'));
  assert.equal(maps.length, 7);
  for (const [, bytes] of maps) {
    const map = decodeMap(bytes);
    assert.equal(map.cells.length, map.width * map.height * 5);
  }
  const map = decodeMap(archive.get('stage1.map'));
  assert.equal(map.width, 1059);
  assert.equal(map.height, 100);
  assert.deepEqual([...map.cells.subarray((97 * 1059 + 24) * 5, (97 * 1059 + 24) * 5 + 5)], [1555, 25, 118, -4, -32]);
});

test('truncated directories and out-of-range resource offsets are rejected', () => {
  assert.throws(() => readArchive(original.subarray(0, 32)), /directory/i);
  const corrupt = Uint8Array.from(original);
  new DataView(corrupt.buffer).setUint32(24, 0xffffffff, true);
  assert.throws(() => readArchive(corrupt), /range/i);
  assert.throws(() => decodeMap(new Uint8Array(10)), /map/i);
});
