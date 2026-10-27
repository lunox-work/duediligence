// swift encode.swift <framesDir> <fps> <audio.wav> <out.mp4>
import AVFoundation
import CoreGraphics
import ImageIO
import Foundation

let a = CommandLine.arguments
let framesDir = URL(fileURLWithPath: a[1]), fps = Int32(a[2])!, audioURL = URL(fileURLWithPath: a[3]), outURL = URL(fileURLWithPath: a[4])
try? FileManager.default.removeItem(at: outURL)
let frames = try FileManager.default.contentsOfDirectory(atPath: framesDir.path).filter { $0.hasSuffix(".png") }.sorted()
let W = 1920, H = 1080

let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 14_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                                    AVVideoMaxKeyFrameIntervalKey: 60, AVVideoExpectedSourceFrameRateKey: Int(fps)]])
vIn.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: vIn, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(vIn)

let audioAsset = AVURLAsset(url: audioURL)
let aTrack = try await audioAsset.loadTracks(withMediaType: .audio).first!
let reader = try AVAssetReader(asset: audioAsset)
let aOut = AVAssetReaderTrackOutput(track: aTrack, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 16,
  AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false])
reader.add(aOut)
var layout = AudioChannelLayout(); layout.mChannelLayoutTag = kAudioChannelLayoutTag_Stereo
let aIn = AVAssetWriterInput(mediaType: .audio, outputSettings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48000,
  AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 256_000, AVChannelLayoutKey: Data(bytes: &layout, count: MemoryLayout<AudioChannelLayout>.size)])
aIn.expectsMediaDataInRealTime = false
writer.add(aIn)

writer.startWriting(); reader.startReading(); writer.startSession(atSourceTime: .zero)
let group = DispatchGroup()
group.enter()
var idx = 0
vIn.requestMediaDataWhenReady(on: DispatchQueue(label: "v")) {
  while vIn.isReadyForMoreMediaData {
    if idx >= frames.count { vIn.markAsFinished(); group.leave(); return }
    autoreleasepool {
      let src = CGImageSourceCreateWithURL(framesDir.appendingPathComponent(frames[idx]) as CFURL, nil)!
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
      var pb: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
      CVPixelBufferLockBaseAddress(pb!, [])
      let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb!),
                          space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
      ctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H))
      CVPixelBufferUnlockBaseAddress(pb!, [])
      adaptor.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(idx), timescale: fps))
    }
    idx += 1
  }
}
group.enter()
aIn.requestMediaDataWhenReady(on: DispatchQueue(label: "a")) {
  while aIn.isReadyForMoreMediaData {
    if let sb = aOut.copyNextSampleBuffer() { aIn.append(sb) } else { aIn.markAsFinished(); group.leave(); return }
  }
}
group.wait()
await writer.finishWriting()
print(writer.status == .completed ? "ok \(frames.count) frames -> \(outURL.path)" : "failed: \(String(describing: writer.error))")
