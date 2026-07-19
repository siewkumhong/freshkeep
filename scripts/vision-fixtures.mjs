import sharp from "sharp";
import { JPEG_QUALITY } from "../lib/image-profile.ts";

const WIDTH = 3024;
const HEIGHT = 4032;
const originals = new Map();

export async function preparedFixtureImages(fixture, limits) {
  let original = originals.get(fixture.id);
  if (!original) {
    original = await createOriginalPair(fixture);
    originals.set(fixture.id, original);
  }
  const [item, date] = await Promise.all([
    resize(original.item, limits.item),
    resize(original.date, limits.date),
  ]);
  return { item, date };
}

export function imageDataUrl(buffer) {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function createOriginalPair(fixture) {
  const hue = hash(fixture.id) % 360;
  const itemSvg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="package" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="hsl(${hue} 58% 82%)"/>
          <stop offset="1" stop-color="hsl(${(hue + 35) % 360} 52% 58%)"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="#d9d4c8"/>
      <rect x="340" y="310" width="2344" height="3412" rx="160" fill="url(#package)"/>
      <rect x="520" y="780" width="1984" height="1900" rx="110" fill="#fffdf7" fill-opacity=".92"/>
      <text x="1512" y="1370" text-anchor="middle" font-family="Arial, sans-serif" font-size="126" font-weight="700" fill="#23362b">FRESHKEEP TEST</text>
      ${textLines(fixture.itemName.toUpperCase(), 1512, 1810, 190, 230, "#15251c")}
      <text x="1512" y="2930" text-anchor="middle" font-family="Arial, sans-serif" font-size="92" fill="#314b3b">KEEP REFRIGERATED</text>
      <text x="1512" y="3130" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" fill="#314b3b">NET 500 g</text>
    </svg>`;

  const labelSvg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="glare" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#c7c5bb"/>
          <stop offset=".55" stop-color="#efede4"/>
          <stop offset="1" stop-color="#bbb8ae"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#glare)"/>
      <rect x="240" y="1050" width="2544" height="1780" rx="55" fill="#f9f7ee" stroke="#4f504c" stroke-width="18"/>
      <text x="1512" y="1390" text-anchor="middle" font-family="Arial, sans-serif" font-size="92" font-weight="700" fill="#2d2e2b">DATE LABEL</text>
      ${fixture.label.map((line, index) => `<text x="1512" y="${1840 + index * 380}" text-anchor="middle" font-family="Arial, sans-serif" font-size="176" font-weight="700" fill="#171816">${escapeXml(line)}</text>`).join("")}
      <text x="1512" y="2640" text-anchor="middle" font-family="Arial, sans-serif" font-size="66" fill="#4f504c">BATCH FK-${String(hash(fixture.id)).slice(0, 5)}</text>
    </svg>`;

  const item = await sharp(Buffer.from(itemSvg)).jpeg({ quality: 92 }).toBuffer();
  let date = await sharp(Buffer.from(labelSvg)).jpeg({ quality: 92 }).toBuffer();
  if (fixture.effect === "blurred") {
    date = await sharp(date).blur(60).jpeg({ quality: 92 }).toBuffer();
  } else if (fixture.effect === "obscured") {
    const cover = Buffer.from(
      `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect x="620" y="1580" width="1784" height="520" rx="45" fill="#77766f"/></svg>`,
    );
    date = await sharp(date).composite([{ input: cover }]).jpeg({ quality: 92 }).toBuffer();
  }
  return { item, date };
}

function resize(buffer, maxEdge) {
  return sharp(buffer)
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
    .toBuffer();
}

function textLines(value, x, firstY, fontSize, lineHeight, color) {
  const words = value.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > 18 && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines
    .map(
      (text, index) =>
        `<text x="${x}" y="${firstY + index * lineHeight}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${color}">${escapeXml(text)}</text>`,
    )
    .join("");
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}

function hash(value) {
  let result = 0;
  for (const character of value) result = (result * 31 + character.charCodeAt(0)) >>> 0;
  return result;
}
