import AVFoundation
import Foundation
import Network
import UIKit

/// State and environment capture for the feedback button. Screens report
/// where the user is and what the room looks like; the API client records
/// failed requests; `collect()` adds device, OS, display, network and
/// permission details at send time.
enum Diagnostics {
    private static let maxEvents = 30
    private static let lock = NSLock()
    private static var events: [[String: Any]] = []
    private static let monitor: NWPathMonitor = {
        let m = NWPathMonitor()
        m.start(queue: DispatchQueue(label: "radio.rabble.network"))
        return m
    }()

    nonisolated(unsafe) static var screen: String = "launch" {
        didSet { updateScreenBuffer() }
    }
    nonisolated(unsafe) static var roomSnapshot: [String: Any]?

    /// `screen` mirrored into raw bytes so `CrashReporter`'s signal handler
    /// can read it without touching Swift `String` (not async-signal-safe)
    /// from inside the handler. Updated on every `screen` write; read-only
    /// by the time a signal could fire.
    private static let screenBufferCapacity = 64
    nonisolated(unsafe) static var screenBuffer = [UInt8](repeating: 0, count: screenBufferCapacity)
    nonisolated(unsafe) static var screenBufferLength = 0

    private static func updateScreenBuffer() {
        let bytes = Array(screen.utf8.prefix(screenBufferCapacity))
        for i in 0..<screenBufferCapacity { screenBuffer[i] = i < bytes.count ? bytes[i] : 0 }
        screenBufferLength = bytes.count
    }

    static var appVersion: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return "\(short) (\(build))"
    }

    private static func now() -> String { ISO8601DateFormatter().string(from: Date()) }

    /// Hardware model identifier (e.g. "iPhone15,4"), read via `uname(3)`
    /// since `UIDevice.current.model` only returns the generic "iPhone".
    static var deviceModel: String {
        var sysinfo = utsname()
        uname(&sysinfo)
        return withUnsafePointer(to: &sysinfo.machine) { ptr in
            ptr.withMemoryRebound(to: CChar.self, capacity: 256) { String(cString: $0) }
        }
    }

    /// Note something worth seeing in a report: API failures, room drops, permission denials.
    static func event(_ kind: String, _ message: String, extra: [String: Any]? = nil) {
        var o: [String: Any] = ["at": now(), "kind": kind, "message": String(message.prefix(500))]
        if let extra { o["extra"] = extra }
        lock.lock()
        events.append(o)
        while events.count > maxEvents { events.removeFirst() }
        lock.unlock()
    }

    static func setRoom(showId: String, role: String, connected: Bool, onAir: Bool, micOn: Bool, members: Int, anonymousListeners: Int, invitePending: Bool) {
        roomSnapshot = [
            "showId": showId,
            "role": role,
            "connected": connected,
            "onAir": onAir,
            "micOn": micOn,
            "members": members,
            "anonymousListeners": anonymousListeners,
            "invitePending": invitePending,
            "updatedAt": now(),
        ]
    }

    static func clearRoom() { roomSnapshot = nil }

    /// Start watching the network early so the type is known at report time.
    static func start() {
        _ = monitor
        updateScreenBuffer()
    }

    @MainActor
    static func collect(baseURL: URL) -> [String: Any] {
        let device = UIDevice.current
        let screenInfo = UIScreen.main
        let path = monitor.currentPath
        let network: String
        if path.status != .satisfied {
            network = "none"
        } else if path.usesInterfaceType(.wifi) {
            network = "wifi"
        } else if path.usesInterfaceType(.cellular) {
            network = "cellular"
        } else if path.usesInterfaceType(.wiredEthernet) {
            network = "ethernet"
        } else {
            network = "other"
        }
        let mic: String
        switch AVAudioApplication.shared.recordPermission {
        case .granted: mic = "granted"
        case .denied: mic = "denied"
        default: mic = "undetermined"
        }
        lock.lock()
        let recent = events
        lock.unlock()
        return [
            "capturedAt": now(),
            "screen": screen,
            "app": [
                "version": appVersion,
                "bundle": Bundle.main.bundleIdentifier ?? "",
                "baseUrl": baseURL.absoluteString,
            ],
            "device": [
                "model": deviceModel,
                "name": device.model,
                "systemName": device.systemName,
                "systemVersion": device.systemVersion,
                "locale": Locale.current.identifier,
            ],
            "display": [
                "widthPt": screenInfo.bounds.width,
                "heightPt": screenInfo.bounds.height,
                "scale": screenInfo.scale,
                "orientation": screenInfo.bounds.width > screenInfo.bounds.height ? "landscape" : "portrait",
            ],
            "network": [
                "type": network,
                "expensive": path.isExpensive,
                "constrained": path.isConstrained,
            ],
            "permissions": ["microphone": mic],
            "room": roomSnapshot ?? NSNull(),
            "recentEvents": recent,
        ]
    }
}
