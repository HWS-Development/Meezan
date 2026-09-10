#target illustrator

(function () {
  var sourceDirectory = new Folder($.getenv("MEEZAN_SOURCE_DIR"));
  var outputDirectory = new Folder($.getenv("MEEZAN_OUTPUT_DIR"));
  if (!sourceDirectory.exists) throw new Error("Missing Illustrator source directory");
  if (!outputDirectory.exists && !outputDirectory.create()) throw new Error("Unable to create output directory");

  function pageFromName(name) {
    var normalized = String(name).toLowerCase();
    if (normalized.indexOf("blog") >= 0) return "blog";
    if (normalized.indexOf("chambres") >= 0) return "chambres";
    if (normalized.indexOf("gallerie") >= 0) return "galerie";
    if (normalized.indexOf("reservation") >= 0) return "reservation";
    if (normalized.indexOf("expe") >= 0) return "experiences";
    return "home";
  }

  function exportReference(document, page) {
    var options = new ImageCaptureOptions();
    options.antiAliasing = true;
    options.matte = false;
    options.resolution = 72;
    options.transparency = true;
    document.imageCapture(new File(outputDirectory.fsName + "/normalized-" + page + ".png"), document.artboards[0].artboardRect, options);
  }

  var files = sourceDirectory.getFiles(function (entry) {
    return entry instanceof File && /\.ai$/i.test(entry.name);
  });
  var previousInteractionLevel = app.userInteractionLevel;
  var exported = [];
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  try {
    for (var fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      var document = null;
      var page = pageFromName(files[fileIndex].name);
      try {
        document = app.open(files[fileIndex]);
        exportReference(document, page);
        exported.push(page);
      } catch (error) {
        exported.push(page + ":ERROR:" + error.message + ":line " + error.line);
      } finally {
        try { if (document) document.close(SaveOptions.DONOTSAVECHANGES); } catch (closeError) {}
      }
    }
  } finally {
    try { app.userInteractionLevel = previousInteractionLevel; } catch (error) {}
  }
  return exported.join("\n");
}());
