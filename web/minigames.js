import { CAR_ROAD, FLAG_COMMANDS, MINIGAME_ASSETS as BASE_ASSETS } from './minigame-data.js';
import { createMole, stepMole } from './mole.js';
import { MOLE_ASSETS } from './mole-data.js';
import { createCard, stepCard } from './card.js';
import { CARD_ASSETS } from './card-data.js';
import { createPuzzle, stepPuzzle } from './puzzle.js';
import { PUZZLE_ASSETS } from './puzzle-data.js';

export const MINIGAME_ASSETS = { ...BASE_ASSETS, mole: MOLE_ASSETS, card: CARD_ASSETS, puzzle: PUZZLE_ASSETS };

const commands = FLAG_COMMANDS.flat();

export function createMinigame(kind, randomSeed = 1, previous) {
  const common = { kind, ticks: 0, finished: false, outcome: null, render: null };
  if (kind === 'mole') return { ...common, ...createMole(randomSeed) };
  if (kind === 'card') return { ...common, ...createCard(randomSeed, previous) };
  if (kind === 'puzzle') return { ...common, ...createPuzzle(randomSeed, previous) };
  if (kind === 'car') return { ...common, unlockIndex: 0, frame: 0, lane: 0, row: 0, stepAt: 0, firstAt: 0,
    stepReady: 0, canMove: 1, exitRequested: 0, crashed: 0, leftHeld: 0, rightHeld: 0,
    canCrash: 1, crashSoundReady: 1, hitAt: 0, musicAt: 0, musicNow: 0 };
  if (kind === 'flag') return { ...common, unlockIndex: 2, pose: 0, inputActive: 0, issue: 0, commandAt: 0,
    previousNow: 0, answerAt: 0, awaiting: 0, unused: 0, round: 0, roundIntro: 0, introAt: 0,
    showIntro: 1, lives: 5, feedback: 0, feedbackAt: 0, wrong: 0, command: 0 };
  throw new Error(`Unknown minigame: ${kind}`);
}

function finishCar(game, outcome) {
  Object.assign(game, { frame: 0, lane: 0, row: 0, stepAt: 0, firstAt: 0, stepReady: 0, canMove: 1,
    crashed: 0, canCrash: 1, crashSoundReady: 1, finished: true, outcome });
  if (outcome === 'lost') game.exitRequested = 0;
}

function roadCell(game, row, lane) {
  if (row < CAR_ROAD.length) return CAR_ROAD[row][lane];
  // The last native rendered row reads the globals immediately following its 200-row table.
  return [game.frame, game.lane, game.row, game.stepAt, game.firstAt, game.stepReady, game.canMove, game.exitRequested][lane];
}

function stepCar(game, input, now, effects) {
  if (game.ticks === 0) { game.musicAt = now; effects.cd.push('play cdaudio from 13 to 14'); }
  game.ticks = Math.min(100, game.ticks + 1);
  game.musicNow = now;
  if (now - game.musicAt > 46000) { effects.cd.push('play cdaudio from 13 to 14'); game.musicAt = now; }
  if (game.row > 192) { finishCar(game, 'won'); return; }
  if (game.stepAt === 0) { game.stepAt = now; effects.sounds.push({ name: 'CAR.WAV', loop: true }); }
  if (game.firstAt === 0) game.firstAt = now;
  if (now - game.stepAt > 500) { game.stepReady = 1; game.row++; }
  if (now - game.hitAt > 2000 && game.crashed) { game.crashed = 0; game.exitRequested = 1; }
  game.lane = Math.max(0, Math.min(7, game.lane));
  if (game.stepReady) { game.stepReady = 0; game.stepAt = now; game.frame++; }
  game.frame %= 2;
  if (roadCell(game, game.row + 1, game.lane) && game.canCrash) {
    game.crashed = 1; game.canCrash = 0; game.hitAt = now;
  }
  if (game.crashed && game.crashSoundReady) {
    effects.sounds.push({ name: 'CRASH.WAV', loop: false });
    game.crashSoundReady = 0; game.canMove = 0;
  }
  if (game.exitRequested) { finishCar(game, 'lost'); return; }
  const assets = MINIGAME_ASSETS.car;
  game.render.push({ name: assets.backgrounds[game.frame], x: 0, y: 0 });
  for (let lane = 0; lane < 8; lane++) {
    for (let offset = 0; offset < 8; offset++) {
      if (roadCell(game, game.row + offset, lane)) game.render.push({ name: assets.obstacle, x: 64 + lane * 64, y: 448 - offset * 64 });
    }
  }
  game.render.push({ name: assets.cars[game.frame], x: (game.lane + 1) * 64, y: 384 });
  if (game.canMove) {
    if (input.left && !game.leftHeld) game.lane--;
    if (input.right && !game.rightHeld) game.lane++;
    game.leftHeld = Number(Boolean(input.left));
    game.rightHeld = Number(Boolean(input.right));
  }
}

