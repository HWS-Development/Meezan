#target illustrator

(function () {
  var sourceDirectory = new Folder($.getenv("MEEZAN_SOURCE_DIR"));
  var outputDirectory = new Folder($.getenv("MEEZAN_OUTPUT_DIR"));
  if (!sourceDirectory.exists) throw new Error("Missing Illustrator source directory");
  if (!outputDirectory.exists && !outputDirectory.create()) throw new Error("Unable to create output directory");

  function pageFromName(name) {
    var normalized = String(name).toLowerCase();
    if (normalized.indexOf("reservation") >= 0) return "reservation";
    if (normalized.indexOf("expe") >= 0) return "experiences";
    if (!/blog|chambres|gallerie/i.test(normalized)) return "home";
    return "";
  }

  function round(value) {
    return Math.round(Number(value) * 1000) / 1000;
  }

  function relativeBounds(item, artboard) {
    var bounds = item.geometricBounds;
    return {
      x: round(bounds[0] - artboard[0]),
      y: round(artboard[1] - bounds[1]),
      width: round(bounds[2] - bounds[0]),
      height: round(bounds[1] - bounds[3])
    };
  }

  function exportReference(document, name) {
    var options = new ImageCaptureOptions();
    options.antiAliasing = true;
    options.matte = false;
    options.resolution = 72;
    options.transparency = true;
    document.imageCapture(new File(outputDirectory.fsName + "/" + name + ".png"), document.artboards[0].artboardRect, options);
  }

  function hideReservationCalendar(document, artboard) {
    for (var index = 0; index < document.groupItems.length; index += 1) {
      var group = document.groupItems[index];
      var bounds = relativeBounds(group, artboard);
      if (Math.abs(bounds.x - 797.758) < 1 && Math.abs(bounds.y - 3204.83) < 1 && bounds.width > 750 && bounds.width < 765 && bounds.height > 390 && bounds.height < 405) {
        group.hidden = true;
        return true;
      }
    }
    return false;
  }

  function hideHomeHoverCopy(document) {
    for (var index = 0; index < document.textFrames.length; index += 1) {
      var frame = document.textFrames[index];
      if (/Dans son sens premier, Meezane est la balance/.test(frame.contents)) {
        frame.hidden = true;
        return true;
      }
    }
    return false;
  }

  function correctExperiencesRule(document, artboard) {
    var titleTop = null;
    var referenceGap = null;
    var rule = null;
    var debugRules = [];

    for (var textIndex = 0; textIndex < document.textFrames.length; textIndex += 1) {
      var frame = document.textFrames[textIndex];
      var textBounds = relativeBounds(frame, artboard);
      if (/^Terre &/i.test(frame.contents)) titleTop = textBounds.y;
    }

    var candidateRules = [];
    for (var pathIndex = 0; pathIndex < document.pathItems.length; pathIndex += 1) {
      var path = document.pathItems[pathIndex];
      var bounds = relativeBounds(path, artboard);
      if (bounds.width < 75 || bounds.width > 130 || bounds.height > 10) continue;
      if (bounds.x > 500 && bounds.x < 800 && bounds.y > 12000 && bounds.y < 14000) debugRules.push(bounds.x + "," + bounds.y + "," + bounds.width + "," + bounds.height);
      if (bounds.x > 500 && bounds.x < 800 && bounds.y > 12500 && bounds.y < 13000) rule = path;
      if (bounds.x > 500 && bounds.x < 800 && bounds.y > 13600 && bounds.y < 13800) candidateRules.push(bounds.y);
    }

    if (candidateRules.length && titleTop !== null) {
      var echappeeTop = null;
      for (var secondTextIndex = 0; secondTextIndex < document.textFrames.length; secondTextIndex += 1) {
        if (String(document.textFrames[secondTextIndex].contents).toLowerCase().indexOf("chapp") >= 0) {
          echappeeTop = relativeBounds(document.textFrames[secondTextIndex], artboard).y;
          break;
        }
      }
      if (echappeeTop !== null) referenceGap = echappeeTop - candidateRules[0];
    }

    if (!rule || titleTop === null || referenceGap === null) throw new Error("Experiences rule candidates: " + debugRules.join(" | "));
    var ruleBounds = relativeBounds(rule, artboard);
    var targetY = titleTop - referenceGap;
    rule.translate(0, ruleBounds.y - targetY);
    return true;
  }

  var files = sourceDirectory.getFiles(function (entry) {
    return entry instanceof File && /\.ai$/i.test(entry.name) && pageFromName(entry.name);
  });
  var previousInteractionLevel = app.userInteractionLevel;
  var results = [];
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  try {
    for (var fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      var document = app.open(files[fileIndex]);
      var page = pageFromName(files[fileIndex].name);
      try {
        var artboard = document.artboards[0].artboardRect;
        var changed = false;
        if (page === "reservation") changed = hideReservationCalendar(document, artboard);
        if (page === "home") changed = hideHomeHoverCopy(document);
        if (page === "experiences") changed = correctExperiencesRule(document, artboard);
        if (!changed) throw new Error("Expected editable source item not found for " + page);
        exportReference(document, page + "-interaction-state");
        results.push(page);
      } finally {
        document.close(SaveOptions.DONOTSAVECHANGES);
      }
    }
  } finally {
    try { app.userInteractionLevel = previousInteractionLevel; } catch (error) {}
  }
  return results.join("\n");
}());
