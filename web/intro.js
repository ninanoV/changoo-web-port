import { resolveTerrain } from './game.js';

// SHIN.EXE 0x45ca60 / 0x45cd70 / 0x45ce40: images, frame indices and millisecond durations.
const images = ['11', '12', '13', '14', '15', '16', '17', '25', '26', '27', '28', '31', '32', '33', '34',
  '41', '42', '43', '44', '45', '46', '47', '48', '51', '52', '53', '54', '55', '56', '57', '58', '59', '61', '62', '625', '631', '64', '65', '66'];
const frames = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  16, 17, 18, 19, 20, 21, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38];
const durations = [...Array(37).fill(150), 688, 688, 688, 688, 3920, 3920, 3920, 3155, 3155, 419, 5000, 1350, 3175, 3175];
const audioFrames = { 37: '21.WAV', 41: '22.WAV', 44: '23.WAV', 46: '24.WAV', 48: '25.WAV', 49: '26.WAV' };
export const INTRO_SOUNDS = Object.values(audioFrames);
const recallFrames = [[0, 1, 2, 3, 2, 0, 0, 0], [0, 1, 2, 3, 4, 0, 0, 0]];

export function createIntro(player, prop, now) {
  player.frame = player.ticks = 0;
  return { kind: 118, prop, frameStartedAt: now, enterHeld: false, finished: false,
    firstRecallFrame: 0, firstRecallTicks: 0, secondRecallFrame: 0, secondRecallTicks: 0, recallDone: 0 };
}

export function stepIntro(event, player, enter, now, sample, deferTerrain = false) {
  if (event.finished) return [];
  const oldX = player.x, oldY = player.y;
  player.vx -= Math.sign(player.vx);
  if (player.vy <= 10) player.vy++;
  player.x += player.vx;
  player.y += player.vy;
  if (enter) event.enterHeld = true;
  else if (event.enterHeld) { event.enterHeld = false; event.finished = true; }
  const sounds = [];
  if (player.ticks === 0) {
    if (audioFrames[player.frame]) sounds.push(audioFrames[player.frame]);
    if (player.frame === 50) event.prop.removed = true;
  }
  player.ticks++;
  if (now - event.frameStartedAt > durations[player.frame]) {
    event.frameStartedAt = now;
    player.frame++;
    player.ticks = 0;
    if (player.frame === 51) { player.frame = 0; event.finished = true; }
  }
  if (player.frame === 47) {
    for (const prefix of ['first', 'second']) {
      if (++event[`${prefix}RecallTicks`] === 20) {
        event[`${prefix}RecallTicks`] = 0;
        if (++event[`${prefix}RecallFrame`] === 5) event.recallDone = 1;
      }
    }
  }
  if (!deferTerrain) resolveTerrain(player, oldX, oldY, sample);
  return sounds;
}

export function introSprites(event, player) {
  const { x, y } = player;
  const sprites = [{ name: `ev3_${images[frames[player.frame]]}.app`, x, y }];
  if (player.frame === 47) {
    // shortcut: indices 6/7 read the original zero padding at 30 Hz; recheck adjacent memory when calibrating frame rate.
    const first = recallFrames[0][event.firstRecallFrame] ?? 0;
    const second = recallFrames[1][event.secondRecallFrame] ?? 0;
    sprites.push({ name: 'recall.app', x, y: y - 180 },
      { name: `rc_m${first + 1}.app`, x: x + 78, y: y - 182 },
      { name: `rc_s${second + 1}.app`, x: x + 16, y: y - 88 });
  }
  return sprites;
}
