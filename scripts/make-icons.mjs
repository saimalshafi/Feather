/**
 * Generates PWA icons for F*eather.
 * Usage: node scripts/make-icons.mjs  (or: npm run icons)
 *
 * Outputs:
 *   public/icon-192.png          – standard 192×192
 *   public/icon-512.png          – standard 512×512
 *   public/icon-512-maskable.png – maskable 512×512 (20 % safe-zone padding)
 */

import sharp from "sharp";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

/** Build an SVG string at the given canvas size, with the text scaled to fit
 *  inside `innerSize` pixels (used to enforce the maskable safe-zone). */
function makeSvg(canvasSize, innerSize) {
  // Center the text block within the canvas
  const offset = (canvasSize - innerSize) / 2;

  // Scale the font so the text nearly fills the inner region.
  // "F*" in Impact at roughly 60 % of the inner size looks solid.
  const fontSize = Math.round(innerSize * 0.60);
  const cx = canvasSize / 2;
  const cy = canvasSize / 2 + fontSize * 0.32; // visual baseline nudge

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">
  <rect width="${canvasSize}" height="${canvasSize}" fill="#111111"/>
  <text
    x="${cx}"
    y="${cy}"
    font-family="Impact, 'Haettenschweiler', 'Arial Narrow Bold', sans-serif"
    font-size="${fontSize}"
    font-weight="900"
    fill="#FFFFFF"
    text-anchor="middle"
    dominant-baseline="auto"
  >F*</text>
</svg>`;
}

async function makeIcon(canvasSize, innerSize, filename) {
  const svg = Buffer.from(makeSvg(canvasSize, innerSize));
  const outPath = path.join(publicDir, filename);
  await sharp(svg, { density: 300 })
    .resize(canvasSize, canvasSize)
    .png()
    .toFile(outPath);
  console.log(`✓  ${filename}  (${canvasSize}×${canvasSize})`);
}

// Standard icons: text fills the full canvas
await makeIcon(192, 192, "icon-192.png");
await makeIcon(512, 512, "icon-512.png");

// Maskable icon: 20 % padding on each side → safe-zone = 60 % of canvas
const maskableInner = Math.round(512 * 0.60);
await makeIcon(512, maskableInner, "icon-512-maskable.png");

console.log("\nAll icons written to public/");
