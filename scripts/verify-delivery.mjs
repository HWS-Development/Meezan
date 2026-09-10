import { execFile } from "node:child_process";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
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
const execFileAsync = promisify(execFile);
const verifyProvenance = process.argv.includes("--provenance");

function portableFileName(filePath) {
  return path.posix.basename(String(filePath || "").replaceAll("\\", "/"));
}

async function resolveIllustratorSource(entry) {
  if (!process.env.MEEZAN_SOURCE_DIR) throw new Error("set MEEZAN_SOURCE_DIR to the archived Illustrator source directory");
  const sourcePath = path.join(path.resolve(process.env.MEEZAN_SOURCE_DIR), entry.sourceFile);
  await access(sourcePath);
  return sourcePath;
}

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
  ]) {
    try {
      const dimensions = pngDimensions(await readFile(publicFilePath(assetPath)));
      assert(dimensions?.width === content.artboard.width && dimensions?.height === content.artboard.height, `${page}: ${label} dimensions are not ${content.artboard.width}x${content.artboard.height}.`);
    } catch {
      failures.push(`${page}: missing ${label} ${assetPath}.`);
    }
  }

  const textSvgPath = `/assets/illustrator-text/${page}-text.svg`;
  try {
    const textSvgFile = publicFilePath(textSvgPath);
    const textSvgSource = await readFile(textSvgFile);
    const textSvg = textSvgSource.toString("utf8");
    assert(new RegExp(`viewBox=["']0 0 ${content.artboard.width} ${content.artboard.height}["']`).test(textSvg), `${page}: text SVG viewBox differs from the Illustrator artboard.`);
    assert(!/&ns_[a-z]+;/i.test(textSvg), `${page}: text SVG contains unresolved Adobe namespace entities.`);
    assert(/<path\b/.test(textSvg), `${page}: text SVG does not contain outlined paths.`);
    assert(!/<text\b/i.test(textSvg), `${page}: text SVG still contains live text.`);
  } catch {
    failures.push(`${page}: missing or invalid text SVG ${textSvgPath}.`);
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

if (verifyProvenance) {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "-z", "--", "public/assets"], { cwd: root, encoding: "utf8" });
    const trackedAssets = new Set(stdout.split("\0").filter(Boolean));
    for (const assetPath of currentAssets) {
      assert(trackedAssets.has(`public${assetPath}`), `${assetPath}: runtime asset is not tracked by Git and will be missing after deployment.`);
    }
  } catch (error) {
    failures.push(`Cannot verify Git-tracked runtime assets: ${error.message}`);
  }
}

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
assert(illustratorManifest.schemaVersion === 2, "Illustrator manifest must use portable schema version 2.");
assert(sameValues(pageKeys, Object.keys(illustratorManifest.pages || {})), "Illustrator manifest must define exactly six delivery pages.");
assert(!Number.isNaN(Date.parse(illustratorManifest.generatedAt)), "Illustrator manifest generatedAt must be a valid date.");
assert(Boolean(String(illustratorManifest.illustratorVersion || "").trim()), "Illustrator manifest must record the Illustrator version.");
assert(Boolean(String(illustratorManifest.geometryAuthority || "").trim()), "Illustrator manifest must describe its geometry authority.");
for (const page of pageKeys) {
  const entry = illustratorManifest.pages?.[page];
  assert(Boolean(entry), `${page}: missing Illustrator manifest entry.`);
  if (!entry) continue;
  const expectedTextSvg = `/assets/illustrator-text/${page}-text.svg`;
  assert(entry.page === page, `${page}: Illustrator manifest page identifier differs.`);
  assert(typeof entry.sourceFile === "string" && entry.sourceFile.length > 0 && entry.sourceFile === portableFileName(entry.sourceFile), `${page}: Illustrator manifest sourceFile must be a non-empty portable filename.`);
  assert(!Object.hasOwn(entry, "source"), `${page}: Illustrator manifest must not expose a local source path.`);
  assert(/^[a-f0-9]{64}$/.test(entry.sourceSha256 || ""), `${page}: Illustrator manifest source hash is invalid.`);
  assert(/^[a-f0-9]{64}$/.test(entry.auditSha256 || ""), `${page}: Illustrator manifest audit hash is invalid.`);
  assert(entry.artboard?.width === pageConfigs[page].width && entry.artboard?.height === pageConfigs[page].height, `${page}: Illustrator manifest artboard differs from pageConfig.`);
  assert(entry.textSvg === expectedTextSvg, `${page}: Illustrator manifest textSvg must be ${expectedTextSvg}.`);
  assert(entry.textSvgDetails?.viewBox === `0 0 ${pageConfigs[page].width} ${pageConfigs[page].height}`, `${page}: Illustrator manifest text SVG viewBox differs.`);
  assert(entry.textSvgDetails?.textOutlined === true, `${page}: Illustrator manifest must confirm outlined text.`);
  if (verifyProvenance) {
    try {
      const sourcePath = await resolveIllustratorSource(entry);
      assert(await hashFile(sourcePath) === entry.sourceSha256, `${page}: Illustrator source hash changed since export.`);
    } catch (error) {
      failures.push(`${page}: cannot verify Illustrator source: ${error.message}`);
    }
  }
  try {
    const textSvg = publicFilePath(expectedTextSvg);
    const source = await readFile(textSvg);
    const text = source.toString("utf8");
    const pathCount = (text.match(/<path\b/g) || []).length;
    assert(await hashFile(textSvg) === entry.textSvgDetails?.sha256, `${page}: text SVG hash differs from Illustrator manifest.`);
    assert(source.length === entry.textSvgDetails?.byteSize, `${page}: text SVG byte size differs from Illustrator manifest.`);
    assert(pathCount === entry.textSvgDetails?.pathCount, `${page}: text SVG path count differs from Illustrator manifest.`);
  } catch (error) {
    failures.push(`${page}: cannot verify text SVG: ${error.message}`);
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
      const exposesLocalPath = /[A-Za-z]:[\\/]Users[\\/]/i.test(source)
        || /(?:^|[\s"'(=])\/(?:Users|home)\//m.test(source)
        || /file:\/\/(?:\/[A-Za-z]:|\/Users\/|\/home\/)/i.test(source);
      assert(!exposesLocalPath, `${path.relative(distRoot, filePath)} exposes an absolute local path.`);
    }
  }
  assert(distBytes <= 200 * 1024 * 1024, `Deployment package exceeds 200 MiB: ${(distBytes / 1048576).toFixed(2)} MiB.`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, provenance: verifyProvenance, pages: pageKeys.length, approvedRuntimeAssets: currentAssets.length }, null, 2));
