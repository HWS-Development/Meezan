import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectRuntimeAssets, root } from "./runtime-assets.mjs";

const distRoot = path.join(root, "dist");
const assetsRoot = path.join(distRoot, "assets");

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

const runtimeAssets = new Set(await collectRuntimeAssets());
const files = await walk(assetsRoot);
let removedFiles = 0;
let removedBytes = 0;
let keptBytes = 0;

for (const filePath of files) {
  const relative = `/assets/${path.relative(assetsRoot, filePath).replace(/\\/g, "/")}`;
  const generatedBundle = /^\/assets\/index-[^/]+\.(css|js)$/.test(relative);
  const details = await stat(filePath);
  if (generatedBundle || runtimeAssets.has(relative)) {
    keptBytes += details.size;
    continue;
  }
  removedFiles++;
  removedBytes += details.size;
  await rm(filePath, { force: true });
}

for (const directory of (await readdir(assetsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory())) {
  const directoryPath = path.join(assetsRoot, directory.name);
  if ((await walk(directoryPath)).length === 0) await rm(directoryPath, { recursive: true, force: true });
}

const report = { removedFiles, removedBytes, keptAssetBytes: keptBytes, runtimeAssets: runtimeAssets.size };
await writeFile(path.join(distRoot, "prune-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
