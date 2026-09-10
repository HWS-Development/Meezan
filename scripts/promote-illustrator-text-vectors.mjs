import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(root, "public", "assets", "illustrator-text");
const pageDimensions = {
  home: [1920, 12229],
  experiences: [1920, 16004],
  reservation: [1920, 4074],
  blog: [1920, 9235],
  chambres: [1920, 11568],
  galerie: [1920, 6098],
};

function inputDirectory() {
  const inputFlag = process.argv.indexOf("--input");
  const value = inputFlag >= 0 ? process.argv[inputFlag + 1] : process.env.MEEZAN_OUTPUT_DIR;
  if (inputFlag >= 0 && (!value || value.startsWith("--"))) throw new Error("Pass a value after --input.");
  if (!value) throw new Error("Pass --input <Illustrator export directory> or set MEEZAN_OUTPUT_DIR.");
  return path.resolve(value);
}

function requestedPages() {
  const pagesFlag = process.argv.indexOf("--pages");
  const value = pagesFlag >= 0 ? process.argv[pagesFlag + 1] : process.env.MEEZAN_PAGES;
  if (pagesFlag >= 0 && (!value || value.startsWith("--"))) throw new Error("Pass a value after --pages.");
  if (!value) return null;
  return new Set(value.split(",").map((page) => page.trim().toLowerCase()).filter(Boolean));
}

function sanitizeSvg(source, width, height) {
  const expectedViewBox = `0 0 ${width} ${height}`;
  if (!new RegExp(`viewBox=["']${expectedViewBox}["']`).test(source)) {
    throw new Error(`Expected viewBox ${expectedViewBox}.`);
  }

  let svg = source.replace(/\s+xmlns:(?:x|i|graph|a)="[^"]*"/g, "");
  svg = svg.replace(/<svg\b([^>]*)>/, (tag, attributes) => {
    const widthAttribute = /\swidth=/.test(attributes) ? "" : ` width="${width}"`;
    const heightAttribute = /\sheight=/.test(attributes) ? "" : ` height="${height}"`;
    return `<svg${attributes}${widthAttribute}${heightAttribute}>`;
  });

  if (/&ns_[a-z]+;/i.test(svg)) throw new Error("Adobe namespace entities remain after sanitizing.");
  if (!/<path\b/.test(svg)) throw new Error("SVG does not contain outlined paths.");
  if (/<text\b/i.test(svg)) throw new Error("SVG still contains live text.");
  return svg;
}

async function newestExport(directory, page) {
  const names = (await readdir(directory)).filter((name) => name.startsWith(`${page}-text`) && name.toLowerCase().endsWith(".svg"));
  if (!names.length) throw new Error(`${page}: no Illustrator SVG export found in ${directory}.`);

  const candidates = await Promise.all(names.map(async (name) => {
    const filePath = path.join(directory, name);
    return { filePath, modified: (await stat(filePath)).mtimeMs };
  }));
  candidates.sort((left, right) => right.modified - left.modified);
  return candidates[0].filePath;
}

const sourceDirectory = inputDirectory();
const pages = requestedPages();
const promoted = [];
for (const [page, [width, height]] of Object.entries(pageDimensions)) {
  if (pages && !pages.has(page)) continue;
  const sourcePath = await newestExport(sourceDirectory, page);
  const source = await readFile(sourcePath, "utf8");
  const destinationPath = path.join(outputDirectory, `${page}-text.svg`);
  const svg = sanitizeSvg(source, width, height);
  await writeFile(destinationPath, svg);
  promoted.push({ page, source: path.basename(sourcePath), bytes: Buffer.byteLength(svg) });
}

console.log(JSON.stringify({ ok: true, promoted }, null, 2));
