#target illustrator

(function () {
  var sourceDirectory = new Folder($.getenv("MEEZAN_SOURCE_DIR"));
  var outputDirectory = new Folder($.getenv("MEEZAN_OUTPUT_DIR"));

  if (!sourceDirectory.exists) {
    throw new Error("Missing Illustrator source directory: " + sourceDirectory.fsName);
  }
  if (!outputDirectory.exists && !outputDirectory.create()) {
    throw new Error("Unable to create audit directory: " + outputDirectory.fsName);
  }

  function pageFromName(name) {
    var normalized = String(name).toLowerCase();
    if (normalized.indexOf("blog") >= 0) return "blog";
    if (normalized.indexOf("chambres") >= 0) return "chambres";
    if (normalized.indexOf("gallerie") >= 0) return "galerie";
    if (normalized.indexOf("reservation") >= 0) return "reservation";
    if (normalized.indexOf("expe") >= 0) return "experiences";
    return "home";
  }

  function round(value) {
    return Math.round(Number(value) * 1000) / 1000;
  }

  function quoteJson(value) {
    return '"' + String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t") + '"';
  }

  function jsonStringify(value, pretty, depth) {
    var level = depth || 0;
    var gap = pretty ? "  " : "";
    var currentIndent = "";
    var childIndent = "";
    var index;
    for (index = 0; index < level; index += 1) currentIndent += gap;
    childIndent = currentIndent + gap;

    if (value === null) return "null";
    if (typeof value === "string") return quoteJson(value);
    if (typeof value === "number") return isFinite(value) ? String(value) : "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (value instanceof Array) {
      var arrayValues = [];
      for (index = 0; index < value.length; index += 1) {
        arrayValues.push(jsonStringify(value[index], pretty, level + 1));
      }
      if (!arrayValues.length) return "[]";
      return pretty
        ? "[\n" + childIndent + arrayValues.join(",\n" + childIndent) + "\n" + currentIndent + "]"
        : "[" + arrayValues.join(",") + "]";
    }
    if (typeof value === "object") {
      var objectValues = [];
      for (var key in value) {
        if (value.hasOwnProperty(key) && typeof value[key] !== "undefined" && typeof value[key] !== "function") {
          objectValues.push(quoteJson(key) + (pretty ? ": " : ":") + jsonStringify(value[key], pretty, level + 1));
        }
      }
      if (!objectValues.length) return "{}";
      return pretty
        ? "{\n" + childIndent + objectValues.join(",\n" + childIndent) + "\n" + currentIndent + "}"
        : "{" + objectValues.join(",") + "}";
    }
    return "null";
  }

  function bounds(values) {
    return {
      left: round(values[0]),
      top: round(values[1]),
      right: round(values[2]),
      bottom: round(values[3]),
      width: round(values[2] - values[0]),
      height: round(values[1] - values[3])
    };
  }

  function colorValue(color) {
    if (!color) return null;
    var result = { typename: color.typename };
    if (color.typename === "RGBColor") {
      result.red = round(color.red);
      result.green = round(color.green);
      result.blue = round(color.blue);
    } else if (color.typename === "CMYKColor") {
      result.cyan = round(color.cyan);
      result.magenta = round(color.magenta);
      result.yellow = round(color.yellow);
      result.black = round(color.black);
    } else if (color.typename === "GrayColor") {
      result.gray = round(color.gray);
    } else if (color.typename === "SpotColor") {
      result.spot = color.spot.name;
      result.tint = round(color.tint);
    }
    return result;
  }

  function textStyle(characterAttributes, paragraphAttributes) {
    var font = null;
    try {
      font = {
        name: characterAttributes.textFont.name,
        family: characterAttributes.textFont.family,
        style: characterAttributes.textFont.style
      };
    } catch (error) {}

    return {
      font: font,
      size: round(characterAttributes.size),
      leading: round(characterAttributes.leading),
      tracking: round(characterAttributes.tracking),
      horizontalScale: round(characterAttributes.horizontalScale),
      verticalScale: round(characterAttributes.verticalScale),
      capitalization: String(characterAttributes.capitalization),
      baselineShift: round(characterAttributes.baselineShift),
      fillColor: colorValue(characterAttributes.fillColor),
      justification: String(paragraphAttributes.justification)
    };
  }

  function styleSignature(style) {
    var fontName = style.font ? style.font.name : "";
    return [
      fontName,
      style.size,
      style.leading,
      style.tracking,
      style.horizontalScale,
      style.verticalScale,
      style.capitalization,
      style.baselineShift,
      jsonStringify(style.fillColor, false),
      style.justification
    ].join("|");
  }

  function textRuns(frame) {
    var runs = [];
    var characters = frame.characters;
    var current = null;

    for (var index = 0; index < characters.length; index += 1) {
      var character = characters[index];
      var style = textStyle(character.characterAttributes, character.paragraphAttributes);
      var signature = styleSignature(style);

      if (!current || current.signature !== signature) {
        current = {
          start: index,
          length: 0,
          content: "",
          style: style,
          signature: signature
        };
        runs.push(current);
      }

      current.length += 1;
      current.content += character.contents;
    }

    for (var runIndex = 0; runIndex < runs.length; runIndex += 1) {
      delete runs[runIndex].signature;
    }
    return runs;
  }

  function layerPath(item) {
    var names = [];
    var current = item.layer;
    while (current) {
      names.unshift(current.name);
      try {
        current = current.parent.typename === "Layer" ? current.parent : null;
      } catch (error) {
        current = null;
      }
    }
    return names.join(" / ");
  }

  function textFrameData(frame, index, artboard) {
    var geometric = bounds(frame.geometricBounds);
    var visible = bounds(frame.visibleBounds);
    geometric.x = round(geometric.left - artboard.left);
    geometric.y = round(artboard.top - geometric.top);
    visible.x = round(visible.left - artboard.left);
    visible.y = round(artboard.top - visible.top);

    return {
      index: index,
      name: frame.name,
      content: frame.contents,
      kind: String(frame.kind),
      layer: layerPath(frame),
      geometricBounds: geometric,
      visibleBounds: visible,
      opacity: round(frame.opacity),
      rotation: round(frame.rotate),
      runs: textRuns(frame)
    };
  }

  function itemData(item, index, artboard) {
    var geometric = bounds(item.geometricBounds);
    var visible = bounds(item.visibleBounds);
    geometric.x = round(geometric.left - artboard.left);
    geometric.y = round(artboard.top - geometric.top);
    visible.x = round(visible.left - artboard.left);
    visible.y = round(artboard.top - visible.top);

    var result = {
      index: index,
      name: item.name,
      typename: item.typename,
      layer: layerPath(item),
      geometricBounds: geometric,
      visibleBounds: visible,
      opacity: round(item.opacity)
    };
    try { result.file = item.file.fsName; } catch (error) {}
    return result;
  }

  function writeJson(file, data) {
    file.encoding = "UTF-8";
    if (!file.open("w")) throw new Error("Unable to write " + file.fsName);
    file.write(jsonStringify(data, true));
    file.close();
  }

  function exportReference(document, page) {
    var options = new ExportOptionsPNG24();
    options.antiAliasing = true;
    options.artBoardClipping = true;
    options.horizontalScale = 100;
    options.verticalScale = 100;
    options.transparency = true;
    document.exportFile(new File(outputDirectory.fsName + "/" + page), ExportType.PNG24, options);
  }

  var previousInteractionLevel = app.userInteractionLevel;
  var files = sourceDirectory.getFiles(function (entry) {
    return entry instanceof File && /\.ai$/i.test(entry.name);
  });
  var summary = {
    illustratorVersion: app.version,
    generatedAt: new Date().toUTCString(),
    sourceDirectory: sourceDirectory.fsName,
    documents: []
  };

  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  try {
    for (var fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      var file = files[fileIndex];
      var page = pageFromName(file.name);
      var document = app.open(file);
      try {
        document.artboards.setActiveArtboardIndex(0);
        var rect = document.artboards[0].artboardRect;
        var artboard = {
          left: round(rect[0]),
          top: round(rect[1]),
          right: round(rect[2]),
          bottom: round(rect[3]),
          width: round(rect[2] - rect[0]),
          height: round(rect[1] - rect[3])
        };
        var data = {
          page: page,
          source: file.fsName,
          documentName: document.name,
          artboard: artboard,
          textFrames: [],
          placedItems: [],
          rasterItems: []
        };

        for (var textIndex = 0; textIndex < document.textFrames.length; textIndex += 1) {
          data.textFrames.push(textFrameData(document.textFrames[textIndex], textIndex, artboard));
        }
        for (var placedIndex = 0; placedIndex < document.placedItems.length; placedIndex += 1) {
          data.placedItems.push(itemData(document.placedItems[placedIndex], placedIndex, artboard));
        }
        for (var rasterIndex = 0; rasterIndex < document.rasterItems.length; rasterIndex += 1) {
          data.rasterItems.push(itemData(document.rasterItems[rasterIndex], rasterIndex, artboard));
        }

        exportReference(document, page);
        writeJson(new File(outputDirectory.fsName + "/" + page + ".json"), data);
        summary.documents.push({
          page: page,
          source: file.fsName,
          artboard: artboard,
          textFrameCount: data.textFrames.length,
          placedItemCount: data.placedItems.length,
          rasterItemCount: data.rasterItems.length
        });
      } finally {
        document.close(SaveOptions.DONOTSAVECHANGES);
      }
    }
  } finally {
    app.userInteractionLevel = previousInteractionLevel;
  }

  writeJson(new File(outputDirectory.fsName + "/summary.json"), summary);
  return jsonStringify(summary, false);
}());
