import Foundation
import UIKit

/// DIY crash reporter (no Crashlytics/Sentry/Bugsnag): installs a signal
/// handler and an uncaught-exception handler at launch, persists a
/// plain-text report to disk, and the next cold start sends it to
/// `POST /api/crashes` and deletes it.
///
/// A signal handler runs in a context where almost nothing is safe to call
/// — no Foundation, no allocation, no network — so that path only ever
/// writes to a descriptor opened ahead of time and calls
/// `backtrace_symbols_fd`, which the `backtrace_symbols(3)` man page
/// documents as safe to use from a signal handler (unlike
/// `backtrace_symbols`, which allocates). `backtrace()` itself isn't on
/// that guarantee — it can lazily `dlopen` symbolication support on its
/// first call — so `install()` calls it once up front to force that work
/// to happen outside any signal. The uncaught-exception handler runs on
/// the raising thread before the process dies, not inside a signal, so it
/// can use ordinary Foundation calls.
enum CrashReporter {
    static let reportFileName = "crash-report.txt"
    private static let pendingFileName = "crash-report.pending.txt"
    private static let maxFrames: Int32 = 64
    private static let signals: [Int32] = [SIGABRT, SIGILL, SIGSEGV, SIGTRAP, SIGBUS]
    private static let frames = UnsafeMutablePointer<UnsafeMutableRawPointer?>.allocate(capacity: Int(maxFrames))
    private static var fd: Int32 = -1

    private static var cachesDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    }

    static var reportURL: URL { cachesDirectory.appendingPathComponent(reportFileName) }

    /// Where a report from a *previous* launch is parked the moment this
    /// launch starts, so opening a fresh write descriptor below (which
    /// truncates `reportURL`) can never destroy it before it's sent.
    private static var pendingURL: URL { cachesDirectory.appendingPathComponent(pendingFileName) }

    /// Call once, early in app launch, alongside `Diagnostics.start()`.
    ///
    /// Accepted tradeoff: this overwrites whatever was already at
    /// `pendingURL`, so a crash during this same launch before
    /// `sendPendingReport` gets even one run-loop turn to send and clear it
    /// loses that report. Narrow and far better than always losing every
    /// report, which an earlier version of this code did.
    static func install() {
        _ = frames // force the one-time allocation now, never inside a signal handler
        _ = backtrace(frames, maxFrames) // warm up: force any lazy symbolication setup now, not in a signal

        let url = reportURL
        if FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.removeItem(at: pendingURL)
            try? FileManager.default.moveItem(at: url, to: pendingURL)
        }

        fd = url.path.withCString { open($0, O_WRONLY | O_CREAT | O_TRUNC, 0o644) }
        guard fd >= 0 else { return }

        NSSetUncaughtExceptionHandler { exception in
            CrashReporter.writeException(exception)
        }
        for sig in signals {
            signal(sig, CrashReporter.handleSignal)
        }
    }

    private static func writeException(_ exception: NSException) {
        guard fd >= 0 else { return }
        let text = """
        exceptionClass: \(exception.name.rawValue)
        screen: \(Diagnostics.screen)
        message: \(exception.reason ?? exception.name.rawValue)
        STACK
        \(exception.callStackSymbols.joined(separator: "\n"))
        """
        text.withCString { _ = write(fd, $0, strlen($0)) }
        close(fd)
        fd = -1
    }

    private static func writeBytes(_ s: StaticString) {
        s.withUTF8Buffer { _ = write(fd, $0.baseAddress, $0.count) }
    }

    private static func signalName(_ sig: Int32) -> StaticString {
        switch sig {
        case SIGABRT: return "SIGABRT"
        case SIGILL: return "SIGILL"
        case SIGSEGV: return "SIGSEGV"
        case SIGTRAP: return "SIGTRAP"
        case SIGBUS: return "SIGBUS"
        default: return "SIGUNKNOWN"
        }
    }

    /// Async-signal-safe only: every call here is either a raw syscall, a
    /// read of the fixed byte buffer `Diagnostics` keeps in sync with
    /// `screen` (no `String`, no allocation), or `backtrace_symbols_fd`.
    private static let handleSignal: @convention(c) (Int32) -> Void = { sig in
        guard CrashReporter.fd >= 0 else { _exit(1) }
        let d = CrashReporter.fd
        let name = CrashReporter.signalName(sig)
        CrashReporter.writeBytes("exceptionClass: ")
        CrashReporter.writeBytes(name)
        CrashReporter.writeBytes("\nscreen: ")
        Diagnostics.screenBuffer.withUnsafeBufferPointer { buf in
            _ = write(d, buf.baseAddress, Diagnostics.screenBufferLength)
        }
        CrashReporter.writeBytes("\nmessage: uncaught signal ")
        CrashReporter.writeBytes(name)
        CrashReporter.writeBytes("\nSTACK\n")
        let count = backtrace(CrashReporter.frames, maxFrames)
        backtrace_symbols_fd(CrashReporter.frames, count, d)
        close(d)
        signal(sig, SIG_DFL)
        raise(sig)
    }

    // MARK: - Sending on next launch

    private struct ParsedReport {
        let exceptionClass: String
        let message: String
        let screen: String
        let stack: String
    }

    /// Checks for a report a previous launch parked at `pendingURL`, sends
    /// it, and deletes the file either way. Fire-and-forget: a send
    /// failure is ignored, same as the rest of the client's background
    /// reporting.
    static func sendPendingReport(env: AppEnvironment) async {
        let url = pendingURL
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return }
        defer { try? FileManager.default.removeItem(at: url) }
        guard let report = parse(text) else { return }

        try? await env.api.reportCrash(
            exceptionClass: report.exceptionClass,
            message: report.message,
            stack: report.stack,
            osVersion: UIDevice.current.systemVersion,
            device: Diagnostics.deviceModel,
            screen: report.screen
        )
    }

    /// Reads the fixed `exceptionClass:`/`screen:` header lines, then a
    /// `message:` field that runs, possibly over several lines, up to the
    /// `STACK` marker — `message` is written last among the header fields
    /// specifically so a multi-line `NSException.reason` (Auto Layout's
    /// constraint-conflict exceptions are a common example) survives
    /// intact instead of being cut to its first line.
    private static func parse(_ text: String) -> ParsedReport? {
        let lines = text.components(separatedBy: "\n")
        var exceptionClass = ""
        var screen = ""
        var message = ""
        var i = 0
        while i < lines.count {
            let line = lines[i]
            if line.hasPrefix("exceptionClass: ") {
                exceptionClass = String(line.dropFirst("exceptionClass: ".count))
                i += 1
            } else if line.hasPrefix("screen: ") {
                screen = String(line.dropFirst("screen: ".count))
                i += 1
            } else if line.hasPrefix("message: ") {
                var messageLines = [String(line.dropFirst("message: ".count))]
                i += 1
                while i < lines.count, lines[i] != "STACK" {
                    messageLines.append(lines[i])
                    i += 1
                }
                message = messageLines.joined(separator: "\n")
            } else if line == "STACK" {
                i += 1
                break
            } else {
                i += 1
            }
        }
        guard !message.isEmpty else { return nil }
        let stack = lines[min(i, lines.count)...].joined(separator: "\n")
        return ParsedReport(exceptionClass: exceptionClass, message: message, screen: screen, stack: stack)
    }
}
