import AVFoundation
import ImageIO
import UniformTypeIdentifiers
let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let dur = try await asset.load(.duration)
for t in try await asset.load(.tracks) {
  let (type, size, rate, fmts) = try await (t.mediaType, t.load(.naturalSize), t.load(.nominalFrameRate), t.load(.formatDescriptions))
  print(type.rawValue, size, rate, fmts.map { CMFormatDescriptionGetMediaSubType($0) }.map { String(format: "%c%c%c%c", ($0 >> 24) & 255, ($0 >> 16) & 255, ($0 >> 8) & 255, $0 & 255) })
}
print("duration", dur.seconds)
let gen = AVAssetImageGenerator(asset: asset); gen.requestedTimeToleranceBefore = .zero; gen.requestedTimeToleranceAfter = .zero
for s in [0.0, 9.5, 13.6] {
  let (img, _) = try await gen.image(at: CMTime(seconds: s, preferredTimescale: 600))
  let url = URL(fileURLWithPath: "verify/v\(s).png") as CFURL
  let d = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil)!; CGImageDestinationAddImage(d, img, nil); CGImageDestinationFinalize(d)
}
print("stills written")
