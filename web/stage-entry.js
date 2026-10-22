import { STAGE_ENTRIES } from './stage-entry-data.js';

export function createStageEntry(stage, now = 0) {
  if (!STAGE_ENTRIES[stage]) throw new Error(`Unsupported stage entry: ${stage}`);
  return { stage, phase: 0, ticks: 0, startedAt: STAGE_ENTRIES[stage].clockAtCreation ? now : 0, now: 0, finished: false, transitions: 0, render: STAGE_ENTRIES[stage].title };
}

export function stepStageEntry(entry, skip, now) {
  const sounds = [];
  if (entry.finished) return sounds;
  const data = STAGE_ENTRIES[entry.stage], image = data.sequence[entry.phase];
  entry.render = [{ name: data.background, x: 0, y: 0 }, { name: data.images[image], x: 140, y: 115 }];
  if (entry.ticks === 0) {
    if (entry.phase === 0 && !data.clockAtCreation) entry.startedAt = now;
  }
  const name = data.cues[entry.phase];
  if (name && entry.ticks === (data.cueTicks?.[entry.phase] ?? 0)) {
    if (entry.stage === 2 && entry.phase === 27) sounds.push({ action: 'stop', name });
    sounds.push({ action: 'play', name });
  }
  if (skip) {
    entry.finished = true;
    if (data.changesStage) entry.transitions++;
    if (!data.changesStage || data.returnOnSkip) return sounds;
  }
  entry.ticks++;
  entry.now = now;
  if (((now - entry.startedAt) >>> 0) > data.durations[image]) {
    entry.startedAt = now;
    entry.phase++;
    entry.ticks = 0;
    if (entry.phase === data.sequence.length) {
      entry.finished = true;
      if (data.changesStage) entry.transitions++;
    }
  }
  return sounds;
}
