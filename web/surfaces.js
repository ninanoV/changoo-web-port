import { bodyCollision, resolveTerrain, overlaps } from './game.js';
import { resolveEnemyTerrain } from './stage2-actors.js';

const FOOT = { left: 24, top: 65, right: 50, bottom: 71 };
export const isSurfaceKind = (kind) => [3, 4, 5, 49, 50, 9, 68, 69, 88, 89, 91, 94, 96, 97, 98, 99, 100, 101, 102, 103].includes(kind);
export const isWoodSurface = (kind) => kind >= 96 && kind <= 103;

export function createSurface(kind, x, y) {
  if (!isSurfaceKind(kind)) throw new Error(`Unsupported surface: ${kind}`);
  const spring = [9, 68, 69, 88, 89, 91, 94].includes(kind), bridge = kind === 101 || kind === 102;
  return { kind, x, y, oldX: x, oldY: y, vx: 0, vy: 0, spring, bridge,
    state: spring ? 0 : ({ 3: 1, 4: 2, 5: 0, 49: 3, 50: 4, 96: 1, 97: 2, 98: 0, 99: 3, 100: 4, 101: 0, 102: 4, 103: 0 })[kind],
    frame: 0, ticks: 0, period: 10, frameCount: 1, spriteIndex: 0,
    body: { left: 0, top: 0, right: spring ? 56 : 62, bottom: spring ? 10 : 22 },
    width: kind === 94 ? 57 : 64, height: kind === 94 ? 68 : spring ? 64 : isWoodSurface(kind) ? 32 : 23, removed: false };
}

export function stepSurface(surface, sample, deferTerrain = false) {
  surface.oldX = surface.x;
  surface.oldY = surface.y;
  if (surface.spring) {
    const last = surface.kind === 9 ? 4 : 2;
    if (surface.state === 1 && surface.frame === last && surface.ticks === 9) {
      surface.state = surface.frame = surface.ticks = 0;
      surface.frameCount = 1;
    }
  } else {
    surface.vx = surface.state === 1 ? -2 : surface.state === 2 ? 2 : 0;
    surface.vy = surface.state === 3 ? -2 : surface.state === 4 ? 2 : 0;
    surface.vy -= Math.sign(surface.vy);
  }
  surface.vx -= Math.sign(surface.vx);
  surface.x += surface.vx;
  surface.y += surface.vy;
  if (surface.spring) {
    if (++surface.ticks > surface.period) {
      surface.ticks = 0;
      surface.frame = (surface.frame + 1) % surface.frameCount;
    }
    surface.spriteIndex = surface.state === 1 ? surface.frame + 1 : 0;
  } else if (!deferTerrain) {
    if (isWoodSurface(surface.kind)) resolveEnemyTerrain(surface, sample);
    else if (bodyCollision(surface.x, surface.y, sample, surface.body) === 1) resolveTerrain(surface, surface.oldX, surface.oldY, sample, surface.body);
  }
}

export function touchSurface(player, surface) {
  if (surface.bridge) surface.state = 4;
  const foot = { x: player.x, y: player.y, body: FOOT };
  const contact = overlaps(foot, surface);
  if (surface.spring) {
    if (player.vy > 0 && contact) {
      player.y = surface.y + surface.body.top - FOOT.bottom;
      player.vy = -35;
      player.onPlatform = true;
    }
    if (!player.onPlatform) return [];
    surface.state = 1;
    surface.frame = surface.ticks = 0;
    surface.frameCount = 5;
    surface.spriteIndex = 1;
    return ['JUMP2.WAV'];
  }
  if (contact) {
    player.y = surface.y + surface.body.top - FOOT.bottom;
    player.onPlatform = true;
  }
  player.y++;
  if (player.onPlatform) player.x += surface.x - surface.oldX;
  return [];
}

export function surfaceSprite(surface) {
  if (!surface.spring) return isWoodSurface(surface.kind) ? `dari${surface.bridge ? 2 : surface.kind === 103 ? 3 : 1}.app` : 'mb.app';
  if (surface.kind === 9) return `spring${surface.spriteIndex + 1}.app`;
  // shortcut: the original basic-player callback selects index 3 past this three-image atlas; verify that failed blit on Windows.
  if ([68, 91].includes(surface.kind)) return surface.spriteIndex < 3 ? `dspring${surface.spriteIndex + (surface.kind === 68 ? 1 : 4)}.app` : null;
  if (surface.kind === 94) return surface.spriteIndex < 3 ? `sspring${surface.spriteIndex + 1}.app` : null;
  return surface.spriteIndex < 3 ? `gspring${surface.spriteIndex + ({ 69: 1, 88: 4, 89: 7 })[surface.kind]}.app` : null;
}
