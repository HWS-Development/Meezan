import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "public", "assets", "illustrator", "manifest.json");
const textDirectory = path.join(root, "public", "assets", "illustrator-text");
const pages = ["home", "experiences", "reservation", "blog", "chambres", "galerie"];

function option(name, environmentName) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : process.env[environmentName];
  if (index >= 0 && (!value || value.startsWith("--"))) throw new Error(`Pass a value after --${name}.`);
  return value ? path.resolve(value) : null;
}

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function portableFileName(filePath) {
  return path.posix.basename(String(filePath).replaceAll("\\", "/"));
}

function collectFonts(audit) {
  const fonts = new Map();
  for (const frame of audit.textFrames || []) {
    for (const run of frame.runs || []) {
      const font = run.style?.font;
      if (!font?.name) continue;
      fonts.set(font.name, {
        name: font.name,
        family: font.family || "",
        style: font.style || "",
      });
    }
  }
  return [...fonts.values()].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

async function inspectTextSvg(page, artboard) {
  const filePath = path.join(textDirectory, `${page}-text.svg`);
  const source = await readFile(filePath);
  const text = source.toString("utf8");
  const viewBox = text.match(/\bviewBox=["']([^"']+)["']/)?.[1] || "";
  const expectedViewBox = `0 0 ${artboard.width} ${artboard.height}`;
  if (viewBox !== expectedViewBox) {
    throw new Error(`${page}: expected text SVG viewBox ${expectedViewBox}, received ${viewBox || "none"}.`);
  }
  if (/&ns_[a-z]+;/i.test(text)) throw new Error(`${page}: unresolved Adobe namespace entity in text SVG.`);
  const pathCount = (text.match(/<path\b/g) || []).length;
  if (!pathCount) throw new Error(`${page}: text SVG contains no outlined paths.`);
  if (/<text\b/i.test(text)) throw new Error(`${page}: text SVG still contains live text.`);

  return {
    viewBox,
    byteSize: source.length,
    sha256: hash(source),
    pathCount,
    textOutlined: true,
  };
}

const auditDirectory = option("input", "MEEZAN_OUTPUT_DIR");
if (!auditDirectory) throw new Error("Pass --input <Illustrator audit directory> or set MEEZAN_OUTPUT_DIR.");
const sourceDirectory = option("sources", "MEEZAN_SOURCE_DIR");
if (!sourceDirectory) throw new Error("Pass --sources <Illustrator source directory> or set MEEZAN_SOURCE_DIR.");
const summary = JSON.parse(await readFile(path.join(auditDirectory, "summary.json"), "utf8"));
const generatedAt = new Date(summary.generatedAt);
if (Number.isNaN(generatedAt.getTime())) throw new Error("Illustrator audit summary has an invalid generatedAt value.");
if (!String(summary.illustratorVersion || "").trim()) throw new Error("Illustrator audit summary is missing illustratorVersion.");
const summaryPages = (summary.documents || []).map((document) => document.page).sort();
if (JSON.stringify(summaryPages) !== JSON.stringify([...pages].sort())) {
  throw new Error("Illustrator audit summary must contain exactly the six delivery pages.");
}
const summaryByPage = new Map(summary.documents.map((document) => [document.page, document]));
const manifest = {
  schemaVersion: 2,
  generatedAt: generatedAt.toISOString(),
  illustratorVersion: summary.illustratorVersion,
  geometryAuthority: "Text SVGs exported directly by Adobe Illustrator with all text converted to outlined paths.",
  pages: {},
};

for (const page of pages) {
  const auditPath = path.join(auditDirectory, `${page}.json`);
  const auditSource = await readFile(auditPath);
  const audit = JSON.parse(auditSource);
  const summaryDocument = summaryByPage.get(page);
  if (audit.page !== page) throw new Error(`${page}: audit page identifier is ${audit.page || "missing"}.`);
  const sourceFile = portableFileName(audit.source || audit.documentName);
  if (!sourceFile || sourceFile !== portableFileName(summaryDocument.source)) {
    throw new Error(`${page}: audit and summary reference different Illustrator sources.`);
  }
  if (audit.artboard?.width !== summaryDocument.artboard?.width || audit.artboard?.height !== summaryDocument.artboard?.height) {
    throw new Error(`${page}: audit and summary artboards differ.`);
  }
  if ((audit.textFrames || []).length !== summaryDocument.textFrameCount
    || (audit.placedItems || []).length !== summaryDocument.placedItemCount
    || (audit.rasterItems || []).length !== summaryDocument.rasterItemCount) {
    throw new Error(`${page}: audit and summary object counts differ.`);
  }
  const sourcePath = path.join(sourceDirectory, sourceFile);
  const source = await readFile(sourcePath);
  const sourceDetails = await stat(sourcePath);
  const artboard = { width: audit.artboard.width, height: audit.artboard.height };

  manifest.pages[page] = {
    page,
    sourceFile,
    sourceSha256: hash(source),
    sourceModifiedAt: sourceDetails.mtime.toISOString(),
    artboard,
    auditSha256: hash(auditSource),
    objectCountsByType: {
      TextFrame: (audit.textFrames || []).length,
      PlacedItem: (audit.placedItems || []).length,
      RasterItem: (audit.rasterItems || []).length,
    },
    fonts: collectFonts(audit),
    textSvg: `/assets/illustrator-text/${page}-text.svg`,
    textSvgDetails: await inspectTextSvg(page, artboard),
  };
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, pages: pages.length, manifest: path.relative(root, manifestPath) }, null, 2));
