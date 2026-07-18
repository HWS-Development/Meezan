import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import siteContent from "../src/data/siteContent.json" with { type: "json" };
import {
  pageConfigs,
  pageKeys as configuredPageKeys,
  pagePaths,
  textActions,
} from "../src/data/pageConfig.js";
import { exactOverlays } from "../src/data/exactOverlays.js";
import {
  carouselSourcePools,
  customArrowHotspots,
  exactMediaOverrides,
  heroMediaBoxes,
} from "../src/data/mediaConfig.js";
import {
  collectRuntimeAssets,
  describeAsset,
  hashFile,
  pageKeys,
  pngDimensions,
  publicFilePath,
  root,
} from "./runtime-assets.mjs";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const sameValues = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

assert(sameValues(pageKeys, configuredPageKeys), "Configured page keys differ from the delivery page set.");
assert(sameValues(pageKeys, Object.keys(pageConfigs)), "pageConfigs does not define exactly six delivery pages.");
assert(sameValues(pageKeys, Object.keys(siteContent.pages || {})), "siteContent.json does not define exactly six delivery pages.");
assert(sameValues(pageKeys, Object.keys(pagePaths)), "pagePaths does not define exactly six delivery pages.");

for (const page of pageKeys) {
  const content = siteContent.pages[page];
  const config = pageConfigs[page];
  assert(content?.artboard?.width === config?.width, `${page}: configured width differs from Illustrator content.`);
  assert(content?.artboard?.height === config?.height, `${page}: configured height differs from Illustrator content.`);
  assert(!content?.backgroundError, `${page}: background export contains an error.`);

  const textIds = (content?.text || []).map((item) => item.id);
  const mediaIds = (content?.media || []).map((item) => item.id);
  assert(new Set(textIds).size === textIds.length, `${page}: duplicate text IDs.`);
  assert(new Set(mediaIds).size === mediaIds.length, `${page}: duplicate media IDs.`);
  for (const [textId, action] of Object.entries(textActions[page] || {})) {
    assert(textIds.includes(textId), `${page}: action targets missing text frame ${textId}.`);
    assert(Boolean(action.href) !== Boolean(action.action), `${page}/${textId}: action must define exactly one of href or action.`);
    if (action.action) assert(pageKeys.includes(action.action), `${page}/${textId}: unknown route action ${action.action}.`);
  }
  for (const media of content?.media || []) {
    assert(media.exported !== false, `${page}/${media.id}: media export failed.`);
    if (media.replacementFile) {
      assert(media.replacementFile.startsWith("/assets/") && media.replacementFile.toLowerCase().endsWith(".png"), `${page}/${media.id}: replacementFile must be a public PNG /assets path.`);
      const bounds = exactMediaOverrides[page]?.[media.id] || media.bounds;
      const bakedBackdrop = media.bounds.width >= content.artboard.width * 0.9 && media.bounds.height >= content.artboard.width;
      const bakedHero = media.bounds.y < 0 && media.bounds.width >= content.artboard.width * 0.9;
      assert(!bakedBackdrop && !bakedHero, `${page}/${media.id}: baked hero/backdrop media must be changed in Illustrator, not replacementFile.`);
      try {
        const dimensions = pngDimensions(await readFile(publicFilePath(media.replacementFile)));
        assert(dimensions?.width === Math.round(bounds.width) && dimensions?.height === Math.round(bounds.height), `${page}/${media.id}: replacement PNG must be exactly ${Math.round(bounds.width)}x${Math.round(bounds.height)}.`);
      } catch {
        failures.push(`${page}/${media.id}: replacement asset is missing or invalid.`);
      }
    }
  }

  for (const [mediaId, override] of Object.entries(exactMediaOverrides[page] || {})) {
    assert(mediaIds.includes(mediaId), `${page}: exact media override targets missing media ${mediaId}.`);
    assert(override.x >= 0 && override.y >= 0 && override.x + override.width <= content.artboard.width && override.y + override.height <= content.artboard.height, `${page}/${mediaId}: exact media bounds leave the artboard.`);
  }
  for (const overlay of exactOverlays[page] || []) {
    assert(overlay.x >= 0 && overlay.y >= 0 && overlay.x + overlay.width <= content.artboard.width && overlay.y + overlay.height <= content.artboard.height, `${page}/${overlay.src}: exact overlay bounds leave the artboard.`);
  }
  for (const hotspot of customArrowHotspots[page] || []) {
    assert(hotspot.x >= 0 && hotspot.y >= 0 && hotspot.x + hotspot.w <= content.artboard.width && hotspot.y + hotspot.h <= content.artboard.height, `${page}/${hotspot.label}: hotspot bounds leave the artboard.`);
    if (hotspot.targetY != null) assert(hotspot.targetY >= 0 && hotspot.targetY <= content.artboard.height, `${page}/${hotspot.label}: scroll target leaves the artboard.`);
    for (const mediaId of hotspot.ids || (hotspot.id ? [hotspot.id] : [])) {
      assert(mediaIds.includes(mediaId), `${page}/${hotspot.label}: hotspot targets missing media ${mediaId}.`);
    }
  }

  if (heroMediaBoxes[page]) {
    const hero = heroMediaBoxes[page];
    assert(hero.x >= 0 && hero.y >= 0 && hero.x + hero.width <= content.artboard.width && hero.y + hero.height <= content.artboard.height, `${page}: hero media box leaves the artboard.`);
  }

  for (const [assetPath, label] of [
    [content.background, "background"],
    [`/assets/illustrator-text/${page}-text.png`, "text raster"],
  ]) {
    try {
      const dimensions = pngDimensions(await readFile(publicFilePath(assetPath)));
      assert(dimensions?.width === content.artboard.width && dimensions?.height === content.artboard.height, `${page}: ${label} dimensions are not ${content.artboard.width}x${content.artboard.height}.`);
    } catch {
      failures.push(`${page}: missing ${label} ${assetPath}.`);
    }
  }
}

