import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const inputPath = path.join(root, "public", "assets", "illustrator-driven", "pages.json");
const outputPath = path.join(root, "src", "data", "siteContent.generated.json");

function textEntry(frame) {
  return {
    id: frame.id,
    value: frame.content || "",
    kind: frame.kind || "",
    editable: true,
    bounds: frame.bounds,
    style: {
      font: frame.font || { name: "", family: "", style: "" },
      size: frame.size || 0,
      leading: frame.leading || 0,
      tracking: frame.tracking || 0,
      horizontalScale: frame.horizontalScale || 100,
      verticalScale: frame.verticalScale || 100,
      capitalization: frame.capitalization || "",
      color: frame.fillColor?.hex || "#000000",
      justification: frame.justification || "",
    },
  };
}

function mediaEntry(item) {
  return {
    id: item.id,
    type: item.type || "media",
    src: item.src || "",
    exported: item.exported !== false,
    editable: true,
    replacementFile: "",
    bounds: item.bounds,
  };
}

const source = JSON.parse(await readFile(inputPath, "utf8"));
const pages = {};

for (const [key, page] of Object.entries(source.pages || {})) {
  pages[key] = {
      title: page.document,
      source: page.source,
      artboard: page.artboard,
      background: page.background || "",
      backgroundError: page.backgroundError || "",
      text: (page.textFrames || []).map(textEntry),
      media: (page.mediaItems || []).map(mediaEntry),
    };
}

await writeFile(
  outputPath,
  `${JSON.stringify({ generatedFrom: "public/assets/illustrator-driven/pages.json", updatedAt: new Date().toISOString(), pages }, null, 2)}\n`,
  "utf8",
);

console.log(`Generated comparison template written to ${path.relative(root, outputPath)}`);
