import { supported, playerAnimation, playerSprite } from './game.js';
import { FALL_POSES } from './fall-data.js';

export function enterFall(player, state = 95) {
  player.state = `scene${state}`;
  player.frame = player.ticks = 0;
  player.animationOverride = FALL_POSES[state];
}

// 0x40dd30 replaces the player update until the landing animation finishes.
export function stepFall(player, sample) {
  if (['scene95', 'scene96', 'scene97'].includes(player.state)) player.vx = 0;
  if (player.state === 'scene95' && player.frame === 4 && player.ticks === 9) enterFall(player, 96);
  else if (player.state === 'scene96' && player.vy > 0 && (supported(player.x, player.y + 4, sample) || player.onPlatform)) {
    player.vy = 0;
    enterFall(player, 97);
  } else if (player.state === 'scene97' && player.frame === 4 && player.ticks === 9) {
    player.state = 'idle';
    player.frame = player.ticks = 0;
    delete player.animationOverride;
    return false;
  }
  player.vx -= Math.sign(player.vx);
  if (player.vy <= 10) player.vy++;
  player.x += player.vx; player.y += player.vy;
  const animation = playerAnimation(player);
  if (++player.ticks > animation.period) { player.ticks = 0; player.frame = (player.frame + 1) % animation.count; }
  return true;
}

export const fallSprite = (player) => ({ name: playerSprite(player), x: player.x - 17, y: player.y - 67 });
