import { readArchive, decodeImage, decodePalette, decodeMap } from './resources.js';
import { collisionAt, createPlayer, stepPlayer, playerSprite, followCamera, enterNextStage } from './game.js';
import { fallSprite } from './fall.js';
import { JUNGLE_PROJECTILE, STAGE2_ACTORS } from './stage2-actor-data.js';
import { isJungleBoss, isFinalBoss } from './stage2-actors.js';
import { createWorld, restartWorld, openMinigame, stepWorld, actorSprite, isEnemy, isActorKind, readStageObjects, cameraActive, initializeWorldCamera, advanceWorldCamera } from './objects.js';
import { isSurfaceKind, surfaceSprite } from './surfaces.js';
import { eventNpcSprite, eventPlayerSprites, EVENT_SOUNDS } from './events.js';
import { introSprites, INTRO_SOUNDS } from './intro.js';
import { INVENTORY_IMAGES, INVENTORY_LABELS } from './inventory.js';
import { companionSprite, dogSprite } from './companions.js';
import { MINIGAME_ASSETS } from './minigames.js';
import { FRESH_MINIGAME_UNLOCKS, FRESH_STAGE_COUNT, loadUnlocks, saveUnlocks, loadStageProgress, enterSavedStage } from './progress.js';
import { createStageEntry } from './stage-entry.js';
import { STAGE_ENTRIES } from './stage-entry-data.js';
import { obstacleSprite } from './stage2-obstacles.js';
import { STAGE2_BOSS, BOSS2_PROJECTILE_IMAGE } from './stage2-boss-data.js';
import { enterFlight } from './flight.js';
import { enterBooster } from './booster.js';
import { BOOSTER_BOSS } from './booster-boss-data.js';
import { boosterShotSprite } from './booster-boss.js';
import { FLIGHT_BOSS } from './flight-boss-data.js';
import { FLIGHT_BULLETS } from './flight-actor-data.js';
import { FLIGHT_LASER } from './flight-data.js';
import { FINAL_PROJECTILE } from './final-stage-data.js';
import { FINAL_BOSS_SHOTS } from './final-boss-data.js';
import { ENDING } from './ending-data.js';
import { createEnding } from './ending.js';
import { MENU } from './menu-data.js';
import { createMainMenu, createSelection, stepMenu } from './menus.js';
import { SETTINGS } from './settings-data.js';
import { createSettings, stepSettings, calibrationFactor } from './settings.js';
import { loadSpeed, saveSpeed, createFrameClock, cameraWaitReady, finishFrameTick } from './timing.js';
import { cameraMode, resetCameraOrigin } from './camera.js';
import { TITLE_SCENES } from './title-scene-data.js';
import { createTitleScene, stepTitleScene } from './title-scenes.js';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d', { alpha: false });
const cover = document.querySelector('#cover');
const title = document.querySelector('#cover-title');
const message = document.querySelector('#cover-message');
const play = document.querySelector('#play');
const pause = document.querySelector('#pause');
const reset = document.querySelector('#reset');
const menuButton = document.querySelector('#menu');
const encounter = document.querySelector('#encounter');
const weaponPreview = document.querySelector('#weapon-preview');
const bossPreview = document.querySelector('#boss-preview');
const carPreview = document.querySelector('#car-preview');
const flagPreview = document.querySelector('#flag-preview');
const molePreview = document.querySelector('#mole-preview');
const cavePreview = document.querySelector('#cave-preview');
const dialoguePreview = document.querySelector('#dialogue-preview');
const secondBossPreview = document.querySelector('#second-boss-preview');
const flightPreview = document.querySelector('#flight-preview');
const flightBossPreview = document.querySelector('#flight-boss-preview');
const boosterPreview = document.querySelector('#booster-preview');
const boosterBossPreview = document.querySelector('#booster-boss-preview');
const junglePreview = document.querySelector('#jungle-preview');
const jungleEnemyPreview = document.querySelector('#jungle-enemy-preview');
const jungleSpringPreview = document.querySelector('#jungle-spring-preview');
const jungleBridgePreview = document.querySelector('#jungle-bridge-preview');
const jungleBossPreview = document.querySelector('#jungle-boss-preview');
const stagePreviews = document.querySelectorAll('[data-stage-preview]');
const progressStatus = document.querySelector('#progress-status');
const status = document.querySelector('#status');
const hud = document.querySelector('#hud');
const assetRoot = './Changoo%20(E)/';
const keys = new Set();
let archive, palette, map, mask, tiles, gradient, objects, world, player, camera;
let characterConfig, stageNumber = 1;
let storage, unlocks, unlockedStages;
let running = false, ready = false, lastTime = 0, gameTime = 0, lastStatus = '';
let menu, selectionMenu, minigameFromMenu = false, preferences, frameClock = createFrameClock();
const sprites = new Map();
const palettes = new Map();
const soundButton = document.querySelector('#sound');
const sounds = new Map();
const pausedSounds = new Set();
let soundEnabled = true;
let inventoryBackdrop = null;

