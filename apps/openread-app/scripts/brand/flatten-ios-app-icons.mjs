#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const IOS_ICON_DIR = new URL('../../src-tauri/icons/ios/', import.meta.url);
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

for (const filename of readdirSync(IOS_ICON_DIR)
  .filter((name) => name.endsWith('.png'))
  .sort()) {
  const filePath = join(IOS_ICON_DIR.pathname, filename);
  const png = decodePng(readFileSync(filePath));
  if (png.bitDepth !== 8 || png.interlace !== 0 || ![2, 6].includes(png.colorType)) {
    throw new Error(`Unsupported PNG format for ${filename}`);
  }

  const rgb = png.colorType === 6 ? flattenRgbaToWhite(png) : png.data;
  writeFileSync(filePath, encodeRgbPng({ width: png.width, height: png.height, data: rgb }));
  console.log(`flattened ${filename} -> ${png.width}x${png.height} RGB`);
}

function decodePng(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('Invalid PNG signature');

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const channels = colorType === 6 ? 4 : 3;
  const bytesPerPixel = channels;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const raw = Buffer.alloc(height * stride);
  let inputOffset = 0;
  let outputOffset = 0;
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const scanline = Buffer.from(inflated.subarray(inputOffset, inputOffset + stride));
    inputOffset += stride;
    unfilterScanline(scanline, previous, filter, bytesPerPixel);
    scanline.copy(raw, outputOffset);
    outputOffset += stride;
    previous = scanline;
  }

  return { width, height, bitDepth, colorType, interlace, data: raw };
}

function unfilterScanline(scanline, previous, filter, bytesPerPixel) {
  for (let x = 0; x < scanline.length; x += 1) {
    const left = x >= bytesPerPixel ? scanline[x - bytesPerPixel] : 0;
    const up = previous[x] ?? 0;
    const upperLeft = x >= bytesPerPixel ? (previous[x - bytesPerPixel] ?? 0) : 0;

    if (filter === 1) scanline[x] = (scanline[x] + left) & 0xff;
    else if (filter === 2) scanline[x] = (scanline[x] + up) & 0xff;
    else if (filter === 3) scanline[x] = (scanline[x] + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) scanline[x] = (scanline[x] + paeth(left, up, upperLeft)) & 0xff;
    else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
  }
}

function flattenRgbaToWhite({ width, height, data }) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let source = 0, target = 0; source < data.length; source += 4, target += 3) {
    const alpha = data[source + 3] / 255;
    rgb[target] = Math.round(data[source] * alpha + 255 * (1 - alpha));
    rgb[target + 1] = Math.round(data[source + 1] * alpha + 255 * (1 - alpha));
    rgb[target + 2] = Math.round(data[source + 2] * alpha + 255 * (1 - alpha));
  }
  return rgb;
}

function encodeRgbPng({ width, height, data }) {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', createIhdr(width, height)),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function createIhdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 2;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])) >>> 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function paeth(left, up, upperLeft) {
  const p = left + up - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upperLeft;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
