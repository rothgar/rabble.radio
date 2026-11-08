import BackgroundTasks
import Foundation
import UserNotifications

/// "Notify me" delivery. The server keeps the reminders; the app asks it for
/// shows that just went on air whenever iOS gives it background time
/// (BGAppRefreshTask, roughly every 15 minutes at best) and every time it
/// comes to the foreground, then posts a local notification for each.
/// Tapping one opens the show.
@MainActor
enum Reminders {
    static let taskId = "radio.rabble.ios.reminders"
    static let showIdKey = "showId"

    /// Must run before the app finishes launching.
    static func register(env: AppEnvironment) {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskId, using: nil) { task in
            guard let task = task as? BGAppRefreshTask else { return }
            schedule()
            let work = Task { @MainActor in
                let ok = await poll(env: env)
                task.setTaskCompleted(success: ok)
            }
            task.expirationHandler = { work.cancel() }
        }
    }

    /// Idempotent: ask for the next refresh window.
    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: taskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    static func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
    }

    static func canPost() async -> Bool {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
    }

    /// Fetch due reminders and notify. Returns false when the fetch failed.
    @discardableResult
    static func poll(env: AppEnvironment) async -> Bool {
        guard env.session.hasSession else { return true }
        do {
            for due in try await env.api.dueReminders() {
                await notifyOnAir(showId: due.spaceId, title: due.title, hostName: due.hostName)
            }
            return true
        } catch {
            Diagnostics.event("reminder_poll_failed", error.localizedDescription)
            return false
        }
    }

    static func notifyOnAir(showId: String, title: String, hostName: String) async {
        guard await canPost() else { return }
        let content = UNMutableNotificationContent()
        content.title = "\(title) is on air"
        content.body = "\(hostName) just went live on Rabble Radio."
        content.sound = .default
        content.userInfo = [showIdKey: showId]
        let request = UNNotificationRequest(identifier: "reminder-\(showId)", content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }
}
