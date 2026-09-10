import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { exactMediaOverrides } from "../src/data/mediaConfig.js";

export const root = path.resolve(import.meta.dirname, "..");
export const publicRoot = path.join(root, "public");
export const pageKeys = ["home", "experiences", "reservation", "blog", "chambres", "galerie"];

const authoredFiles = [
  "index.html",
  "src/components/ExactIllustratorPage.jsx",
  "src/data/exactOverlays.js",
  "src/data/mediaConfig.js",
  "src/data/pageConfig.js",
  "src/styles/styles.css",
];

export async function collectRuntimeAssets() {
  const assets = new Set();
  const content = JSON.parse(await readFile(path.join(root, "src", "data", "siteContent.json"), "utf8"));
  for (const [page, pageContent] of Object.entries(content.pages || {})) {
    if (pageContent.background) assets.add(pageContent.background);
    for (const media of pageContent.media || []) {
      if (media.replacementFile) {
        assets.add(media.replacementFile);
        continue;
      }
      const bounds = media.bounds || {};
      const backdrop = Number(bounds.width || 0) >= Number(pageContent.artboard?.width || 0) * 0.9 && Number(bounds.height || 0) >= Number(pageContent.artboard?.width || 0);
      const hero = Number(bounds.y || 0) < 0 && Number(bounds.width || 0) >= Number(pageContent.artboard?.width || 0) * 0.9;
      if (backdrop || hero) continue;
      const override = exactMediaOverrides[page]?.[media.id];
      if (override?.src) assets.add(override.src);
      else if (media.src) assets.add(media.src);
    }
  }

  for (const relativePath of authoredFiles) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    for (const match of source.matchAll(/\/assets\/[A-Za-z0-9_./-]+/g)) {
      if (path.posix.extname(match[0])) assets.add(match[0]);
    }
  }

  for (const page of pageKeys) assets.add(`/assets/illustrator-text/${page}-text.svg`);
  return [...assets].sort();
}

export function publicFilePath(assetPath) {
  return path.join(publicRoot, ...assetPath.replace(/^\//, "").split("/"));
}

export function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function describeAsset(assetPath) {
  const filePath = publicFilePath(assetPath);
  const details = await stat(filePath);
  return {
    path: assetPath,
    bytes: details.size,
    sha256: await hashFile(filePath),
  };
}

export function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