for (const [page, pools] of Object.entries(carouselSourcePools)) {
  assert(pageKeys.includes(page), `Carousel configuration uses unknown page ${page}.`);
  const values = Array.isArray(pools) ? pools : Object.values(pools).flat();
  for (const assetPath of values) assert(assetPath.startsWith("/assets/"), `${page}: carousel source must be a public asset path.`);
}

const lockPath = path.join(root, "delivery", "runtime-assets.lock.json");
let lock;
try {
  lock = JSON.parse(await readFile(lockPath, "utf8"));
} catch {
  failures.push("Missing or invalid delivery/runtime-assets.lock.json.");
  lock = { assets: [] };
}

const currentAssets = await collectRuntimeAssets();
const lockedAssets = (lock.assets || []).map((item) => item.path);
assert(sameValues(currentAssets, lockedAssets), "Runtime asset inventory changed without explicit approval.");
const lockByPath = new Map((lock.assets || []).map((item) => [item.path, item]));
for (const assetPath of currentAssets) {
  try {
    const current = await describeAsset(assetPath);
    const approved = lockByPath.get(assetPath);
    assert(current.bytes === approved?.bytes && current.sha256 === approved?.sha256, `${assetPath}: runtime asset differs from the approved lock.`);
  } catch (error) {
    failures.push(`${assetPath}: ${error.message}`);
  }
}

const illustratorManifest = JSON.parse(await readFile(path.join(root, "public", "assets", "illustrator", "manifest.json"), "utf8"));
for (const page of pageKeys) {
  const entry = illustratorManifest.pages?.[page];
  assert(Boolean(entry), `${page}: missing Illustrator manifest entry.`);
  if (!entry) continue;
  try {
    assert(await hashFile(entry.source) === entry.sourceSha256, `${page}: Illustrator source hash changed since export.`);
  } catch (error) {
    failures.push(`${page}: cannot verify Illustrator source: ${error.message}`);
  }
  try {
    const textPng = publicFilePath(entry.textPng);
    assert(await hashFile(textPng) === entry.textPngDetails.sha256, `${page}: text PNG hash differs from Illustrator manifest.`);
  } catch (error) {
    failures.push(`${page}: cannot verify text PNG: ${error.message}`);
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

if (process.argv.includes("--dist")) {
  const distRoot = path.join(root, "dist");
  const distFiles = await walk(distRoot);
  let distBytes = 0;
  for (const filePath of distFiles) {
    distBytes += (await stat(filePath)).size;
    if (/\.(html|js|css|json|svg)$/i.test(filePath)) {
      const source = await readFile(filePath, "utf8");
      assert(!/[A-Za-z]:\\Users\\/i.test(source), `${path.relative(distRoot, filePath)} exposes an absolute local path.`);
    }
  }
  assert(distBytes <= 200 * 1024 * 1024, `Deployment package exceeds 200 MiB: ${(distBytes / 1048576).toFixed(2)} MiB.`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, pages: pageKeys.length, approvedRuntimeAssets: currentAssets.length }, null, 2));
