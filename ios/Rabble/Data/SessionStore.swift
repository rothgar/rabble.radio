import Foundation
import WebKit

/// The web app authenticates with an iron-session cookie set during the
/// Bluesky OAuth flow, which runs in a WKWebView. After the round trip the
/// cookie is copied from the WebView's cookie store into HTTPCookieStorage so
/// URLSession sends it on API calls.
@MainActor
final class SessionStore {
    static let sessionCookie = "bs_spaces_session"
    let baseURL: URL

    init(baseURL: URL) { self.baseURL = baseURL }

    var hasSession: Bool {
        (HTTPCookieStorage.shared.cookies(for: baseURL) ?? []).contains { $0.name == Self.sessionCookie }
    }

    /// Pull cookies out of the WebView store after the OAuth round trip.
    func sync(from store: WKHTTPCookieStore) async {
        guard let host = baseURL.host else { return }
        for cookie in await store.allCookies() where cookie.domain.hasSuffix(host) {
            HTTPCookieStorage.shared.setCookie(cookie)
        }
    }

    func clear() {
        for cookie in HTTPCookieStorage.shared.cookies(for: baseURL) ?? [] {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
        let store = WKWebsiteDataStore.default().httpCookieStore
        Task {
            for cookie in await store.allCookies() {
                await store.deleteCookie(cookie)
            }
        }
    }
}
