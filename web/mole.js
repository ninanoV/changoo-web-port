import { MOLE_ASSETS } from './mole-data.js';
import { nextRandom } from './random.js';

export function createMole(randomSeed = 1) {
  return { unlockIndex: 3, randomSeed, leftHeld: 0, rightHeld: 0, upHeld: 0, downHeld: 0,
    striking: 0, x: 240, y: 70, targetX: 240, targetY: 70, column: 1, row: 1, frame: 0,
    score: 0, remaining: 60, countdown: 20, musicTicks: 0, interval: 20, musicAt: 0, musicNow: 0,
    holes: [[64, 50], [240, 50], [412, 50], [54, 150], [240, 150], [422, 150], [44, 278], [240, 278], [438, 278]]
      .map(([x, y]) => ({ x, y, targetX: x, targetY: y, remaining: 0, hit: 0, ticks: 0 })) };
}

function digits(render, images, width, value, x, y) {
  const values = [Math.trunc(value / 100), Math.trunc(value % 100 / 10), value % 10];
  values.forEach((digit, index) => {
    if (digit >= 0 && digit <= 9) render.push({ name: images[digit], x: x + index * width, y });
  });
}

export function stepMole(game, input, now, effects) {
  const assets = MOLE_ASSETS;
  if (game.musicTicks === 0) { game.musicAt = now; effects.cd.push(assets.musicCommand); }
  game.musicTicks = Math.min(100, game.musicTicks + 1);
  game.musicNow = now;
  if (now - game.musicAt > 58000) { effects.cd.push(assets.musicCommand); game.musicAt = now; }
  if (input.exit) { game.finished = true; game.outcome = 'cancelled'; return; }

  // 0x43d400 draws the previous state before accepting input or advancing the holes.
  game.render.push({ name: assets.backgrounds[0], x: 0, y: 0 });
  digits(game.render, assets.timeDigits, assets.timeDigitWidth, game.remaining, 70, 20);
  digits(game.render, assets.scoreDigits, assets.scoreDigitWidth, game.score, 310, 25);
  for (let row = 0; row < 3; row++) {
    for (const hole of game.holes.slice(row * 3, row * 3 + 3)) game.render.push({ name: assets.moles[hole.hit], x: hole.x, y: hole.y });
    game.render.push({ name: assets.backgrounds[row + 1], x: 0, y: [174, 281, 405][row] });
  }
  game.render.push({ name: assets.hammer[game.frame], x: game.x, y: game.y });

  for (const [key, axis, target, amount] of [['left', 'column', 'targetX', -200], ['right', 'column', 'targetX', 200],
    ['up', 'row', 'targetY', -150], ['down', 'row', 'targetY', 150]]) {
    if (input[key] && !game[`${key}Held`] && (amount < 0 ? game[axis] > 0 : game[axis] < 2)) {
      game[axis] += Math.sign(amount); game[target] += amount;
    }
    game[`${key}Held`] = Number(Boolean(input[key]));
  }
  if (input.fire) game.striking = 1;
  else if (game.striking && game.frame === 2) game.striking = 0;
  if (game.striking) {
    if (game.frame < 2) {
      game.y += 80; game.frame++;
      if (game.frame === 2) {
        const hole = game.holes[game.row * 3 + game.column];
        if (!hole.hit && hole.remaining > 0) {
          game.score++; hole.hit = 1;
          effects.sounds.push({ name: assets.hitSound, loop: false });
        }
      }
    }
  } else if (game.frame > 0) { game.y -= 80; game.frame--; }
  game.x += Math.trunc((game.targetX - game.x) / 2);
  game.y += Math.trunc((game.targetY - game.y) / 2);

  if (game.ticks > game.interval) {
    game.ticks = 0;
    let hole;
    do {
      hole = game.holes[nextRandom(game) % 9];
    } while (hole.hit === 1);
    hole.remaining = game.interval; hole.targetY -= 50;
  }
  for (const hole of game.holes) {
    if (hole.remaining > 0 && --hole.remaining === 0) hole.targetY += 50;
    if (hole.hit === 1 && ++hole.ticks === 10) { hole.hit = 0; hole.ticks = 0; }
    hole.x += Math.trunc((hole.targetX - hole.x) / 2);
    hole.y += Math.trunc((hole.targetY - hole.y) / 2);
  }
  game.ticks++;
  if (--game.countdown === 0) {
    game.countdown = 20;
    if (--game.remaining === 0) { game.finished = true; game.outcome = 'completed'; return; }
  }
  game.interval = Math.max(10, Math.trunc(game.remaining / 3));
}
