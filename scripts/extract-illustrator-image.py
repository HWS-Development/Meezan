#!/usr/bin/env python3

import argparse
import hashlib
import json
from pathlib import Path

try:
    import fitz
except ModuleNotFoundError as error:
    raise SystemExit(
        "PyMuPDF is required. Install scripts/requirements-illustrator-export.txt first."
    ) from error


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


parser = argparse.ArgumentParser(
    description="Extract an embedded image from a PDF-compatible Illustrator file."
)
parser.add_argument("source", type=Path)
parser.add_argument("xref", type=int)
parser.add_argument("output", type=Path)
arguments = parser.parse_args()

if not arguments.source.is_file():
    raise SystemExit(f"Illustrator source not found: {arguments.source}")

with fitz.open(arguments.source) as document:
    image_xrefs = {
        image[0]
        for page in document
        for image in page.get_images(full=True)
    }
    if arguments.xref not in image_xrefs:
        raise SystemExit(f"Image xref {arguments.xref} not found in {arguments.source}")
    extracted = document.extract_image(arguments.xref)

expected_suffix = f".{extracted['ext'].lower()}"
if arguments.output.suffix.lower() != expected_suffix:
    raise SystemExit(
        f"Output must use the extracted {expected_suffix} extension: {arguments.output}"
    )

arguments.output.parent.mkdir(parents=True, exist_ok=True)
arguments.output.write_bytes(extracted["image"])

print(
    json.dumps(
        {
            "source": str(arguments.source),
            "sourceSha256": sha256(arguments.source),
            "xref": arguments.xref,
            "width": extracted["width"],
            "height": extracted["height"],
            "output": str(arguments.output),
            "outputSha256": sha256(arguments.output),
        },
        indent=2,
    )
)
