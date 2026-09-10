import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const contentPath = path.join(root, "src", "data", "siteContent.json");

function inputDirectory() {
  const inputFlag = process.argv.indexOf("--input");
  const value = inputFlag >= 0 ? process.argv[inputFlag + 1] : process.env.MEEZAN_OUTPUT_DIR;
  if (!value) throw new Error("Pass --input <Illustrator audit directory> or set MEEZAN_OUTPUT_DIR.");
  return path.resolve(value);
}

function normalizedText(value) {
  return String(value || "").replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim();
}

function distance(left, right) {
  return Math.hypot(
    Number(left.bounds?.x || 0) - Number(right.geometricBounds?.x || 0),
    Number(left.bounds?.y || 0) - Number(right.geometricBounds?.y || 0),
  );
}

function colorHex(color) {
  if (color?.typename === "RGBColor") {
    return `#${[color.red, color.green, color.blue].map((value) => Math.round(Number(value || 0)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  if (color?.typename === "GrayColor") {
    const value = Math.round(255 * (1 - Number(color.gray || 0) / 100));
    const channel = value.toString(16).padStart(2, "0");
    return `#${channel}${channel}${channel}`.toUpperCase();
  }
  return "#000000";
}

function boundsFrom(frame) {
  const bounds = frame.geometricBounds;
  return {
    left: bounds.left,
    top: bounds.top,
    right: bounds.right,
    bottom: bounds.bottom,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    rightOnPage: bounds.x + bounds.width,
    bottomOnPage: bounds.y + bounds.height,
  };
}

function styleFrom(frame, fallback) {
  const style = frame.runs?.[0]?.style;
  if (!style) return fallback;
  return {
    font: style.font || fallback?.font || { name: "", family: "", style: "" },
    size: style.size,
    leading: style.leading,
    tracking: style.tracking,
    horizontalScale: style.horizontalScale,
    verticalScale: style.verticalScale,
    capitalization: style.capitalization,
    color: colorHex(style.fillColor),
    justification: style.justification,
  };
}

function assignExactText(items, frames, assignments, usedFrames) {
  const candidates = [];
  for (const item of items) {
    for (const frame of frames) {
      if (normalizedText(item.value) !== normalizedText(frame.content)) continue;
      candidates.push({ item, frame, distance: distance(item, frame) });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance);
  for (const candidate of candidates) {
    if (assignments.has(candidate.item) || usedFrames.has(candidate.frame)) continue;
    assignments.set(candidate.item, candidate.frame);
    usedFrames.add(candidate.frame);
  }
}

function assignChangedText(items, frames, assignments, usedFrames) {
  const candidates = [];
  for (const item of items) {
    if (assignments.has(item)) continue;
    for (const frame of frames) {
      if (usedFrames.has(frame)) continue;
      candidates.push({ item, frame, distance: distance(item, frame) });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance);
  for (const candidate of candidates) {
    if (candidate.distance > 300 || assignments.has(candidate.item) || usedFrames.has(candidate.frame)) continue;
    assignments.set(candidate.item, candidate.frame);
    usedFrames.add(candidate.frame);
  }
}

const auditDirectory = inputDirectory();
const siteContent = JSON.parse(await readFile(contentPath, "utf8"));
const summary = [];

for (const [page, pageContent] of Object.entries(siteContent.pages || {})) {
  const audit = JSON.parse(await readFile(path.join(auditDirectory, `${page}.json`), "utf8"));
  const items = pageContent.text || [];
  const frames = audit.textFrames || [];
  const assignments = new Map();
  const usedFrames = new Set();
  assignExactText(items, frames, assignments, usedFrames);
  const exactMatches = assignments.size;
  assignChangedText(items, frames, assignments, usedFrames);

  const missing = items.filter((item) => !assignments.has(item));
  if (missing.length) throw new Error(`${page}: unmatched text IDs ${missing.map((item) => item.id).join(", ")}.`);

  for (const item of items) {
    const frame = assignments.get(item);
    item.value = frame.content;
    item.kind = frame.kind;
    item.bounds = boundsFrom(frame);
    item.style = styleFrom(frame, item.style);
  }
  summary.push({ page, frames: items.length, exactMatches, changedTextMatches: items.length - exactMatches });
}

await writeFile(contentPath, `${JSON.stringify(siteContent, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, pages: summary }, null, 2));
