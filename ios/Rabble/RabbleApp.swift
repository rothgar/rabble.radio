import SwiftUI
import UserNotifications

@main
struct RabbleApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var env: AppEnvironment
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(Appearance.storageKey) private var appearance: String = Appearance.system.rawValue

    init() {
        let env = AppEnvironment()
        _env = StateObject(wrappedValue: env)
        AppDelegate.env = env
        Diagnostics.start()
        CrashReporter.install()
        Reminders.register(env: env)
        Task { @MainActor in
            await CrashReporter.sendPendingReport(env: env)
        }
    }

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environmentObject(env)
                .preferredColorScheme((Appearance(rawValue: appearance) ?? .system).colorScheme)
                .tint(RabbleColors.accent)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await Reminders.poll(env: env) }
            } else if phase == .background {
                Reminders.schedule()
            }
        }
    }
}

/// Shared services: base URL, session cookies, API client.
@MainActor
final class AppEnvironment: ObservableObject {
    let baseURL: URL
    let session: SessionStore
    let api: RabbleAPI
    /// Bumped after login/logout so views re-check the session.
    @Published var sessionVersion = 0
    /// Show id from a tapped reminder notification; consumed by HomeView.
    @Published var pendingShowId: String?
    var pendingAutoJoin = false

    init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "RabbleBaseURL") as? String
        let url = URL(string: configured?.isEmpty == false ? configured! : "https://rabble.rodeo")!
        baseURL = url
        session = SessionStore(baseURL: url)
        api = RabbleAPI(baseURL: url, session: session)
        // Development aid for a headless simulator, where nothing can be
        // tapped: `-showId <id>` opens that show on launch and `-autoJoin`
        // joins it straight away.
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-showId"), i + 1 < args.count {
            pendingShowId = args[i + 1]
            pendingAutoJoin = args.contains("-autoJoin")
        }
    }
}

/// Routes notification taps to the show they are about.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    nonisolated(unsafe) static var env: AppEnvironment?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let showId = response.notification.request.content.userInfo[Reminders.showIdKey] as? String
        await MainActor.run { AppDelegate.env?.pendingShowId = showId }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