function finishFlag(game) {
  const outcome = game.round >= 3 ? 'won' : 'lost';
  Object.assign(game, { command: 0, commandAt: 0, issue: 0, previousNow: 0, answerAt: 0, awaiting: 0,
    unused: 0, round: 0, roundIntro: 0, introAt: 0, showIntro: 1, lives: 5,
    feedback: 0, feedbackAt: 0, wrong: 0, finished: true, outcome });
}

function stepFlag(game, input, now, effects) {
  const assets = MINIGAME_ASSETS.flag;
  if (game.ticks === 0) effects.cd.push('stop cdaudio');
  game.ticks++;
  if (game.commandAt === 0) game.commandAt = now;
  if (game.feedbackAt === 0) game.feedbackAt = now;
  if (now - game.feedbackAt > 1000) { game.feedback = 0; game.feedbackAt = now; }
  // 0x41bb79 uses the first round's delay column for every round.
  if (now - game.commandAt > commands[game.command][3]) { game.issue = 1; game.commandAt = now; }
  if (!game.inputActive) game.pose = 2;
  if (game.answerAt === 0) game.answerAt = now;
  if (game.command > 29 && !game.awaiting && !game.issue) {
    game.round++;
    Object.assign(game, { command: 0, issue: 0, commandAt: 0, previousNow: 0, answerAt: 0, awaiting: 0,
      unused: 0, roundIntro: 1, showIntro: 1 });
  }
  if (game.round >= 3 || game.lives === 0) { finishFlag(game); return; }
  if (game.awaiting && !game.roundIntro) {
    const expected = commands[game.command - 1][2];
    const window = commands[game.round * 30 + game.command - 1][1];
    let correct = null;
    if (game.previousNow - game.answerAt < window) {
      if (game.pose === expected && game.pose !== 2) correct = true;
      else if (game.pose !== 2 && game.pose !== expected) correct = false;
    } else correct = game.pose === 2 && expected === 2;
    if (correct !== null) {
      effects.sounds.push({ name: correct ? assets.correct : assets.incorrect, loop: false });
      if (!correct) game.lives--;
      game.awaiting = 0; game.feedback = 1; game.wrong = Number(!correct); game.feedbackAt = now;
    }
  }
  if (game.roundIntro && game.introAt === 0) game.introAt = now;
  if (game.roundIntro) {
    game.issue = 0;
    if (now - game.introAt > 2000) { game.showIntro = 0; game.roundIntro = 0; game.introAt = 0; }
  }
  if (game.issue && !game.roundIntro) {
    const voice = commands[game.round * 30 + game.command][0];
    effects.sounds.push({ name: assets.voices[game.round * 20 + voice], loop: false });
    game.issue = 0; game.awaiting = 1; game.command++; game.answerAt = now;
  }
  game.previousNow = now;
  if (game.roundIntro && game.showIntro) {
    game.render.push({ name: assets.introBackground, x: 0, y: 0 }, { name: assets.intro, x: 52, y: 98 });
  } else {
    game.render.push({ name: assets.backgrounds[game.round], x: 0, y: 0 }, { name: assets.characters[game.pose], x: 93, y: 19 });
    for (let i = 0; i < game.lives; i++) game.render.push({ name: assets.life, x: assets.lifePositions[i][0], y: assets.lifePositions[i][1] });
    if (game.feedback) game.render.push({ name: assets.feedback[game.wrong], x: 500, y: 340 });
    game.inputActive = 0;
  }
  // The original judges and draws the previous input before accepting this tick's keys.
  const pose = input.up ? 3 : input.left ? 4 : input.right ? 0 : input.down ? 1 : null;
  if (pose !== null) { game.pose = pose; game.inputActive = 1; }
}

export function stepMinigame(game, input, now) {
  const effects = { sounds: [], cd: [] };
  game.render = [];
  if (game.finished) return effects;
  if (game.kind === 'car') stepCar(game, input, now, effects);
  else if (game.kind === 'mole') stepMole(game, input, now, effects);
  else if (game.kind === 'card') stepCard(game, input, now, effects);
  else if (game.kind === 'puzzle') stepPuzzle(game, input, now, effects);
  else stepFlag(game, input, now, effects);
  return effects;
}
