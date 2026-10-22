import { SECONDARY_KINDS } from './spawn-data.js';

function inside(object, cell, map) {
  const secondary = SECONDARY_KINDS.includes(object.kind);
  if (secondary && (object.column <= 0 || object.row <= 0 || object.column >= (map?.width ?? Infinity) || object.row >= (map?.height ?? Infinity))) return false;
  const x = object.column - cell.column, y = object.row - cell.row;
  return secondary ? x >= -20 && x <= 40 && y >= -15 && y <= 30 : x >= 0 && x <= 20 && y >= 0 && y <= 15;
}

// The camera scans its initial rectangle and newly entered tile edges, not old queued cells every tick.
export function entersSpawnWindow(object, current, previous, map) {
  return inside(object, current, map) && (!previous || !inside(object, previous, map));
}
