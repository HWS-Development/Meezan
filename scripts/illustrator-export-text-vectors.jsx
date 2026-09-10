#target illustrator

(function () {
  var sourceDirectory = new Folder($.getenv("MEEZAN_SOURCE_DIR"));
  var outputDirectory = new Folder($.getenv("MEEZAN_OUTPUT_DIR"));
  var requestedPages = String($.getenv("MEEZAN_PAGES") || "").toLowerCase();

  if (!sourceDirectory.exists) throw new Error("Missing Illustrator source directory: " + sourceDirectory.fsName);
  if (!outputDirectory.exists && !outputDirectory.create()) throw new Error("Unable to create output directory: " + outputDirectory.fsName);

  function pageFromName(name) {
    var normalized = String(name).toLowerCase();
    if (normalized.indexOf("blog") >= 0) return "blog";
    if (normalized.indexOf("chambres") >= 0) return "chambres";
    if (normalized.indexOf("gallerie") >= 0) return "galerie";
    if (normalized.indexOf("reservation") >= 0) return "reservation";
    if (normalized.indexOf("expe") >= 0) return "experiences";
    return "home";
  }

  function pageRequested(page) {
    if (!requestedPages) return true;
    return ("," + requestedPages.replace(/\s+/g, "") + ",").indexOf("," + page + ",") >= 0;
  }

  function isVisible(item) {
    var current = item;
    while (current && current.typename !== "Document") {
      try {
        if (current.typename === "Layer" && !current.visible) return false;
        if (current.typename !== "Layer" && current.hidden) return false;
      } catch (error) {}
      current = current.parent;
    }
    return true;
  }

  function intersectsArtboard(item, artboardRect) {
    var itemBounds = item.geometricBounds;
    return itemBounds[2] > artboardRect[0] && itemBounds[0] < artboardRect[2] && itemBounds[1] > artboardRect[3] && itemBounds[3] < artboardRect[1];
  }

  function replaceTextKeepingCenter(frame, content) {
    var sourceBounds = frame.geometricBounds;
    var sourceCenter = (sourceBounds[0] + sourceBounds[2]) / 2;
    frame.contents = content;
    var correctedBounds = frame.geometricBounds;
    var correctedCenter = (correctedBounds[0] + correctedBounds[2]) / 2;
    frame.translate(sourceCenter - correctedCenter, 0);
  }

  function applyApprovedCopyCorrections(document, page) {
    if (page !== "blog") return;
    for (var frameIndex = 0; frameIndex < document.textFrames.length; frameIndex += 1) {
      var frame = document.textFrames[frameIndex];
      if (frame.contents === "Nos Chambres") replaceTextKeepingCenter(frame, "Blog");
      if (frame.contents === "Chaque espace raconte une histoire.") {
        replaceTextKeepingCenter(frame, "Actualit\u00E9s, inspirations et art de vivre.");
      }
    }
  }

  function exportSvg(document, page) {
    var options = new ExportOptionsSVG();
    options.artboardRange = "1";
    options.coordinatePrecision = 7;
    options.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES;
    options.documentEncoding = SVGDocumentEncoding.UTF8;
    options.embedRasterImages = true;
    options.fontType = SVGFontType.OUTLINEFONT;
    options.optimizeForSVGViewer = true;
    options.preserveEditability = false;
    options.saveMultipleArtboards = true;
    document.exportFile(new File(outputDirectory.fsName + "/" + page + "-text"), ExportType.SVG, options);
  }

  function exportPng(document, page) {
    var options = new ImageCaptureOptions();
    options.antiAliasing = true;
    options.matte = false;
    options.resolution = 72;
    options.transparency = true;
    document.imageCapture(new File(outputDirectory.fsName + "/" + page + "-text.png"), document.artboards[0].artboardRect, options);
  }

  var files = sourceDirectory.getFiles(function (entry) {
    return entry instanceof File && /\.ai$/i.test(entry.name) && pageRequested(pageFromName(entry.name));
  });
  var previousInteractionLevel = app.userInteractionLevel;
  var previousCoordinateSystem = app.coordinateSystem;
  var exported = [];

  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  try {
    for (var fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      var sourceFile = files[fileIndex];
      var page = pageFromName(sourceFile.name);
      var sourceDocument = null;
      try {
        sourceDocument = app.open(sourceFile);
        sourceDocument.artboards.setActiveArtboardIndex(0);
        var artboardRect = sourceDocument.artboards[0].artboardRect;
        applyApprovedCopyCorrections(sourceDocument, page);
        var sourceFrames = [];
        for (var sourceIndex = 0; sourceIndex < sourceDocument.textFrames.length; sourceIndex += 1) {
          var candidate = sourceDocument.textFrames[sourceIndex];
          if (isVisible(candidate) && intersectsArtboard(candidate, artboardRect)) sourceFrames.push(candidate);
        }

        var targetLayer = sourceDocument.layers.add();
        targetLayer.name = "Adobe exact text";
        var duplicatedCount = 0;

        for (var textIndex = sourceFrames.length - 1; textIndex >= 0; textIndex -= 1) {
          sourceFrames[textIndex].duplicate(targetLayer, ElementPlacement.PLACEATBEGINNING);
          duplicatedCount += 1;
        }

        for (var layerIndex = sourceDocument.layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
          var layer = sourceDocument.layers[layerIndex];
          if (layer.name === targetLayer.name) continue;
          try { layer.locked = false; } catch (unlockError) {}
          layer.remove();
        }
        for (var outlineIndex = targetLayer.textFrames.length - 1; outlineIndex >= 0; outlineIndex -= 1) {
          targetLayer.textFrames[outlineIndex].createOutline();
        }

        exportSvg(sourceDocument, page);
        exportPng(sourceDocument, page);
        exported.push(page + ":" + duplicatedCount);
      } catch (error) {
        exported.push(page + ":ERROR:" + error.message + ":line " + error.line);
      } finally {
        try { if (sourceDocument) sourceDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (closeSourceError) {}
      }
    }
  } finally {
    try { app.coordinateSystem = previousCoordinateSystem; } catch (coordinateError) {}
    try { app.userInteractionLevel = previousInteractionLevel; } catch (interactionError) {}
  }

  return exported.join("\n");
}());
