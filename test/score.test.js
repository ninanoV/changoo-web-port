import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readArchive, decodeImage } from '../web/resources.js';
import { drawScore } from '../web/score.js';

test('score uses native six-digit sprites at fixed screen coordinates', () => {
  for (const [points, digits] of [[0, '000000'], [9, '000009'], [10, '000010'], [25, '000025'], [99, '000099'], [100, '000100'], [123456, '123456'], [999999, '999999']]) {
    const draws = [];
    drawScore(points, (...args) => draws.push(args));
    assert.deepEqual(draws, [...digits].map((digit, i) => [`${digit}.app`, 10 + i * 32, 10]), `score ${points}`);
  }
});

test('native score overflow leaves the invalid leading digit blank', () => {
  const draws = [];
  drawScore(1000025, (...args) => draws.push(args));
  assert.deepEqual(draws, [...'00025'].map((digit, i) => [`${digit}.app`, 42 + i * 32, 10]));
});

test('all ten original score sprites decode at their native size', () => {
  const archive = readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES', import.meta.url)));
  for (let digit = 0; digit < 10; digit++) {
    const image = decodeImage(archive.get(`${digit}.app`));
    assert.equal(image.width, 33);
    assert.equal(image.height, 33);
  }
});
