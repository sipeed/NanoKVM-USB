// nanokvm-capture — minimal AVFoundation capture helper for the desktop app's
// uncompressed video mode. Replaces ffmpeg on macOS: ffmpeg's avfoundation
// input freezes on large (>=1080p) uncompressed frames, native capture works.
//
//   nanokvm-capture list
//     stdout: one JSON object: {"devices":[{"name":...,"formats":[
//             {"pixfmt":"yuvs","width":...,"height":...,"fps":[...]}]}]}
//
//   nanokvm-capture stream --device <name> --width <w> --height <h> --fps <f>
//     stderr: one line "META {"width":W,"height":H}" with the ACTUAL delivered
//             buffer size (the UVC stack may serve the signal-native mode
//             regardless of the requested format), then raw yuvs (YUY2) frames
//             on stdout, W*2 bytes per row, tightly packed.
//
// SIGINT/SIGTERM stop the session cleanly. Blocking stdout writes provide
// natural backpressure: late frames are discarded by AVFoundation.
import AVFoundation
import Foundation

func fourCC(_ code: FourCharCode) -> String {
  var s = ""
  for shift in stride(from: 24, through: 0, by: -8) {
    s.append(Character(UnicodeScalar(UInt8((code >> UInt32(shift)) & 0xff))))
  }
  return s
}

func discoverDevices() -> [AVCaptureDevice] {
  AVCaptureDevice.DiscoverySession(
    deviceTypes: [.external, .builtInWideAngleCamera],
    mediaType: .video,
    position: .unspecified
  ).devices
}

func listCommand() {
  var devices: [[String: Any]] = []
  for d in discoverDevices() {
    var formats: [[String: Any]] = []
    for f in d.formats {
      let dim = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
      let sub = fourCC(CMFormatDescriptionGetMediaSubType(f.formatDescription))
      let fps = f.videoSupportedFrameRateRanges.map { $0.maxFrameRate }
      formats.append(["pixfmt": sub, "width": Int(dim.width), "height": Int(dim.height), "fps": fps])
    }
    devices.append(["name": d.localizedName, "formats": formats])
  }
  let json = try! JSONSerialization.data(withJSONObject: ["devices": devices])
  FileHandle.standardOutput.write(json)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

final class Writer: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  // The device may deliver a few transitional frames at a stale mode right
  // after opening — only report META once dimensions are stable, and treat a
  // later mode change (e.g. the HDMI source resolution changed) as a restart
  // condition (exit 3) so every emitted frame matches META exactly.
  var stableW = 0
  var stableH = 0
  var stableCount = 0
  var locked = false
  func captureOutput(_: AVCaptureOutput, didOutput sb: CMSampleBuffer, from _: AVCaptureConnection) {
    guard let pb = CMSampleBufferGetImageBuffer(sb) else { return }
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(pb) else { return }

    let w = CVPixelBufferGetWidth(pb)
    let h = CVPixelBufferGetHeight(pb)
    let stride = CVPixelBufferGetBytesPerRow(pb)
    let rowBytes = w * 2 // yuvs = 2 bytes/pixel

    if !locked {
      if w == stableW && h == stableH {
        stableCount += 1
      } else {
        stableW = w
        stableH = h
        stableCount = 1
      }
      if stableCount < 3 { return } // drop pre-stable frames
      locked = true
      FileHandle.standardError.write("META {\"width\":\(w),\"height\":\(h)}\n".data(using: .utf8)!)
    } else if w != stableW || h != stableH {
      FileHandle.standardError.write(
        "ERROR video mode changed (\(stableW)x\(stableH) -> \(w)x\(h))\n".data(using: .utf8)!)
      exit(3)
    }

    if stride == rowBytes {
      if fwrite(base, 1, rowBytes * h, stdout) != rowBytes * h { exit(0) } // EPIPE: consumer gone
    } else {
      var p = base
      for _ in 0..<h {
        if fwrite(p, 1, rowBytes, stdout) != rowBytes { exit(0) }
        p += stride
      }
    }
    fflush(stdout)
  }
}

