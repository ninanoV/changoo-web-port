import { CARD_ASSETS as assets } from './card-data.js';
import { nextRandom } from './random.js';

export function createCard(randomSeed, previous) {
  const game = {cursor: 0, firstOpen: 0, secondOpen: 0, judging: 0, canInput: 1, preview: 1,
    now: 0, judgeAt: 0, previewAt: 0, lives: 4, firstCard: 0, secondCard: 0,
    firstPosition: 0, secondPosition: 0, leftReady: 0, rightReady: 0, upReady: 0, downReady: 0, fireReady: 0,
    musicAt: 0, musicNow: 0, ...previous, unlockIndex: 1, randomSeed, ticks: 0, finished: false, outcome: null, render: null,
    order: previous ? [...previous.order] : Array.from({length: 18}, (_, i) => i), remaining: Array(18).fill(1)};
  // 0x41c4d0 swaps j=i..17 with rand()%18, preserving the prior game's order on reentry.
  for (let i = 0; i < 18; i++) for (let j = i; j < 18; j++) {
    const target = nextRandom(game) % 18;
    [game.order[j], game.order[target]] = [game.order[target], game.order[j]];
  }
  return game;
}

export function stepCard(game, input, now, effects) {
  if (game.ticks === 0) effects.cd.push('stop cdaudio');
  game.ticks = Math.min(100, game.ticks + 2);
  game.musicNow = now;
  if (now - game.musicAt > 58000) { effects.cd.push('play cdaudio from 12 to 13'); game.musicAt = now; }
  game.now = now;
  if (game.judging) {
    game.canInput = 0;
    const correct = Math.floor(game.firstCard / 2) === Math.floor(game.secondCard / 2);
    // The native controller restarts this clip every judging tick, including the final tick.
    effects.sounds.push({name: correct ? assets.correct : assets.incorrect, loop: false});
    if (game.judgeAt === 0) game.judgeAt = now;
    if (now - game.judgeAt > 800) {
      Object.assign(game, {judging: 0, firstOpen: 0, secondOpen: 0, canInput: 1, judgeAt: 0});
      if (correct) game.remaining[game.firstPosition] = game.remaining[game.secondPosition] = 0;
      else game.lives--;
    }
  }
  if (game.previewAt === 0) game.previewAt = now;
  if (now - game.previewAt > 2300) game.preview = 0;
  game.render.push({name: assets.background, x: 0, y: 0});
  const drawCard = (name, index) => game.render.push({name, x: assets.positions[index][0], y: assets.positions[index][1]});
  for (let i = 0; i < 18; i++) if (game.remaining[i]) drawCard(assets.back, i);
  for (let i = 0; i < game.lives; i++) game.render.push({name: assets.life, x: assets.lifePositions[i][0], y: assets.lifePositions[i][1]});
  if (game.preview) for (let i = 0; i < 18; i++) drawCard(assets.cards[Math.floor(game.order[i] / 2)], i);
  if (game.firstOpen) drawCard(assets.cards[Math.floor(game.firstCard / 2)], game.firstPosition);
  if (game.secondOpen) drawCard(assets.cards[Math.floor(game.secondCard / 2)], game.secondPosition);
  game.render.push({name: assets.cursor, x: assets.positions[game.cursor][0] + 32, y: assets.positions[game.cursor][1] + 45});
  if (game.lives === 0 || game.remaining.every(value => value === 0)) {
    const outcome = game.lives === 0 ? 'lost' : 'won';
    Object.assign(game, {cursor: 0, firstOpen: 0, secondOpen: 0, judging: 0, canInput: 1, now: 0, judgeAt: 0,
      preview: 1, previewAt: 0, lives: 4, remaining: Array(18).fill(1), finished: true, outcome});
    return;
  }
  if (!game.canInput) return;
  // Input is accepted after drawing; left/right can cross row boundaries.
  for (const [key, delta, allowed] of [['left', -1, () => game.cursor !== 0], ['right', 1, () => game.cursor !== 17],
    ['up', -6, () => game.cursor > 5], ['down', 6, () => game.cursor < 12]]) {
    if (input[key] && game[key + 'Ready'] && allowed()) game.cursor += delta;
    game[key + 'Ready'] = Number(!input[key]);
  }
  if (input.fire && game.fireReady && game.remaining[game.cursor]) {
    if (!game.firstOpen && !game.secondOpen) {
      game.firstCard = game.order[game.cursor]; game.firstPosition = game.cursor; game.firstOpen = 1;
    } else if (game.cursor !== game.firstPosition) {
      game.secondCard = game.order[game.cursor]; game.secondPosition = game.cursor; game.secondOpen = game.judging = 1;
    }
  }
  game.fireReady = Number(!input.fire);
}
