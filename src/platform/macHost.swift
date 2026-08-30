import AppKit
import CoreGraphics
import Foundation
import Vision

func hearthstoneWindows() -> [[String: Any]] {
  let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
  guard let info = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    return []
  }
  return info.filter { row in
    let owner = (row[kCGWindowOwnerName as String] as? String) ?? ""
    let title = (row[kCGWindowName as String] as? String) ?? ""
    return owner == "Hearthstone" || title.localizedCaseInsensitiveContains("Hearthstone")
  }.sorted { a, b in
    let areaA = windowArea(a)
    let areaB = windowArea(b)
    return areaA > areaB
  }
}

func windowArea(_ row: [String: Any]) -> CGFloat {
  guard let bounds = row[kCGWindowBounds as String] as? [String: CGFloat] else { return 0 }
  return (bounds["Width"] ?? 0) * (bounds["Height"] ?? 0)
}

func windowRect(_ row: [String: Any]) -> CGRect? {
  guard let bounds = row[kCGWindowBounds as String] as? [String: CGFloat] else { return nil }
  return CGRect(
    x: bounds["X"] ?? 0,
    y: bounds["Y"] ?? 0,
    width: bounds["Width"] ?? 0,
    height: bounds["Height"] ?? 0
  )
}

func cmdPresent() {
  print(hearthstoneWindows().isEmpty ? "0" : "1")
}

func cmdFront() {
  let name = NSWorkspace.shared.frontmostApplication?.localizedName ?? ""
  print(name == "Hearthstone" ? "1" : "0")
}

func cmdBounds() {
  guard let row = hearthstoneWindows().first, let rect = windowRect(row), rect.width >= 80, rect.height >= 80 else {
    fputs("missing\n", stderr)
    exit(2)
  }
  print("\(Int(rect.origin.x.rounded())),\(Int(rect.origin.y.rounded())),\(Int(rect.width.rounded())),\(Int(rect.height.rounded()))")
}

func cmdOcr(x: Int, y: Int, w: Int, h: Int) {
  guard w >= 40, h >= 40, let row = hearthstoneWindows().first, let winRect = windowRect(row) else {
    return
  }
  let windowId = CGWindowID((row[kCGWindowNumber as String] as? UInt32) ?? 0)
  guard windowId != 0,
        let image = CGWindowListCreateImage(
          .null,
          [.optionIncludingWindow, .excludeDesktopElements],
          windowId,
          [.boundsIgnoreFraming, .bestResolution]
        )
  else {
    return
  }
  let request = CGRect(x: x, y: y, width: w, height: h)
  let local = request.intersection(winRect)
  guard !local.isNull, local.width >= 8, local.height >= 8 else { return }
  let scaleX = CGFloat(image.width) / winRect.width
  let scaleY = CGFloat(image.height) / winRect.height
  let crop = CGRect(
    x: (local.origin.x - winRect.origin.x) * scaleX,
    y: (local.origin.y - winRect.origin.y) * scaleY,
    width: local.width * scaleX,
    height: local.height * scaleY
  )
  guard let cropped = image.cropping(to: crop) else { return }
  let handler = VNImageRequestHandler(cgImage: cropped, options: [:])
  let textRequest = VNRecognizeTextRequest()
  textRequest.recognitionLevel = .accurate
  textRequest.usesLanguageCorrection = false
  try? handler.perform([textRequest])
  let lines = (textRequest.results ?? []).compactMap { $0.topCandidates(1).first?.string }
  print(lines.joined(separator: "\n"))
}

let args = Array(CommandLine.arguments.dropFirst())
guard let cmd = args.first else {
  fputs("usage: mac-host present|front|bounds|ocr x y w h\n", stderr)
  exit(1)
}

switch cmd {
case "present":
  cmdPresent()
case "front":
  cmdFront()
case "bounds":
  cmdBounds()
case "ocr":
  guard args.count >= 5,
        let x = Int(args[1]),
        let y = Int(args[2]),
        let w = Int(args[3]),
        let h = Int(args[4])
  else {
    fputs("usage: mac-host ocr x y w h\n", stderr)
    exit(1)
  }
  cmdOcr(x: x, y: y, w: w, h: h)
default:
  fputs("usage: mac-host present|front|bounds|ocr x y w h\n", stderr)
  exit(1)
}
