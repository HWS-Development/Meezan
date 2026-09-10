import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const svgDirectory = path.join(root, "public", "assets", "illustrator");
const rasterDirectory = path.join(root, "public", "assets", "illustrator-raster");
const specDirectory = path.join(root, "public", "assets", "illustrator-spec");
const textDirectory = path.join(root, "public", "assets", "illustrator-text");
const assetReportPath = path.join(specDirectory, "asset-build-report.json");
const pages = ["home", "experiences", "reservation", "blog", "chambres", "galerie"];

function portableFileName(filePath) {
  return path.posix.basename(String(filePath).replaceAll("\\", "/"));
}

function resolveSource(filePath) {
  const sourceDirectory = process.env.MEEZAN_SOURCE_DIR;
  return sourceDirectory ? path.join(path.resolve(sourceDirectory), portableFileName(filePath)) : filePath;
}

await mkdir(rasterDirectory, { recursive: true });

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function externalizeSvg(filePath) {
  let svg = await readFile(filePath, "utf8");
  const extracted = [];
  const embeddedPattern = /data:image\/(jpeg|png);base64,([^\"]*)/g;

  svg = svg.replace(embeddedPattern, (match, type, encoded) => {
    const bytes = Buffer.from(encoded.replace(/\s+/g, ""), "base64");
    const hash = hashBuffer(bytes);
    const extension = type === "jpeg" ? "jpg" : "png";
    const fileName = `${hash}.${extension}`;
    extracted.push({ fileName, bytes, sha256: hash, mime: `image/${type}` });
    return `/assets/illustrator-raster/${fileName}`;
  });

  for (const asset of extracted) {
    const outputPath = path.join(rasterDirectory, asset.fileName);
    try {
      await stat(outputPath);
    } catch {
      await writeFile(outputPath, asset.bytes);
    }
  }

  if (extracted.length) await writeFile(filePath, svg, "utf8");

  const externalReferences = [...svg.matchAll(/(?:xlink:href|href)="(\/assets\/illustrator-raster\/[^\"]+)"/g)]
    .map((match) => match[1]);
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
  const counts = {};
  for (const tag of ["path", "g", "image", "clipPath", "use", "rect", "circle", "ellipse", "polygon", "polyline", "line", "text"]) {
    counts[tag] = (svg.match(new RegExp(`<${tag}\\b`, "g")) || []).length;
  }

  return {
    viewBox: viewBoxMatch?.[1] || "",
    byteSize: (await stat(filePath)).size,
    sha256: await hashFile(filePath),
    embeddedImagesExternalized: extracted.length,
    externalImages: [...new Set(externalReferences)],
    elementCounts: counts,
    textOutlined: counts.text === 0,
  };
}

async function inspectPng(filePath) {
  const png = await readFile(filePath);
  if (png.length < 24 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || png.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error(`${filePath}: invalid PNG`);
  }

  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    byteSize: png.length,
    sha256: hashBuffer(png),
  };
}

const manifest = {
  reportType: "legacy-illustrator-asset-build",
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  geometryAuthority: "SVG exported directly by Adobe Illustrator with outlined text and coordinatePrecision=6.",
  pages: {},
};
const specSummary = {
  schemaVersion: 2,
  generatedAt: manifest.generatedAt,
  totalObjectCount: 0,
  files: [],
};

for (const page of pages) {
  const specPath = path.join(specDirectory, `${page}.json`);
  const svgPath = path.join(svgDirectory, `${page}-outline.svg`);
  const textPath = path.join(textDirectory, `${page}-text.svg`);
  const textPngPath = path.join(textDirectory, `${page}-text.png`);
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  const svg = await externalizeSvg(svgPath);
  const textSvg = await externalizeSvg(textPath);
  const textPng = await inspectPng(textPngPath);
  const artboard = spec.artboards[0]?.bounds;
  const expectedViewBox = `0 0 ${artboard.width} ${artboard.height}`;
  if (svg.viewBox !== expectedViewBox) {
    throw new Error(`${page}: expected SVG viewBox ${expectedViewBox}, received ${svg.viewBox}`);
  }
  if (!svg.textOutlined) throw new Error(`${page}: SVG still contains live text`);
  if (textSvg.viewBox !== expectedViewBox) {
    throw new Error(`${page}: expected text SVG viewBox ${expectedViewBox}, received ${textSvg.viewBox}`);
  }
  if (!textSvg.textOutlined) throw new Error(`${page}: text SVG still contains live text`);
  if (textPng.width !== artboard.width || textPng.height !== artboard.height) {
    throw new Error(`${page}: expected text PNG ${artboard.width}x${artboard.height}, received ${textPng.width}x${textPng.height}`);
  }

  const sourcePath = resolveSource(spec.source);
  const sourceStats = await stat(sourcePath);
  const sourceSha256 = await hashFile(sourcePath);
  const pageEntry = {
    page,
    sourceFile: portableFileName(spec.source),
    sourceSha256,
    sourceModifiedAt: sourceStats.mtime.toISOString(),
    artboard: { width: artboard.width, height: artboard.height },
    objectCount: spec.objectCount,
    objectCountsByType: spec.objectCountsByType,
    fonts: spec.fonts,
    spec: `/assets/illustrator-spec/${page}.json`,
    svg: `/assets/illustrator/${page}-outline.svg`,
    svgDetails: svg,
    textSvg: `/assets/illustrator-text/${page}-text.svg`,
    textSvgDetails: textSvg,
    textPng: `/assets/illustrator-text/${page}-text.png`,
    textPngDetails: textPng,
  };
  manifest.pages[page] = pageEntry;
  specSummary.totalObjectCount += spec.objectCount;
  specSummary.files.push(pageEntry);
}

const header = await externalizeSvg(path.join(svgDirectory, "header-outline.svg"));
if (header.viewBox !== "0 0 1920 189") throw new Error(`header: unexpected viewBox ${header.viewBox}`);
manifest.header = {
  sourcePage: "home",
  artboard: { width: 1920, height: 189 },
  svg: "/assets/illustrator/header-outline.svg",
  svgDetails: header,
};

await writeFile(assetReportPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(path.join(specDirectory, "summary.json"), `${JSON.stringify(specSummary, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  report: path.relative(root, assetReportPath),
  pages: pages.length,
  objects: specSummary.totalObjectCount,
  uniqueRasterAssets: new Set([
    ...Object.values(manifest.pages).flatMap((page) => page.svgDetails.externalImages),
    ...manifest.header.svgDetails.externalImages,
  ]).size,
  svgMiB: Number((Object.values(manifest.pages).reduce((sum, page) => sum + page.svgDetails.byteSize, 0) / 1048576).toFixed(2)),
  textSvgMiB: Number((Object.values(manifest.pages).reduce((sum, page) => sum + page.textSvgDetails.byteSize, 0) / 1048576).toFixed(2)),
  textPngMiB: Number((Object.values(manifest.pages).reduce((sum, page) => sum + page.textPngDetails.byteSize, 0) / 1048576).toFixed(2)),
}, null, 2));
