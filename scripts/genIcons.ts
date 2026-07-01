/**
 * Rasterizes the app icon SVG into the PNG sizes the PWA manifest needs.
 * Run with: npx tsx scripts/genIcons.ts
 */
import sharp from "sharp";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dirname, "../public");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F4C2C2" />
      <stop offset="1" stop-color="#D4849A" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)" />
  <g fill="#ffffff" transform="translate(256 256) scale(6.4) translate(-32 -32)">
    <path d="M32 18c-4 0-7 2-9 4-2-2-5-4-9-4v26c4 0 7 2 9 4 2-2 5-4 9-4V18z" opacity="0.97"/>
    <path d="M32 18c4 0 7 2 9 4 2-2 5-4 9-4v26c-4 0-7 2-9 4-2-2-5-4-9-4V18z" opacity="0.78"/>
  </g>
  <circle cx="256" cy="256" r="22" fill="#C9A961"/>
</svg>
`;

async function main() {
  const buf = Buffer.from(svg);
  for (const size of [192, 512]) {
    await sharp(buf)
      .resize(size, size)
      .png()
      .toFile(resolve(PUBLIC, `icon-${size}.png`));
    console.log(`Wrote public/icon-${size}.png`);
  }
  // Apple touch icon (opaque, no transparency).
  await sharp(buf).resize(180, 180).png().toFile(resolve(PUBLIC, "apple-touch-icon.png"));
  console.log("Wrote public/apple-touch-icon.png");
}

main();
