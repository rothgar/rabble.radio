import SwiftUI

@main
struct RabbleApp: App {
    @StateObject private var env = AppEnvironment()

    var body: some Scene {
        WindowGroup {
            StationsView()
                .environmentObject(env)
                .preferredColorScheme(.dark)
                .tint(RabbleColors.accent)
        }
    }
}

/// Shared services: base URL, session cookies, API client.
final class AppEnvironment: ObservableObject {
    let baseURL: URL
    let session: SessionStore
    let api: RabbleAPI
    /// Bumped after login/logout so views re-check the session.
    @Published var sessionVersion = 0

    init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "RabbleBaseURL") as? String
        let url = URL(string: configured?.isEmpty == false ? configured! : "https://rabble.jgarr.net")!
        baseURL = url
        session = SessionStore(baseURL: url)
        api = RabbleAPI(baseURL: url, session: session)
    }
}
