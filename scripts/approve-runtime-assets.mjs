import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectRuntimeAssets, describeAsset, root } from "./runtime-assets.mjs";

if (!process.argv.includes("--approve")) {
  throw new Error("Refusing to update the asset lock without --approve.");
}

const assets = await collectRuntimeAssets();
const entries = [];
for (const asset of assets) entries.push(await describeAsset(asset));

const outputDirectory = path.join(root, "delivery");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "runtime-assets.lock.json"),
  `${JSON.stringify({ schemaVersion: 1, assets: entries }, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify({ approvedAssets: entries.length, bytes: entries.reduce((sum, item) => sum + item.bytes, 0) }, null, 2));
