import CoreGraphics
import Foundation
import ImageIO

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
    exit(1)
}

let arguments = CommandLine.arguments
guard arguments.count == 8 || arguments.count == 9 else {
    fail("Usage: swift scripts/export-illustrator-crop.swift source.ai output.png x y width height scale [jpeg-quality]")
}

let sourcePath = arguments[1]
let outputPath = arguments[2]
guard let x = Double(arguments[3]),
      let y = Double(arguments[4]),
      let width = Double(arguments[5]),
      let height = Double(arguments[6]),
      let scale = Double(arguments[7]),
      width > 0,
      height > 0,
      scale > 0 else {
    fail("Crop coordinates, dimensions, and scale must be positive numbers")
}

let quality = arguments.count == 9 ? Double(arguments[8]) : nil
if let quality, !(0...1).contains(quality) {
    fail("JPEG quality must be between 0 and 1")
}

let sourceURL = URL(fileURLWithPath: sourcePath) as CFURL
guard let document = CGPDFDocument(sourceURL),
      let page = document.page(at: 1) else {
    fail("Cannot open the PDF-compatible Illustrator source: \(sourcePath)")
}

let pageBounds = page.getBoxRect(.mediaBox)
let cropBounds = CGRect(x: x, y: y, width: width, height: height)
let topLeftPageBounds = CGRect(x: 0, y: 0, width: pageBounds.width, height: pageBounds.height)
guard topLeftPageBounds.contains(cropBounds) else {
    fail("Crop \(cropBounds) exceeds artboard \(topLeftPageBounds)")
}

let pixelWidth = Int((width * scale).rounded())
let pixelHeight = Int((height * scale).rounded())
let bytesPerRow = pixelWidth * 4
var pixels = [UInt8](repeating: 255, count: bytesPerRow * pixelHeight)
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!

let image = pixels.withUnsafeMutableBytes { bytes -> CGImage in
    guard let context = CGContext(
        data: bytes.baseAddress,
        width: pixelWidth,
        height: pixelHeight,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        fail("Cannot create the bitmap context")
    }

    context.setFillColor(CGColor(gray: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
    context.scaleBy(x: scale, y: scale)
    let pdfCropY = pageBounds.height - y - height
    context.translateBy(x: -x, y: -pdfCropY)
    context.drawPDFPage(page)

    guard let image = context.makeImage() else {
        fail("Cannot create the crop image")
    }
    return image
}

let outputURL = URL(fileURLWithPath: outputPath)
let isJPEG = ["jpg", "jpeg"].contains(outputURL.pathExtension.lowercased())
let type = isJPEG ? "public.jpeg" : "public.png"
guard let destination = CGImageDestinationCreateWithURL(outputURL as CFURL, type as CFString, 1, nil) else {
    fail("Cannot create the output: \(outputPath)")
}

let properties: CFDictionary?
if isJPEG {
    properties = [kCGImageDestinationLossyCompressionQuality: quality ?? 0.9] as CFDictionary
} else {
    properties = nil
}
CGImageDestinationAddImage(destination, image, properties)
guard CGImageDestinationFinalize(destination) else {
    fail("Cannot write the output: \(outputPath)")
}

print("Exported \(outputPath) at \(pixelWidth)x\(pixelHeight) from crop x=\(x), y=\(y), width=\(width), height=\(height)")
