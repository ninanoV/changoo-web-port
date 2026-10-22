const viewOf = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export function readArchive(bytes) {
  if (bytes.length < 4) throw new Error('Truncated RES directory');
  const view = viewOf(bytes);
  const count = view.getUint32(0, true);
  const directoryEnd = 4 + count * 28;
  if (directoryEnd > bytes.length) throw new Error('Truncated RES directory');
  const archive = new Map();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const entry = 4 + i * 28;
    const name = decoder.decode(bytes.subarray(entry, entry + 20)).split('\0')[0];
    const offset = view.getUint32(entry + 20, true);
    const length = view.getUint32(entry + 24, true);
    if (offset < directoryEnd || offset + length > bytes.length) throw new Error(`RES range: ${name}`);
    if (!name || archive.has(name)) throw new Error(`Invalid RES name: ${name}`);
    archive.set(name, bytes.subarray(offset, offset + length));
  }
  return archive;
}

export function decodeImage(bytes) {
  if (!bytes || bytes.length < 12) throw new Error('Invalid APP length');
  const view = viewOf(bytes);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  const length = view.getUint32(8, true);
  if (!width || !height || width * height > 16_777_216) throw new Error('Invalid APP dimensions');
  if (length !== bytes.length - 12 || length % 2) throw new Error('Invalid APP length');
  const pixels = new Uint8Array(width * height);
  let position = 0;
  for (let i = 12; i < bytes.length; i += 2) {
    const end = position + bytes[i + 1];
    if (end > pixels.length) throw new Error('RLE exceeds image');
    pixels.fill(bytes[i], position, end);
    position = end;
  }
  if (position !== pixels.length) throw new Error('RLE incomplete image');
  return { width, height, pixels };
}

export function decodePalette(bytes) {
  if (!bytes || bytes.length !== 768) throw new Error('Invalid palette length');
  return Uint8Array.from(bytes, (channel) => (channel << 2) & 255);
}

export function decodeMap(bytes) {
  if (!bytes || bytes.length < 8) throw new Error('Invalid map header');
  const view = viewOf(bytes);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  if (!width || !height || width * height * 10 !== bytes.length - 8) throw new Error('Invalid map length');
  const cells = new Int16Array(width * height * 5);
  for (let i = 0; i < cells.length; i++) cells[i] = view.getInt16(8 + i * 2, true);
  return { width, height, cells };
}
