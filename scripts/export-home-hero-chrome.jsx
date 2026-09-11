#target illustrator

(function () {
  var sourceDirectory = new Folder($.getenv("MEEZAN_SOURCE_DIR"));
  var outputDirectory = new Folder($.getenv("MEEZAN_OUTPUT_DIR"));
  var files = sourceDirectory.getFiles(function (entry) {
    return entry instanceof File && /\.ai$/i.test(entry.name) && !/blog|chambres|gallerie|reservation|expe/i.test(entry.name);
  });
  if (!files.length) throw new Error("Home source not found");
  if (!outputDirectory.exists && !outputDirectory.create()) throw new Error("Output directory unavailable");

  var previousInteractionLevel = app.userInteractionLevel;
  var document = null;
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  try {
    document = app.open(files[0]);
    var artboard = document.artboards[0].artboardRect;
    var index;
    for (index = 0; index < document.textFrames.length; index += 1) document.textFrames[index].hidden = true;
    for (index = 0; index < document.placedItems.length; index += 1) document.placedItems[index].hidden = true;
    for (index = 0; index < document.rasterItems.length; index += 1) document.rasterItems[index].hidden = true;

    var options = new ImageCaptureOptions();
    options.antiAliasing = true;
    options.matte = false;
    options.resolution = 144;
    options.transparency = true;
    document.imageCapture(
      new File(outputDirectory.fsName + "/home-hero-chrome-exact.png"),
      [artboard[0], artboard[1] - 189, artboard[2], artboard[1] - 1320],
      options
    );
  } finally {
    try { if (document) document.close(SaveOptions.DONOTSAVECHANGES); } catch (closeError) {}
    try { app.userInteractionLevel = previousInteractionLevel; } catch (interactionError) {}
  }
}());
