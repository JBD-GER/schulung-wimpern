import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

const root = process.cwd();
const markSource = await readFile(
  join(root, "public", "brand", "logo-mark-source.png"),
);

async function markPng(size, options = {}) {
  const { background, markScale = 1 } = options;
  const markSize = Math.round(size * markScale);
  const renderedMark = await sharp(markSource)
    .resize(markSize, markSize)
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (!background && markSize === size) return renderedMark;

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: renderedMark,
        left: Math.round((size - markSize) / 2),
        top: Math.round((size - markSize) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function ico(images) {
  const headerSize = 6 + images.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = headerSize;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });

  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

const [
  favicon16,
  favicon32,
  favicon48,
  logoMark,
  emailMark,
  app192,
  app512,
  appleIcon,
] = await Promise.all([
  markPng(16),
  markPng(32),
  markPng(48),
  markPng(512),
  markPng(96),
  markPng(192, { background: "#FBF9F6", markScale: 0.82 }),
  markPng(512, { background: "#FBF9F6", markScale: 0.82 }),
  markPng(180, { background: "#FBF9F6", markScale: 0.82 }),
]);

await Promise.all([
  writeFile(
    join(root, "src", "app", "favicon.ico"),
    ico([
      { size: 16, data: favicon16 },
      { size: 32, data: favicon32 },
      { size: 48, data: favicon48 },
    ]),
  ),
  writeFile(
    join(root, "public", "brand", "favicon-selected-32.png"),
    favicon32,
  ),
  writeFile(join(root, "public", "brand", "logo-mark-selected.png"), logoMark),
  writeFile(
    join(root, "public", "brand", "brand-email-selected.png"),
    emailMark,
  ),
  writeFile(join(root, "public", "brand", "app-icon-selected-192.png"), app192),
  writeFile(join(root, "public", "brand", "app-icon-selected-512.png"), app512),
  writeFile(
    join(root, "public", "brand", "apple-touch-icon-selected.png"),
    appleIcon,
  ),
]);

console.log("Brand assets generated.");
