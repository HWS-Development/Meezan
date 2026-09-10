#target illustrator

(function () {
  var sourceDirectory = new Folder($.getenv("MEEZAN_SOURCE_DIR"));
  var files = sourceDirectory.getFiles(function (entry) {
    return entry instanceof File && /reservation\.ai$/i.test(entry.name);
  });
  if (!files.length) throw new Error("Reservation source not found");

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

  function intersectsCalendar(bounds) {
    return bounds.x + bounds.width > 760 && bounds.x < 1610 && bounds.y + bounds.height > 3160 && bounds.y < 3620;
  }

  var document = app.open(files[0]);
  var lines = [];
  try {
    var artboard = document.artboards[0].artboardRect;
    lines.push("GROUPS | " + document.groupItems.length);
    for (var groupIndex = 0; groupIndex < document.groupItems.length; groupIndex += 1) {
      var group = document.groupItems[groupIndex];
      var bounds = relativeBounds(group, artboard);
      if (!intersectsCalendar(bounds)) continue;
      var parentName = "";
      try { parentName = group.parent.name; } catch (parentNameError) {}
      lines.push(groupIndex + " | " + group.name + " | " + bounds.x + "," + bounds.y + "," + bounds.width + "," + bounds.height + " | children=" + group.pageItems.length + " | parent=" + group.parent.typename + ":" + parentName);
    }
  } finally {
    document.close(SaveOptions.DONOTSAVECHANGES);
  }
  return lines.join("\n");
}());
