// scripts/art/png-utils.mjs
// Lightweight, dependency-free PNG encoder, decoder, and pixel canvas for World of 308

import zlib from 'zlib';

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([typeBuf, data]);
  const crc = crc32(typeAndData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

export function encodePng(width, height, rgbaBuffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // 8 bits per channel
  ihdr[9] = 6;  // RGBA color type
  ihdr[10] = 0; // deflate compression
  ihdr[11] = 0; // default filter
  ihdr[12] = 0; // non-interlaced
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter byte: None
    rgbaBuffer.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idatChunk = makeChunk('IDAT', zlib.deflateSync(raw, { level: 9 }));
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

export function decodePng(buf) {
  let offset = 8;
  let width = 0, height = 0, colorType = 0;
  const idatParts = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.slice(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  const decompressed = zlib.inflateSync(Buffer.concat(idatParts));
  const bpp = colorType === 6 ? 4 : (colorType === 2 ? 3 : 1);
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let srcOffset = 0;
  const prevLine = Buffer.alloc(stride);
  const currLine = Buffer.alloc(stride);

  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  for (let y = 0; y < height; y++) {
    const filter = decompressed[srcOffset++];
    for (let x = 0; x < stride; x++) {
      const raw = decompressed[srcOffset++];
      const a = (x >= bpp ? currLine[x - bpp] : 0);
      const b = prevLine[x];
      const c = (x >= bpp ? prevLine[x - bpp] : 0);
      let val = 0;
      if (filter === 0) val = raw;
      else if (filter === 1) val = (raw + a) & 0xff;
      else if (filter === 2) val = (raw + b) & 0xff;
      else if (filter === 3) val = (raw + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) val = (raw + paeth(a, b, c)) & 0xff;
      currLine[x] = val;
    }
    for (let i = 0; i < width; i++) {
      const dstIdx = (y * width + i) * 4;
      out[dstIdx] = currLine[i * bpp];
      out[dstIdx + 1] = currLine[i * bpp + 1];
      out[dstIdx + 2] = currLine[i * bpp + 2];
      out[dstIdx + 3] = (bpp === 4 ? currLine[i * bpp + 3] : 255);
    }
    currLine.copy(prevLine);
  }
  return { width, height, data: out };
}

export class PixelCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.buffer = Buffer.alloc(width * height * 4);
  }

  fill(r, g, b, a = 255) {
    for (let i = 0; i < this.width * this.height; i++) {
      this.buffer[i * 4] = r;
      this.buffer[i * 4 + 1] = g;
      this.buffer[i * 4 + 2] = b;
      this.buffer[i * 4 + 3] = a;
    }
  }

  setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = (y * this.width + x) * 4;
    if (a === 255) {
      this.buffer[idx] = r;
      this.buffer[idx + 1] = g;
      this.buffer[idx + 2] = b;
      this.buffer[idx + 3] = a;
    } else if (a > 0) {
      const dstA = this.buffer[idx + 3];
      const factor = a / 255;
      const invFactor = 1 - factor;
      this.buffer[idx] = Math.round(r * factor + this.buffer[idx] * invFactor);
      this.buffer[idx + 1] = Math.round(g * factor + this.buffer[idx + 1] * invFactor);
      this.buffer[idx + 2] = Math.round(b * factor + this.buffer[idx + 2] * invFactor);
      this.buffer[idx + 3] = Math.min(255, dstA + a);
    }
  }

  fillRect(x, y, w, h, r, g, b, a = 255) {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        this.setPixel(px, py, r, g, b, a);
      }
    }
  }

  strokeRect(x, y, w, h, r, g, b, a = 255, strokeWidth = 1) {
    for (let i = 0; i < strokeWidth; i++) {
      // top & bottom
      for (let px = x; px < x + w; px++) {
        this.setPixel(px, y + i, r, g, b, a);
        this.setPixel(px, y + h - 1 - i, r, g, b, a);
      }
      // left & right
      for (let py = y; py < y + h; py++) {
        this.setPixel(x + i, py, r, g, b, a);
        this.setPixel(x + w - 1 - i, py, r, g, b, a);
      }
    }
  }

  drawHLine(x1, x2, y, r, g, b, a = 255) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    for (let x = minX; x <= maxX; x++) this.setPixel(x, y, r, g, b, a);
  }

  drawVLine(x, y1, y2, r, g, b, a = 255) {
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y++) this.setPixel(x, y, r, g, b, a);
  }

  drawCircle(cx, cy, radius, r, g, b, a = 255, strokeWidth = 1) {
    for (let y = -radius - strokeWidth; y <= radius + strokeWidth; y++) {
      for (let x = -radius - strokeWidth; x <= radius + strokeWidth; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d >= radius - strokeWidth / 2 && d <= radius + strokeWidth / 2) {
          this.setPixel(cx + x, cy + y, r, g, b, a);
        }
      }
    }
  }

  fillCircle(cx, cy, radius, r, g, b, a = 255) {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radius * radius) {
          this.setPixel(cx + x, cy + y, r, g, b, a);
        }
      }
    }
  }

  blit(srcCanvas, dstX, dstY, srcX = 0, srcY = 0, w = srcCanvas.width, h = srcCanvas.height) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sX = srcX + x;
        const sY = srcY + y;
        if (sX < 0 || sX >= srcCanvas.width || sY < 0 || sY >= srcCanvas.height) continue;
        const sIdx = (sY * srcCanvas.width + sX) * 4;
        const sA = srcCanvas.buffer[sIdx + 3];
        if (sA > 0) {
          this.setPixel(
            dstX + x, dstY + y,
            srcCanvas.buffer[sIdx],
            srcCanvas.buffer[sIdx + 1],
            srcCanvas.buffer[sIdx + 2],
            sA
          );
        }
      }
    }
  }

  draw9Patch(patchCanvas, dstX, dstY, dstW, dstH, top, right, bottom, left) {
    const pW = patchCanvas.width;
    const pH = patchCanvas.height;
    const cW = pW - left - right;
    const cH = pH - top - bottom;
    const targetCW = dstW - left - right;
    const targetCH = dstH - top - bottom;

    // 1. Top-left corner
    this.blit(patchCanvas, dstX, dstY, 0, 0, left, top);
    // 2. Top-right corner
    this.blit(patchCanvas, dstX + dstW - right, dstY, pW - right, 0, right, top);
    // 3. Bottom-left corner
    this.blit(patchCanvas, dstX, dstY + dstH - bottom, 0, pH - bottom, left, bottom);
    // 4. Bottom-right corner
    this.blit(patchCanvas, dstX + dstW - right, dstY + dstH - bottom, pW - right, pH - bottom, right, bottom);

    // 5. Top border stretch
    for (let x = 0; x < targetCW; x++) {
      const srcPx = left + (x % cW);
      this.blit(patchCanvas, dstX + left + x, dstY, srcPx, 0, 1, top);
    }
    // 6. Bottom border stretch
    for (let x = 0; x < targetCW; x++) {
      const srcPx = left + (x % cW);
      this.blit(patchCanvas, dstX + left + x, dstY + dstH - bottom, srcPx, pH - bottom, 1, bottom);
    }
    // 7. Left border stretch
    for (let y = 0; y < targetCH; y++) {
      const srcPy = top + (y % cH);
      this.blit(patchCanvas, dstX, dstY + top + y, 0, srcPy, left, 1);
    }
    // 8. Right border stretch
    for (let y = 0; y < targetCH; y++) {
      const srcPy = top + (y % cH);
      this.blit(patchCanvas, dstX + dstW - right, dstY + top + y, pW - right, srcPy, right, 1);
    }
    // 9. Center stretch
    for (let y = 0; y < targetCH; y++) {
      const srcPy = top + (y % cH);
      for (let x = 0; x < targetCW; x++) {
        const srcPx = left + (x % cW);
        this.blit(patchCanvas, dstX + left + x, dstY + top + y, srcPx, srcPy, 1, 1);
      }
    }
  }

  toPng() {
    return encodePng(this.width, this.height, this.buffer);
  }
}
