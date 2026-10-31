import SwiftUI
import WebKit

/// Runs the web app's Bluesky OAuth flow in a WKWebView. When the callback
/// lands back on the app origin with a session cookie, the cookie is synced
/// into HTTPCookieStorage and the sheet closes.
struct LoginView: View {
    @EnvironmentObject private var env: AppEnvironment
    let onDone: () -> Void

    var body: some View {
        NavigationStack {
            LoginWebView(baseURL: env.baseURL, session: env.session, onDone: onDone)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("Sign in with Bluesky")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { Button("Close") { onDone() } }
                }
        }
    }
}

struct LoginWebView: UIViewRepresentable {
    let baseURL: URL
    let session: SessionStore
    let onDone: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView(frame: .zero)
        view.navigationDelegate = context.coordinator
        view.load(URLRequest(url: baseURL.appending(path: "/login")))
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        let parent: LoginWebView
        init(_ parent: LoginWebView) { self.parent = parent }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard let url = webView.url, let host = parent.baseURL.host, url.host == host else { return }
            let path = url.path
            guard !path.hasPrefix("/login"), !path.hasPrefix("/api/auth/") else { return }
            Task { @MainActor in
                await parent.session.sync(from: webView.configuration.websiteDataStore.httpCookieStore)
                if parent.session.hasSession { parent.onDone() }
            }
        }
    }
}
