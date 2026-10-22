// Native 0x424e00: normalize queued offsets, scan entering edges, then queue the next movement.
export function cameraMode(player, event, preference) {
  if (player.flight) return 1; // 0x40dbb0 always installs B for shooting.
  if (player.booster || event && event.kind !== 118) return 0;
  return preference;
}

export function resetCameraOrigin(camera) {
  // 0x427900 resets coordinates but retains the global B-scroll pan state.
  camera.x = camera.y = camera.column = camera.row = camera.offsetX = camera.offsetY = 0;
}

export function advanceCamera(camera, player, map, stage = 1, flightStopped = false, onScan) {
  if (camera.column === undefined) {
    camera.column = Math.trunc(camera.x / 32); camera.row = Math.trunc(camera.y / 32);
    camera.offsetX = camera.x - camera.column * 32; camera.offsetY = camera.y - camera.row * 32;
  }
  camera.scrollMotion ??= 0;
  const scans = [];
  const scan = cell => {
    scans.push(cell);
    if (onScan) flightStopped = onScan(cell);
  };
  const horizontal = (right) => {
    for (let y = 0; y <= 15; y++) scan({secondary:false,column:camera.column+(right?20:0),row:camera.row+y});
    for (let y = -15; y <= 30; y++) scan({secondary:true,column:camera.column+(right?40:-20),row:camera.row+y});
  };
  const vertical = (down) => {
    for (let x = 0; x <= 20; x++) scan({secondary:false,column:camera.column+x,row:camera.row+(down?15:0)});
    for (let x = -20; x <= 40; x++) scan({secondary:true,column:camera.column+x,row:camera.row+(down?30:-15)});
  };
  if (camera.offsetX >= 32) {
    camera.offsetX -= 32;
    if (camera.column < map.width - 20) { camera.column++; horizontal(true); }
  }
  if (camera.offsetX < 0) {
    camera.offsetX += 32;
    if (camera.column > 0) { camera.column--; horizontal(false); }
  }
  if (camera.offsetY >= 32) {
    camera.offsetY -= 32;
    if (camera.row < map.height - 15) { camera.row++; vertical(true); }
  }
  if (camera.offsetY < 0) {
    camera.offsetY += 32;
    if (camera.row > 0) { camera.row--; vertical(false); }
  }
  camera.x = camera.column * 32 + camera.offsetX;
  camera.y = camera.row * 32 + camera.offsetY;
  const stepped = camera.scrollMode === 1, upper = stepped ? 200 : 240;
  const halfWidth = Math.trunc(player.width / 2), halfHeight = Math.trunc(player.height / 2);
  const limitX = () => {
    if (camera.column === 0 && camera.offsetX < 0) camera.offsetX = 0;
    if (map.width-camera.column === 21 && camera.offsetX >= 32) camera.offsetX = 31;
  };
  const limitY = () => {
    if (camera.row === 0 && camera.offsetY < 0) camera.offsetY = 0;
    if (map.height-camera.row === 16 && camera.offsetY >= 32) camera.offsetY = 31;
  };
  const relativeY = player.y-camera.y;
  if (stage === 3) {
    if (relativeY < upper) { camera.offsetY += Math.trunc((relativeY-upper)/2); limitY(); }
    if (relativeY > 280) { camera.offsetY += Math.trunc((relativeY-280)/2); limitY(); }
    if (!flightStopped) { camera.offsetX += 3; limitX(); }
    return scans;
  }
  if (!stepped) {
    let dx = Math.trunc((player.x+halfWidth-camera.x-(player.facing?170:470))/30);
    if (dx > 10 && player.vx < 10) dx = 10;
    if (dx < -10 && player.vx > -10) dx = -10;
    if (player.screenX+halfWidth > 560) dx = 16;
    if (player.screenX+halfWidth < 80) dx = -16;
    camera.offsetX += dx; limitX();
  }
  if (relativeY < upper || relativeY > 280) {
    let dy = Math.trunc((relativeY+halfHeight-(relativeY<upper?upper:280))/6);
    if (player.screenY+halfHeight > 400) dy = 32;
    if (player.screenY+halfHeight < 80) dy = -32;
    if (!stepped && dy !== 0 && Math.abs(dy) < 2) dy = Math.sign(dy)*2;
    camera.offsetY += dy; limitY();
  }
  if (stepped) {
    const center = player.x+halfWidth-camera.x;
    if (!camera.scrollMotion) {
      if (player.x-camera.x < 60) camera.scrollMotion = 1;
      if (player.x-camera.x > 520) camera.scrollMotion = 2;
    } else {
      camera.offsetX += camera.scrollMotion === 1 ? -30 : 30;
      if (camera.column === 0 && camera.offsetX < 0) camera.offsetX = 0;
      if (Math.abs((camera.scrollMotion === 1 ? 540 : 100)-center) < 60) camera.scrollMotion = 0;
    }
  }
  return scans;
}

export function initialCameraScan(camera, map) {
  const column = camera.column ?? Math.trunc(camera.x/32), row = camera.row ?? Math.trunc(camera.y/32), scans = [];
  for (let y = -15; y <= 30; y++) for (let x = -20; x <= 40; x++) {
    if (column+x < map.width && row+y < map.height) scans.push({secondary:true,column:column+x,row:row+y});
  }
  for (let y = 0; y <= 15; y++) for (let x = 0; x <= 20; x++) {
    if (column+x < map.width && row+y < map.height) scans.push({secondary:false,column:column+x,row:row+y});
  }
  return scans;
}
