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

    nonisolated(unsafe) static var screen: String = "launch"
    nonisolated(unsafe) static var roomSnapshot: [String: Any]?

    static var appVersion: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return "\(short) (\(build))"
    }

    private static func now() -> String { ISO8601DateFormatter().string(from: Date()) }

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
    static func start() { _ = monitor }

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
        var model = ""
        var sysinfo = utsname()
        uname(&sysinfo)
        withUnsafePointer(to: &sysinfo.machine) { ptr in
            ptr.withMemoryRebound(to: CChar.self, capacity: 256) { model = String(cString: $0) }
        }
        return [
            "capturedAt": now(),
            "screen": screen,
            "app": [
                "version": appVersion,
                "bundle": Bundle.main.bundleIdentifier ?? "",
                "baseUrl": baseURL.absoluteString,
            ],
            "device": [
                "model": model,
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