async function fetchBytes(path, missing) {
  const response = await fetch(path);
  if (response.status === 404 && missing !== undefined) return missing;
  if (!response.ok) throw new Error(`${decodeURI(path)} (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

function imageCanvas(image, colors, transparent = true) {
  const result = document.createElement('canvas');
  result.width = image.width;
  result.height = image.height;
  const data = new ImageData(image.width, image.height);
  for (let i = 0; i < image.pixels.length; i++) {
    const color = image.pixels[i];
    const offset = i * 4;
    data.data[offset] = colors[color * 3];
    data.data[offset + 1] = colors[color * 3 + 1];
    data.data[offset + 2] = colors[color * 3 + 2];
    data.data[offset + 3] = transparent && color === 254 ? 0 : 255;
  }
  result.getContext('2d').putImageData(data, 0, 0);
  return result;
}

function sprite(name, paletteName = 'shin.pal', transparent = true) {
  const key = `${paletteName}/${name}/${transparent}`;
  if (!sprites.has(key)) {
    const bytes = archive.get(name);
    if (!bytes) throw new Error(`이미지 없음: ${name}`);
    if (!palettes.has(paletteName)) palettes.set(paletteName, decodePalette(archive.get(paletteName)));
    sprites.set(key, imageCanvas(decodeImage(bytes), palettes.get(paletteName), transparent));
  }
  return sprites.get(key);
}

function tile(image, index, x, y) {
  if (index < 0) return;
  ctx.drawImage(image, index % 20 * 32, Math.floor(index / 20) * 32, 32, 32, x, y, 32, 32);
}

function drawSprite(name, x, y, flipped = false) {
  if (!name) return;
  const image = sprite(name);
  if (x + image.width < 0 || x > 640 || y + image.height < 0 || y > 480) return;
  ctx.save();
  ctx.translate(x, y);
  if (flipped) { ctx.translate(image.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function soundPair(name) {
  if (!sounds.has(name)) {
    const pair = [new Audio(`${assetRoot}RESOURCE/${name}`), new Audio(`${assetRoot}RESOURCE/${name}`)];
    pair.forEach((audio) => { audio.volume = 0.3; audio.preload = 'auto'; });
    sounds.set(name, pair);
  }
  return sounds.get(name);
}

function playAudio(audio) {
  audio.play().catch((error) => {
    if (error.name === 'AbortError') return;
    soundEnabled = false;
    stopSounds();
    soundButton.textContent = '소리 다시 켜기';
    soundButton.setAttribute('aria-pressed', 'false');
  });
}

function stopSounds(names = sounds.keys()) {
  for (const name of names) for (const audio of sounds.get(name) ?? []) {
    audio.pause();
    audio.currentTime = 0;
    pausedSounds.delete(audio);
  }
}

function playSounds(names) {
  if (!soundEnabled) return;
  for (const clip of names) {
    if (clip.action === 'stop') { stopSounds([clip.name]); continue; }
    const { name, loop = false } = typeof clip === 'string' ? { name: clip } : clip;
    const pair = soundPair(name);
    const audio = pair.shift();
    pair.push(audio);
    audio.currentTime = 0;
    audio.loop = loop;
    playAudio(audio);
  }
}

function resumeCarSound() {
  const mini = world.minigame;
  if (running && !menu && soundEnabled && mini?.kind === 'car' && !mini.finished && mini.stepAt &&
      !sounds.get('CAR.WAV')?.some((audio) => !audio.paused)) playSounds([{ name: 'CAR.WAV', loop: true }]);
}

function prepareMinigameSounds(kind) {
  const assets = MINIGAME_ASSETS[kind];
  if (kind === 'mole') soundPair(assets.hitSound);
  if (kind === 'card') [assets.correct, assets.incorrect].forEach(soundPair);
  if (kind === 'puzzle') [assets.moveSound, assets.winSound].forEach(soundPair);
  if (kind === 'flag') [...assets.voices, assets.correct, assets.incorrect].forEach(soundPair);
}

function draw() {
  ctx.imageSmoothingEnabled = false;
  if (menu) {
    menu.render.forEach(({name,x,y},i) => ctx.drawImage(sprite(name, menu.palette ?? (menu.kind === 'select' ? 'shin.pal' : 'tt0002.pal'), i !== 0), x, y));
    if (TITLE_SCENES[menu.kind]) {
      status.textContent = `${menu.kind === 'opening' ? '시작 로고' : '게임오버'} · ${running ? '실행 중' : '정지'}`;
      hud.textContent = menu.kind === 'opening' ? '잠시 후 메인 메뉴로 이동합니다' : 'Space를 눌렀다 떼면 메인 메뉴 · 14초 후 자동 복귀';
      lastStatus = ''; return;
    }
    const names = {main:'메인 메뉴',select:'스테이지·미니게임 선택',options:'설정',speed:'속도 설정',scroll:'스크롤 설정',slider:'수동 속도 설정'};
    status.textContent = `${names[menu.kind]} · ${running ? '실행 중' : '정지'}`;
    const selected = menu.kind === 'select' ? menu.stageMode ? `${menu.stage + 1}스테이지` : ['자동차','카드','깃발','두더지','퍼즐'][menu.mini] : menu.kind === 'slider' ? `속도 ${menu.selection}/209` : {main:['게임 시작','설정','종료'],options:['시스템 속도','스크롤'],speed:['자동','수동'],scroll:['A · 연속 이동','B · 화면 단위 이동']}[menu.kind][menu.selection];
    hud.textContent = `${selected} · ${menu.kind === 'select' ? '방향키 선택 · Space 영역 전환 · Enter 시작 · Esc 뒤로' : menu.kind === 'scroll' || menu.kind === 'slider' ? '← → 조절 · Enter 확인 · Esc 뒤로' : '↑ ↓ 선택 · Enter 확인 · 일시정지는 아래 버튼'}`;
    lastStatus = '';
    return;
  }
  if (world.ending) {
    world.ending.render.forEach(({name, x, y}, i) => ctx.drawImage(sprite(name, 'shin.pal', i !== 0), x, y));
    status.textContent = `${world.ending.mode === 'movie' ? '엔딩 연출' : '크레딧'} · ${world.ending.finished ? '완료' : running ? '실행 중' : '정지'}`;
    hud.textContent = world.ending.mode === 'movie' ? 'Space로 크레딧 · Esc 일시정지' : world.ending.finished ? '처음부터 다시 시작할 수 있어요.' : '크레딧이 끝나면 돌아갑니다 · Esc 일시정지';
    lastStatus = '';
    return;
  }
  if (world.stageEntry && !world.stageEntry.finished) {
    world.stageEntry.render.forEach(({ name, x, y }, i) => ctx.drawImage(sprite(name, 'shin.pal', i !== 0), x, y));
    status.textContent = `STAGE ${String(stageNumber).padStart(2, '0')} · ${STAGE_ENTRIES[world.stageEntry.stage].changesStage ? '종료 연출' : '진입 연출'} · ${running ? '실행 중' : '정지'}`;
    hud.textContent = 'Space로 연출 건너뛰기 · Esc 일시정지';
    lastStatus = '';
    return;
  }
  const mini = world.minigame;
  if (mini && !mini.finished && mini.render) {
    mini.render.forEach(({ name, x, y }, i) => ctx.drawImage(sprite(name, MINIGAME_ASSETS[mini.kind].palette, i !== 0), x, y));
    const name = {car: '자동차', flag: '깃발', mole: '두더지', card: '카드', puzzle: '퍼즐'}[mini.kind];
    status.textContent = `${name} 미니게임 · ${running ? '실행 중' : '정지'}`;
    hud.textContent = mini.kind === 'puzzle' ? mini.solved ? '퍼즐 완성! 잠시 후 본편으로 돌아갑니다.' : mini.canMove ? '방향키를 눌렀다 떼어 조각을 빈칸으로 밀기 · 그림을 완성하면 복귀' : '그림을 섞는 중…' : mini.kind === 'card' ? `방향키를 눌렀다 떼어 카드 이동 · Space 뒤집기 · 기회 ${mini.lives}` : mini.kind === 'mole' ? `방향키를 눌렀다 떼어 칸 이동 · Space 망치 · F6 복귀 · 점수 ${mini.score} · 남은 시간 ${mini.remaining}` : mini.kind === 'car' ? '← → 눌렀다 떼어 차선 이동 · 장애물을 피하세요' : `↑ 흰 깃발 올려 · ← 흰 깃발 내려 · → 청 깃발 올려 · ↓ 청 깃발 내려 · 기회 ${mini.lives}`;
    lastStatus = '';
    return;
  }
  const bosses = world.actors.filter((actor) => (isJungleBoss(actor.kind) || isFinalBoss(actor.kind) || [18, 32, 33, 122].includes(actor.kind)) && actor.active && !actor.removed);
  const inventoryOpen = world.inventory && !world.inventory.removed;
  if (!inventoryOpen) inventoryBackdrop = null;
  if (inventoryBackdrop) ctx.drawImage(inventoryBackdrop, 0, 0);
  else {
    drawWorld(bosses);
    if (inventoryOpen) {
      // 0x42eff0/0x42f060 restores the captured scene while contacts continue underneath.
      inventoryBackdrop = document.createElement('canvas');
      inventoryBackdrop.width = 640; inventoryBackdrop.height = 480;
      inventoryBackdrop.getContext('2d').drawImage(canvas, 0, 0);
    }
  }
  const scripted = Boolean(world.event);
  const counts = [player.balls, player.waterBombs, ...player.companionItems];
  if (inventoryOpen) {
    counts.forEach((count, row) => {
      for (let i = 0; i < count; i++) drawSprite(INVENTORY_IMAGES[row], 100 + i * 10, 100 + row * 40);
    });
    drawSprite('arrow.app', 60, 100 + world.inventory.cursor * 40);
  }
  const next = `STAGE ${String(stageNumber).padStart(2, '0')} · ${running ? inventoryOpen ? '아이템 선택 · ↑↓ 이동 · Enter 확인' : world.falling ? '낙하·착지 연출 중' : scripted ? world.event.kind === 112 ? '스테이지 종료 연출' : world.event.skippable === false ? '보스 등장 대화' : '대화 중 · Enter로 건너뛰기' : '실행 중' : '정지'} · X ${player.x} / Y ${player.y}`;
  if (next !== lastStatus) { status.textContent = next; lastStatus = next; }
  const form = player.booster ? '부스터' : player.flight ? '비행' : player.state.startsWith('chicken') ? '닭' : player.state.startsWith('roach') ? '바퀴벌레' : '짱구';
  const selected = inventoryOpen ? world.inventory.cursor : player.selectedItem;
  const score = `${form} · 목숨 ${player.lives} · 초코비 ${player.chocobi} · 캔 ${player.cans} · 점수 ${player.points} · ${player.booster ? '방향키 부스터 이동 · Space 발사' : player.flight ? '방향키 이동 · Space 3연사' : `${INVENTORY_LABELS[selected]} ${counts[selected]}개`}${bosses.length ? ` · 보스 체력 ${bosses.map((boss) => `${boss.health}/${boss.kind === 122 ? 30 : boss.kind === 33 ? 20 : 10}`).join(' · ')}` : ''}`;
  if (hud.textContent !== score) hud.textContent = score;
}

function drawWorld(bosses) {
  ctx.fillStyle = `rgb(${palette[0]}, ${palette[1]}, ${palette[2]})`;
  ctx.fillRect(0, 0, 640, 480);
  ctx.drawImage(gradient, 0, 0, 32, 1, 0, 0, 640, 480);
  ctx.drawImage(gradient, 0, map.height * 32 - 480 - camera.y, 640, 480);
  const fromX = Math.max(0, Math.floor(camera.x / 32));
  const fromY = Math.max(0, Math.floor(camera.y / 32));
  const toX = Math.min(map.width, fromX + 21);
  const toY = Math.min(map.height, fromY + 16);
  for (let y = fromY; y < toY; y++) {
    for (let x = fromX; x < toX; x++) {
      const index = (y * map.width + x) * 5;
      const dx = x * 32 - camera.x, dy = y * 32 - camera.y;
      tile(tiles, map.cells[index], dx, dy);
      tile(tiles, map.cells[index + 1], dx, dy);
    }
  }
  for (const object of objects) {
    if (object.hidden || isSurfaceKind(object.kind) || isActorKind(object.kind)) continue;
    if (object.kind === 118 && world.triggers.some((trigger) => trigger.kind === 118 && trigger.removed)) continue;
    const x = object.x - camera.x, y = object.y - camera.y;
    if (x + object.width < 0 || x > 640 || y + object.height < 0 || y > 480) continue;
    ctx.drawImage(sprite(object.name), x, y);
  }
  for (const actor of world.actors) {
    if (!actor.active || actor.removed || actor.kind === 95) continue;
    drawSprite(actorSprite(actor), actor.collected ? actor.screenX : actor.x - camera.x,
      actor.collected ? actor.screenY : actor.y - camera.y, isEnemy(actor) && !actor.scripted && Boolean(actor.facing));
  }
  for (const boss of bosses) {
    if (boss.scripted) continue;
    const y = [40, 41].includes(boss.kind) ? 90 : 50;
    drawSprite(isJungleBoss(boss.kind) || isFinalBoss(boss.kind) ? STAGE2_ACTORS[boss.kind].headImage : boss.kind === 122 ? BOOSTER_BOSS.headImage : boss.kind === 33 ? FLIGHT_BOSS.headImage : boss.kind === 32 ? STAGE2_BOSS.headImage : 'ryoko_h.app', 10, y);
    for (let i = 0; i < boss.health; i++) drawSprite(boss.kind === 32 ? STAGE2_BOSS.healthImage : 'rlife.app', 50 + i * 20, y);
  }
  for (const shot of world.projectiles) {
    drawSprite(shot.type === 67 ? FINAL_BOSS_SHOTS[67].images[0] : shot.type === 94 ? FINAL_PROJECTILE.name : shot.type === 97 ? JUNGLE_PROJECTILE.name : shot.type === 70 ? boosterShotSprite(shot) : FLIGHT_BULLETS[shot.type]?.image ?? (shot.type === 35 ? FLIGHT_LASER.image : shot.variant === 'boss2' ? BOSS2_PROJECTILE_IMAGE : [68, 93, 98, 99].includes(shot.type) ? obstacleSprite(shot) : shot.type === 95 ? shot.vx < 0 ? 'tan_l.app' : 'tan_r.app' : shot.type === 66 ? 'wbomb.app' : 'ball.app'), shot.x - camera.x, shot.y - camera.y, shot.type === 94 ? shot.vx > 0 : [68, 70, 99].includes(shot.type) && Boolean(shot.facing));
  }
  for (const splash of world.splashes) {
    if (!splash.removed) drawSprite('boom.app', splash.x - camera.x, splash.y - camera.y);
  }
  for (const surface of world.surfaces) {
    if (surface.active && !surface.removed) drawSprite(surfaceSprite(surface), surface.x - camera.x, surface.y - camera.y);
  }
  for (const npc of world.npcs) {
    if (!npc.removed) drawSprite(eventNpcSprite(npc), npc.x - camera.x, npc.y - camera.y);
  }
  for (const actor of world.actors) {
    if (actor.kind === 95 && actor.active && !actor.removed) drawSprite(actorSprite(actor), actor.x - camera.x, actor.y - camera.y);
  }
  if (world.companion && !world.companion.born) drawSprite(companionSprite(world.companion), world.companion.screenX, world.companion.screenY);
  for (const rabbit of world.rabbits) {
    if (!rabbit.born) drawSprite(`ymoexa${String.fromCharCode(97 + rabbit.frame)}.app`, rabbit.x - camera.x, rabbit.y - camera.y);
  }
  const scripted = Boolean(world.event);
  if (world.event?.kind === 118) {
    for (const { name, x, y } of introSprites(world.event, player)) drawSprite(name, x - camera.x, y - camera.y);
  } else if (world.falling) {
    const { name, x, y } = fallSprite(player);
    drawSprite(name, x - camera.x, y - camera.y);
  } else if (scripted) {
    for (const { name, x, y } of eventPlayerSprites(player)) drawSprite(name, x - camera.x, y - camera.y);
  } else if (player.invulnerable % 5 === 0) drawSprite(playerSprite(player), player.x - camera.x, player.y - camera.y, !player.facing);
  drawSprite(dogSprite(world.dog), world.dog.screenX, world.dog.screenY);
  for (let i = 0; i < player.lives; i++) drawSprite('life.app', 110 + i * 50, 420);
}

function loadStage(number, weaponTest = false) {
  stageNumber = number;
  const source = number > 3 ? number - 1 : number;
  map = decodeMap(archive.get(number === 3 ? 'shoot.map' : `stage${source}.map`));
  mask = decodeImage(archive.get(number === 3 ? 'sblock.app' : `block${source}.app`));
  tiles = sprite(number === 3 ? 'stile.app' : `tile${source}.app`);
  objects = readStageObjects(map, characterConfig, archive);
  document.querySelector('#stage-label').textContent = number === 1 ? '첫 스테이지' : number === 3 ? '슈팅' : weaponTest ? '2스테이지 · 아이템 구간' : `${number}스테이지`;
  document.querySelector('#cover-stage').textContent = `STAGE ${String(number).padStart(2, '0')}`;
  secondBossPreview.disabled = number !== 2;
  flightBossPreview.disabled = number !== 3;
  boosterBossPreview.disabled = number !== 4;
  jungleBossPreview.disabled = number !== 5;
}

function showProgress(saved = true) {
  progressStatus.textContent = `스테이지 해금 ${unlockedStages}/7 · 미니게임 해금 ${unlocks.reduce((sum, value) => sum + value, 0)}/5${saved ? '' : ' · 저장할 수 없어 이번 실행에서만 유지됩니다'}`;
}

function resetPreview(mode = 'start') {
  stopSounds();
  menu = null; minigameFromMenu = false; frameClock = createFrameClock(); inventoryBackdrop = null;
  gameTime = 0;
  loadStage(mode.startsWith('final') || mode === 'puzzle' ? 7 : mode.startsWith('ice') || mode === 'card' ? 6 : ['jungle', 'jungleEnemy', 'jungleSpring', 'jungleBridge', 'jungleBoss'].includes(mode) ? 5 : ['booster', 'boosterBoss'].includes(mode) ? 4 : ['flight', 'flightBoss'].includes(mode) ? 3 : ['weapons', 'cave', 'dialogue', 'boss2', 'mole'].includes(mode) ? 2 : 1, mode === 'weapons');
  world = createWorld(objects, map, world?.randomSeed, world);
  player = createPlayer(0, 0);
  if (mode === 'start') {
    world.stageEntry = createStageEntry(stageNumber);
    player.moveEnabled = false;
  }
  if (mode === 'flight') { enterFlight(player); world.stageEntry = createStageEntry(3); }
  if (mode === 'booster') { enterBooster(player); world.stageEntry = createStageEntry(4); }
  if (mode === 'jungle') world.stageEntry = createStageEntry(5);
  if (mode === 'ice') world.stageEntry = createStageEntry(6);
  if (mode === 'final') world.stageEntry = createStageEntry(7);
  if (mode === 'finalEnemy') player = createPlayer(16220, 3032);
  if (mode === 'finalFire') player = createPlayer(7680, 1820);
  if (mode === 'finalBoss') player = createPlayer(18130, 2810);
  if (mode === 'finalDialogue') {
    const trigger = objects.find(object => object.kind === 114);
    player = createPlayer(trigger.x - 65, trigger.y - 150);
  }
  if (mode === 'finalEnding') { world.ending = createEnding(gameTime); playSounds(world.ending.startSounds); }
  if (mode === 'puzzle') {
    const portal = objects.find(object => object.kind === 125);
    player = createPlayer(portal.x - 100, portal.y - 100);
  }
  const icePosition = {iceBridge: [9920, 2378], iceRock: [28140, 1232], iceEnemy: [29100, 1150], iceBat: [34700, 2200]}[mode];
  if (icePosition) player = createPlayer(...icePosition);
  if (mode === 'iceDialogue' || mode === 'iceExit') {
    const trigger = objects.find(object => object.kind === (mode === 'iceDialogue' ? 108 : 112));
    player = createPlayer(trigger.x - 65, trigger.y - 150);
  }
  if (mode === 'jungleEnemy') player = createPlayer(4450, 4200);
  if (mode === 'jungleSpring') player = createPlayer(2940, 6232);
  if (mode === 'jungleBridge') player = createPlayer(19840, 5065);
  if (mode === 'jungleBoss') player = createPlayer(24520, 6232);
  if (mode === 'boosterBoss') { player = createPlayer(9550, 2850); enterBooster(player); }
  if (mode === 'flightBoss') { player = createPlayer(37900, 200); enterFlight(player); }
  if (mode === 'enemy') {
    const first = objects.filter((object) => object.kind === 1).sort((a, b) => a.x - b.x)[0];
    player = createPlayer(first.x - 320, first.y);
  }
  if (mode === 'weapons') player = createPlayer(4540, 800);
  if (mode === 'cave') player = createPlayer(5000, 2800);
  if (mode === 'dialogue') {
    const trigger = objects.filter((object) => object.kind === 71).sort((a, b) => b.x - a.x)[0];
    player = createPlayer(trigger.x - 65, trigger.y - 100);
  }
  if (mode === 'boss') player = createPlayer(24680, 3096);
  if (mode === 'boss2') player = createPlayer(22800, 3032);
  if (mode === 'mole') {
    const portal = objects.find((object) => object.kind === 87);
    player = createPlayer(portal.x - 74, portal.y);
  }
  if (mode === 'car' || mode === 'flag' || mode === 'card') {
    const portal = objects.find((object) => object.kind === (mode === 'card' ? 126 : mode === 'car' ? 123 : 124));
    player = createPlayer(portal.x - 100, portal.y);
  }
  const sample = (x, y) => collisionAt(map, mask, x, y);
  if (!mode.startsWith('ice') && !mode.startsWith('final') && !['puzzle', 'start', 'weapons', 'flight', 'flightBoss', 'booster', 'boosterBoss', 'jungle', 'jungleEnemy', 'jungleSpring', 'jungleBridge', 'jungleBoss'].includes(mode)) for (let i = 0; i < 500; i++) stepPlayer(player, {}, sample);
  if (player.y >= map.height * 32 || player.hazard) throw new Error('시작 지형을 확인할 수 없습니다.');
  camera = { x: mode !== 'start' ? Math.max(0, player.x + 38 - 170) : 0, y: 0 };
  if (!['start', 'flight', 'flightBoss', 'booster', 'boosterBoss', 'jungle', 'ice', 'final'].includes(mode)) for (let i = 0; i < 300; i++) followCamera(camera, player, map);
  if (mode === 'boosterBoss') camera = {x: 9400, y: 2500};
  if (mode === 'flightBoss') camera = { x: 37700, y: 0 };
  if (mode === 'boss2') camera = { x: 22500, y: 2719 };
  if (mode === 'jungleBoss') camera = {x: 24200, y: 5919};
  if (mode === 'finalBoss') camera = {x: 17800, y: 2719};
  camera.scrollMode = cameraMode(player, world.event, preferences?.scroll ?? 0);
  player.screenX = player.x - camera.x; player.screenY = player.y - camera.y;
  playSounds(initializeWorldCamera(world, player, camera, Math.floor(gameTime)));
  keys.clear();
  draw();
}

function measureBlits(kind = 'main') {
  const image = sprite(kind === 'main' ? MENU.main.background : SETTINGS[kind].background, 'tt0002.pal', false);
  const start = performance.now();
  for (let i = 0; i < 10; i++) ctx.drawImage(image, 0, 0);
  return performance.now() - start;
}

function openMenu(kind = 'main') {
  stopSounds(); minigameFromMenu = false; inventoryBackdrop = null;
  if (kind === 'main') menu = createMainMenu(Math.floor(gameTime));
  else if (TITLE_SCENES[kind]) menu = createTitleScene(kind);
  else if (kind === 'select') menu = selectionMenu = createSelection(unlockedStages, unlocks, selectionMenu);
  else menu = createSettings(kind, preferences);
  document.querySelector('#stage-label').textContent = '메인 메뉴';
  document.querySelector('#cover-stage').textContent = 'MENU';
}

function startSelectedStage(number) {
  stopSounds(); menu = null; minigameFromMenu = false; inventoryBackdrop = null;
  loadStage(number);
  world = createWorld(objects, map, world?.randomSeed, world);
  player = createPlayer(0, 0); player.moveEnabled = false;
  if (number === 3) enterFlight(player);
  if (number === 4) enterBooster(player);
  world.stageEntry = createStageEntry(number, Math.floor(gameTime));
  camera = {x:0,y:0}; frameClock = createFrameClock();
  camera.scrollMode = cameraMode(player, world.event, preferences.scroll);
  playSounds(initializeWorldCamera(world, player, camera, Math.floor(gameTime)));
  const progress = enterSavedStage(storage, unlockedStages, number);
  unlockedStages = progress.count; showProgress(progress.saved);
}

function updateMenu() {
  const input = {up:keys.has('ArrowUp'),down:keys.has('ArrowDown'),left:keys.has('ArrowLeft'),right:keys.has('ArrowRight'),space:keys.has(' '),enter:keys.has('Enter'),back:keys.has('Escape'),draw:frameClock.draw};
  const settings = Boolean(SETTINGS[menu.kind]);
  const elapsed = settings && !input.enter && menu.enterHeld && (menu.kind === 'slider' || menu.kind === 'speed' && !menu.selection) ? measureBlits(menu.kind) : 0;
  const effects = settings ? stepSettings(menu,input,elapsed) : TITLE_SCENES[menu.kind] ? stepTitleScene(menu,input,Math.floor(gameTime)) : stepMenu(menu,input,Math.floor(gameTime));
  if (settings) {
    for (const key of ['factor','delay','scroll','boost','saveSpeed']) preferences[key] = menu[key];
    if (menu.saveSpeed && menu.removed && !saveSpeed(storage,preferences)) progressStatus.textContent = '속도 설정은 이번 실행에서만 유지됩니다. 브라우저에 저장할 수 없습니다.';
  }
  if (menu.quit) {
    setRunning(false); title.textContent = '게임을 종료했어요'; message.textContent = '메뉴를 열어 다시 시작할 수 있어요.';
    play.textContent = pause.textContent = '메뉴 열기'; return;
  }
  // shortcut: overlapping native menu instances from simultaneous confirm/back need the modal scheduler audit.
  for (const {target,stage} of effects.requests) {
    if (target === 'stage') startSelectedStage(stage + 1);
    else if (MINIGAME_ASSETS[target]) {
      stopSounds(); menu = null; minigameFromMenu = true;
      world.stageEntry = null; world.ending = null;
      openMinigame(world,target).fromMenu = true;
      prepareMinigameSounds(target);
    } else openMenu(target);
  }
  playSounds(effects.sounds);
}

function setRunning(value) {
  if (!ready) return;
  if (value && menu?.quit) openMenu();
  if (value && !menu && !minigameFromMenu && (player.dead || !player.hazard && player.y >= map.height * 32 || world.stageComplete || world.ending?.finished)) resetPreview();
  running = value;
  if (value) {
    if (soundEnabled) for (const audio of pausedSounds) playAudio(audio);
    pausedSounds.clear();
    resumeCarSound();
  } else {
    for (const pair of sounds.values()) for (const audio of pair) {
      if (!audio.paused && !audio.ended) { pausedSounds.add(audio); audio.pause(); }
    }
  }
  keys.clear();
  lastTime = performance.now();
  cover.hidden = value;
  pause.textContent = value ? '일시정지' : '계속하기';
  if (value) canvas.focus();
  else { title.textContent = '잠깐 쉬어 가요'; message.textContent = '준비되면 이어서 움직여 보세요.'; play.textContent = '계속하기'; }
  draw();
}

function frame(time) {
  if (ready && running) {
    gameTime += time - lastTime;
    // Flip pacing follows requestAnimationFrame; the native camera alone adds a millisecond wait.
    // shortcut: original Windows timer granularity and skipped-draw actor ordering still need a full runtime comparison.
    for (let tick = 0; tick < 3; tick++) {
      // Startup logos run before the original main menu loads speed.dat.
      const factor = menu?.kind === 'opening' ? 1 : preferences.factor, boost = preferences.boost;
      if (menu) {
        updateMenu();
        if (finishFrameTick(frameClock,factor,boost).present || !running) break;
        continue;
      }
      const cameraRuns = cameraActive(world);
      if (cameraRuns && !cameraWaitReady(frameClock,Math.floor(gameTime),preferences.delay)) break;
      const priorEvent = world.event;
      const priorMinigame = world.minigame;
      const priorEndingMode = world.ending?.mode;
      const minigameWasRunning = priorMinigame && !priorMinigame.finished;
      const entryWasRunning = world.stageEntry && !world.stageEntry.finished;
      camera.scrollMode = cameraMode(player, world.event, preferences.scroll);
      const clips = cameraRuns ? advanceWorldCamera(world, player, camera, stageNumber, Math.floor(gameTime)) : [];
      clips.push(...stepWorld(world, player, { left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'), jump: keys.has('ArrowUp'), down: keys.has('ArrowDown'), fire: keys.has(' '), enter: keys.has('Enter'), exit: keys.has('F6') }, camera, (x, y) => collisionAt(map, mask, x, y), Math.floor(gameTime)));
      if (player.respawnRequested) {
        stopSounds(); world = restartWorld(world, objects);
        resetCameraOrigin(camera); camera.scrollMode = cameraMode(player, world.event, preferences.scroll);
        player.respawnRequested = false;
        playSounds(initializeWorldCamera(world, player, camera, Math.floor(gameTime)));
        break;
      }
      if (world.ending?.finished) {
        openMenu();
        break;
      }
      if (priorEndingMode === 'movie' && world.ending.mode === 'credits') stopSounds(ENDING.startSounds.map(clip => clip.name));
      if (world.stageComplete) {
        const dog = world.dog;
        stopSounds();
        const fromStage = stageNumber, advances = world.stageEntry?.transitions || 1;
        if (!STAGE_ENTRIES[stageNumber + advances]) {
          setRunning(false);
          title.textContent = '마지막 스테이지입니다';
          message.textContent = '더 진행할 스테이지가 없습니다.';
          play.textContent = pause.textContent = '처음부터';
          break;
        }
        loadStage(stageNumber + advances);
        const progress = enterSavedStage(storage, unlockedStages, stageNumber);
        unlockedStages = progress.count;
        showProgress(progress.saved);
        world = createWorld(objects, map, world?.randomSeed, world);
        world.stageEntry = createStageEntry(stageNumber, Math.floor(gameTime));
        world.dog = dog;
        for (let i = 0; i < advances; i++) enterNextStage(player, fromStage + i);
        if (stageNumber === 3) enterFlight(player);
        else if (stageNumber === 4) enterBooster(player);
        else { player.flight = false; player.booster = false; }
        resetCameraOrigin(camera); camera.scrollMode = cameraMode(player, world.event, preferences.scroll);
        playSounds(initializeWorldCamera(world, player, camera, Math.floor(gameTime)));
        break;
      }
      if (world.minigame !== priorMinigame) {
        stopSounds();
        prepareMinigameSounds(world.minigame.kind);
        unlocks[world.minigame.unlockIndex] = 1;
        const saved = saveUnlocks(storage, unlocks);
        showProgress(saved);
      }
      if (minigameWasRunning && priorMinigame.finished) {
        stopSounds();
        if (minigameFromMenu) {
          menu = selectionMenu; menu.musicPlaying = 0; minigameFromMenu = false;
          break;
        }
      }
      if (entryWasRunning && world.stageEntry.finished) stopSounds(Object.values(STAGE_ENTRIES[stageNumber].cues));
      else if (priorEvent && !world.event) stopSounds(priorEvent.kind === 118 ? INTRO_SOUNDS : EVENT_SOUNDS[priorEvent.kind]);
      else playSounds(clips);
      const present = finishFrameTick(frameClock,factor,boost).present;
      if (!minigameFromMenu && (player.dead || !player.hazard && player.y >= map.height * 32)) {
        if (player.dead) { openMenu('gameover'); break; }
        setRunning(false);
        title.textContent = player.dead ? '다시 도전해 볼까요?' : '위험 지형에 닿았어요';
        message.textContent = '다시 시작하려면 버튼을 누르세요.';
        play.textContent = '다시 시작';
        pause.textContent = '다시 시작';
        break;
      }
      if (present) break;
    }
    draw();
  }
  lastTime = time;
  requestAnimationFrame(frame);
}

play.addEventListener('click', () => setRunning(true));
pause.addEventListener('click', () => setRunning(!running));
reset.addEventListener('click', () => { resetPreview(); setRunning(true); });
menuButton.addEventListener('click', () => { openMenu(); setRunning(true); });
encounter.addEventListener('click', () => { resetPreview('enemy'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
weaponPreview.addEventListener('click', () => { resetPreview('weapons'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
bossPreview.addEventListener('click', () => { resetPreview('boss'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
carPreview.addEventListener('click', () => { resetPreview('car'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
flagPreview.addEventListener('click', () => { resetPreview('flag'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
molePreview.addEventListener('click', () => { resetPreview('mole'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
cavePreview.addEventListener('click', () => { resetPreview('cave'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
dialoguePreview.addEventListener('click', () => { resetPreview('dialogue'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
secondBossPreview.addEventListener('click', () => {
  if (stageNumber !== 2) return;
  const before = player;
  resetPreview('boss2');
  for (const key of ['lives', 'points', 'chocobi', 'cans', 'balls', 'waterBombs', 'bananas', 'selectedItem']) player[key] = before[key];
  player.companionItems = [...before.companionItems];
  setRunning(true); canvas.scrollIntoView({ block: 'center' });
});
flightPreview.addEventListener('click', () => { resetPreview('flight'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
boosterPreview.addEventListener('click', () => { resetPreview('booster'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
junglePreview.addEventListener('click', () => { resetPreview('jungle'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
jungleEnemyPreview.addEventListener('click', () => { resetPreview('jungleEnemy'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
jungleSpringPreview.addEventListener('click', () => { resetPreview('jungleSpring'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
jungleBridgePreview.addEventListener('click', () => { resetPreview('jungleBridge'); setRunning(true); canvas.scrollIntoView({ block: 'center' }); });
stagePreviews.forEach(button => button.addEventListener('click', () => {
  resetPreview(button.dataset.stagePreview); setRunning(true); canvas.scrollIntoView({block: 'center'});
}));
jungleBossPreview.addEventListener('click', () => {
  if (stageNumber !== 5 || player.dead) return;
  const before = player;
  resetPreview('jungleBoss');
  for (const key of ['lives', 'points', 'chocobi', 'cans', 'balls', 'waterBombs', 'bananas', 'selectedItem']) player[key] = before[key];
  player.companionItems = [...before.companionItems]; player.jungleItems = [...before.jungleItems];
  setRunning(true); canvas.scrollIntoView({block: 'center'});
});
flightBossPreview.addEventListener('click', () => {
  if (stageNumber !== 3 || player.dead) return;
  const before = player;
  resetPreview('flightBoss');
  for (const key of ['lives', 'points', 'chocobi', 'cans', 'balls', 'waterBombs', 'bananas', 'selectedItem']) player[key] = before[key];
  player.companionItems = [...before.companionItems];
  setRunning(true); canvas.scrollIntoView({ block: 'center' });
});
boosterBossPreview.addEventListener('click', () => {
  if (stageNumber !== 4 || player.dead) return;
  const before = player;
  resetPreview('boosterBoss');
  for (const key of ['lives', 'points', 'chocobi', 'cans', 'balls', 'waterBombs', 'bananas', 'selectedItem']) player[key] = before[key];
  player.companionItems = [...before.companionItems];
  setRunning(true); canvas.scrollIntoView({ block: 'center' });
});
window.addEventListener('keydown', (event) => {
  if (!ready || event.target.matches('button, input, summary, a')) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(event.key) || (event.key === 'F6' && world.minigame?.kind === 'mole' && !world.minigame.finished)) {
    event.preventDefault();
    if (running) keys.add(event.key);
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (menu && running) keys.add(event.key);
    else if (!event.repeat) setRunning(!running);
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.key));
window.addEventListener('blur', () => { if (running) setRunning(false); });
document.addEventListener('visibilitychange', () => { if (document.hidden && running) setRunning(false); });
document.querySelector('#fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector('.screen').requestFullscreen();
  } catch { status.textContent = '이 브라우저에서는 전체 화면을 사용할 수 없습니다.'; }
});
soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundButton.textContent = soundEnabled ? '소리 끄기' : '소리 켜기';
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
  if (!soundEnabled) stopSounds();
  else resumeCarSound();
});

try {
  const [bytes, config] = await Promise.all([fetchBytes(`${assetRoot}RESOURCE.RES`), fetchBytes(`${assetRoot}RESOURCE/CHAR.CFG`)]);
  try { storage = window.localStorage; } catch { storage = null; }
  unlocks = loadUnlocks(storage, FRESH_MINIGAME_UNLOCKS);
  unlockedStages = loadStageProgress(storage, FRESH_STAGE_COUNT);
  showProgress();
  archive = readArchive(bytes);
  characterConfig = config;
  palette = decodePalette(archive.get('shin.pal'));
  gradient = sprite('gra.app');
  let factor;
  for (let i = 0; i < 3; i++) factor = calibrationFactor(measureBlits());
  preferences = {...loadSpeed(storage,{factor,delay:factor*16}),scroll:0,boost:0,saveSpeed:0};
  [...Object.values(EVENT_SOUNDS).flat(), ...INTRO_SOUNDS, ...ENDING.startSounds.map(clip => clip.name), ...MENU.main.sounds, MENU.select.music, MENU.select.moveSound, SETTINGS.speed.confirm, ...Object.values(STAGE_ENTRIES).flatMap((entry) => Object.values(entry.cues))].forEach(soundPair);
  resetPreview();
  openMenu('opening');
  ready = true;
  stagePreviews.forEach(button => { button.disabled = false; });
  play.disabled = pause.disabled = reset.disabled = menuButton.disabled = encounter.disabled = weaponPreview.disabled = bossPreview.disabled = carPreview.disabled = flagPreview.disabled = molePreview.disabled = cavePreview.disabled = dialoguePreview.disabled = flightPreview.disabled = boosterPreview.disabled = junglePreview.disabled = jungleEnemyPreview.disabled = jungleSpringPreview.disabled = jungleBridgePreview.disabled = false;
  title.textContent = '짱구는 못말려';
  message.textContent = '시작 화면 뒤 메인 메뉴로 이동합니다';
  play.textContent = '게임 시작';
  draw();
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  title.textContent = '게임 데이터를 불러오지 못했어요';
  message.textContent = `${error.message} — 프로젝트 루트에서 npm start로 실행해 주세요.`;
  status.textContent = '로딩 실패';
}
