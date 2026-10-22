import { PUZZLE_ASSETS as assets } from './puzzle-data.js';
import { nextRandom } from './random.js';

const goal = [0, 1, 2, 3, 4, 5, 6, 7, -1];

export function createPuzzle(randomSeed, previous) {
  return {blank: 8, solved: 0, exitRequested: 0, canMove: 0, shuffleAt: 0, wonAt: 0, missingAtSide: 1,
    unused: 0, upReady: 0, downReady: 0, leftReady: 0, rightReady: 0, lastDirection: 0,
    ...previous, randomSeed, ticks: 0, finished: false, outcome: null, render: null, unlockIndex: 4,
    board: [...(previous?.board ?? goal)]};
}

function move(game, direction, effects) {
  effects.sounds.push({name: assets.moveSound, loop: false});
  let target = game.blank + [-3, 1, 3, -1][direction];
  if (target < 0 || target > 8 || (direction % 2 && Math.floor(target / 3) !== Math.floor(game.blank / 3))) target = game.blank;
  game.board[game.blank] = game.board[target];
  game.board[target] = -1;
  game.blank = target;
}

export function stepPuzzle(game, input, now, effects) {
  if (game.ticks === 0) effects.cd.push('stop cdaudio');
  game.ticks++;
  if (game.exitRequested) {
    Object.assign(game, {solved: 0, exitRequested: 0, shuffleAt: 0, wonAt: 0, missingAtSide: 1, unused: 0,
      finished: true, outcome: 'won'});
    return;
  }
  if (game.shuffleAt === 0) { game.shuffleAt = now; game.blank = 8; game.board = [...goal]; }
  const elapsed = now - game.shuffleAt;
  if (elapsed < 5000) {
    let direction = nextRandom(game) % 4;
    if (Math.abs(game.lastDirection - direction) === 2) direction = (direction + 1) % 4;
    move(game, direction, effects); game.lastDirection = direction;
  } else game.canMove = 1;
  if (game.solved) {
    game.canMove = 0;
    if (game.wonAt === 0) {
      effects.sounds.push({name: assets.winSound, loop: false});
      game.wonAt = now; game.missingAtSide = 0;
    }
    if (now - game.wonAt > 2500) game.exitRequested = 1;
  }
  game.render.push({name: assets.background, x: 0, y: 0}, {name: assets.pieces[8], x: game.missingAtSide ? 459 : 319, y: 308});
  game.board.forEach((piece, index) => {
    if (piece >= 0) game.render.push({name: assets.pieces[piece], x: assets.positions[index][0], y: assets.positions[index][1]});
  });
  if (elapsed > 5000) game.solved = Number(game.board.every((piece, index) => piece === goal[index]));
  if (!game.canMove) return;
  // Keys move a piece into the hole: Up moves the blank down, matching 0x424320.
  for (const [key, direction] of [['up', 2], ['down', 0], ['left', 1], ['right', 3]]) {
    if (input[key] && game[key + 'Ready']) move(game, direction, effects);
    game[key + 'Ready'] = Number(!input[key]);
  }
}
