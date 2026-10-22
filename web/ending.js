import { ENDING } from './ending-data.js';

export function createEnding(now) {
  return {mode: 'movie', phase: 0, ticks: 0, startedAt: now, now: 0, floatX: 140, floatY: 230,
    movieFinished: false, creditTicks: 0, finished: false, menuRequested: false, render: [], startSounds: ENDING.startSounds};
}

export function stepEnding(ending, skip, now) {
  const effects = {sounds: [], cd: []};
  ending.render = [];
  if (ending.finished) return effects;
  if (ending.mode === 'credits') {
    if (ending.creditTicks === 0) effects.cd.push(...ENDING.startCd);
    if (ending.creditTicks < 3000) ending.render.push({name: ENDING.credits[Math.floor(ending.creditTicks / 1000)], x: 0, y: 0});
    if (ending.creditTicks === 4000) { ending.finished = ending.menuRequested = true; return effects; }
    ending.creditTicks++;
    return effects;
  }
  const image = ENDING.sequence[ending.phase];
  ending.render.push({name: ENDING.background, x: 0, y: 0}, {name: ENDING.images[image], x: 140, y: 115});
  if (ending.phase > 6) {
    ending.render.push({name: ENDING.overlay, x: ending.floatX, y: ending.floatY});
    ending.floatX += 2; ending.floatY--;
  }
  if (!skip) {
    ending.ticks++; ending.now = now;
    if (((now - ending.startedAt) >>> 0) > ENDING.durations[image]) {
      ending.startedAt = now; ending.phase++; ending.ticks = 0;
    }
  }
  if (skip || ending.phase === ENDING.sequence.length) {
    ending.movieFinished = true; ending.mode = 'credits';
    effects.cd.push('stop cdaudio');
  }
  return effects;
}