func streamCommand(device devName: String, width: Int, height: Int, fps: Double) {
  guard let device = discoverDevices().first(where: { $0.localizedName == devName }) else {
    FileHandle.standardError.write("ERROR device not found: \(devName)\n".data(using: .utf8)!)
    exit(1)
  }

  // Prefer an exact WxH yuvs format supporting the fps; fall back to any yuvs.
  let yuvs = device.formats.filter { fourCC(CMFormatDescriptionGetMediaSubType($0.formatDescription)) == "yuvs" }
  let matching = yuvs.filter {
    let d = CMVideoFormatDescriptionGetDimensions($0.formatDescription)
    return Int(d.width) == width && Int(d.height) == height
  }
  let format = matching.first(where: { f in
    f.videoSupportedFrameRateRanges.contains { $0.minFrameRate - 0.5 <= fps && fps <= $0.maxFrameRate + 0.5 }
  }) ?? matching.first ?? yuvs.first
  guard let format else {
    FileHandle.standardError.write("ERROR no yuvs format on \(devName)\n".data(using: .utf8)!)
    exit(1)
  }

  signal(SIGPIPE, SIG_IGN)

  let session = AVCaptureSession()
  guard let input = try? AVCaptureDeviceInput(device: device) else {
    FileHandle.standardError.write("ERROR cannot open device (permission?)\n".data(using: .utf8)!)
    exit(1)
  }
  session.addInput(input)

  // Set activeFormat AFTER addInput: this flips the session to input-priority
  // (setting it before is overridden by the default .high preset).
  do {
    try device.lockForConfiguration()
    device.activeFormat = format
    if let range = format.videoSupportedFrameRateRanges.first(where: {
      $0.minFrameRate - 0.5 <= fps && fps <= $0.maxFrameRate + 0.5
    }) {
      device.activeVideoMinFrameDuration = range.minFrameDuration
      device.activeVideoMaxFrameDuration = range.maxFrameDuration
    }
    device.unlockForConfiguration()
  } catch {
    FileHandle.standardError.write("ERROR configure: \(error)\n".data(using: .utf8)!)
    exit(1)
  }

  let output = AVCaptureVideoDataOutput()
  output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_422YpCbCr8_yuvs]
  output.alwaysDiscardsLateVideoFrames = true
  let writer = Writer()
  output.setSampleBufferDelegate(writer, queue: DispatchQueue(label: "capture"))
  session.addOutput(output)
  session.startRunning()

  let stop = { (sig: Int32) -> DispatchSourceSignal in
    signal(sig, SIG_IGN)
    let src = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    src.setEventHandler {
      session.stopRunning()
      exit(0)
    }
    src.resume()
    return src
  }
  let sigint = stop(SIGINT)
  let sigterm = stop(SIGTERM)
  _ = (sigint, sigterm)

  RunLoop.main.run()
}

// ---- arg parsing ----
var args = Array(CommandLine.arguments.dropFirst())
guard let cmd = args.first else {
  FileHandle.standardError.write("usage: nanokvm-capture list | stream --device <name> --width <w> --height <h> --fps <f>\n".data(using: .utf8)!)
  exit(2)
}
args.removeFirst()

switch cmd {
case "list":
  listCommand()
case "stream":
  var device = "USB3 Video"
  var width = 1920
  var height = 1080
  var fps = 60.0
  var i = 0
  while i < args.count - 1 {
    switch args[i] {
    case "--device": device = args[i + 1]
    case "--width": width = Int(args[i + 1]) ?? width
    case "--height": height = Int(args[i + 1]) ?? height
    case "--fps": fps = Double(args[i + 1]) ?? fps
    default: break
    }
    i += 2
  }
  streamCommand(device: device, width: width, height: height, fps: fps)
default:
  FileHandle.standardError.write("unknown command: \(cmd)\n".data(using: .utf8)!)
  exit(2)
}
