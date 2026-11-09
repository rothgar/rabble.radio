import SwiftUI

/// The account screen behind the username in the home top bar. Mirrors /me
/// on the web: profile, start a show, every show the user hosts (each with
/// its shareable landing-page URL and a "new session" action), the shows
/// they joined, and sign out at the bottom.
struct MeView: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var nav: Navigator
    @State private var me: Me?
    @State private var shows: MyShows?
    @State private var error: String?
    @State private var startingId: String?
    @State private var startError: String?
    @AppStorage(Appearance.storageKey) private var appearance: String = Appearance.system.rawValue

    var body: some View {
        Group {
            if let me, let shows {
                content(me, shows)
            } else if let error {
                ErrorPanel(message: error) { await load() }
            } else {
                Loading()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RabbleColors.bg.ignoresSafeArea())
        .navigationTitle("My shows")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                FeedbackButton(showId: nil)
                Button("Log out") { logout() }.foregroundStyle(RabbleColors.live)
            }
        }
        .task(id: env.sessionVersion) { await load() }
        .onAppear { Diagnostics.screen = "me" }
    }

    private func load() async {
        do {
            async let profile = env.api.me()
            async let mine = env.api.myShows()
            guard let p = try await profile else { throw APIError(status: 401, code: "unauthorized", message: "Not signed in.") }
            shows = try await mine
            me = p
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func logout() {
        env.session.clear()
        env.sessionVersion += 1
        nav.popToRoot()
    }

    /// Reopen `showId` (or the default show when nil) and jump into it.
    private func start(_ showId: String?) {
        if startingId != nil { return }
        startingId = showId ?? ""
        startError = nil
        Task {
            do {
                let show = try await env.api.startShow(showId: showId)
                nav.push(.show(id: show.id, autoJoin: true))
            } catch {
                startError = error.localizedDescription
            }
            startingId = nil
        }
    }

    private func shareURL(_ show: Show) -> URL {
        if let url = URL(string: show.shareableUrl), !show.shareableUrl.isEmpty { return url }
        return env.api.absolute("/show/\(show.id)")
    }

    @ViewBuilder
    private func content(_ me: Me, _ shows: MyShows) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                profileHeader(me)
                SectionLabel(text: "SHOWS YOU HOST · \(shows.hosted.count)")
                if shows.hosted.isEmpty {
                    Text("You haven't hosted a show yet. Start one and it gets its own page you can share.")
                        .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary).card()
                }
                ForEach(shows.hosted) { show in hostedCard(show) }
                SectionLabel(text: "SHOWS YOU JOINED · \(shows.joined.count)")
                if shows.joined.isEmpty {
                    Text("Shows you listen to or speak on will show up here.")
                        .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary).card()
                }
                ForEach(shows.joined) { joined in joinedCard(joined) }
                SectionLabel(text: "APPEARANCE")
                Picker("Appearance", selection: $appearance) {
                    ForEach(Appearance.allCases) { Text($0.label).tag($0.rawValue) }
                }
                .pickerStyle(.segmented)
                .card()
                Button("Log out") { logout() }
                    .buttonStyle(.bordered)
                    .foregroundStyle(RabbleColors.live)
                    .wideButton()
            }
            .frame(maxWidth: contentMaxWidth)
            .padding(16)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
    }

    private func profileHeader(_ me: Me) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Avatar(name: me.label, avatarUrl: me.avatarUrl, size: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(me.label).font(RabbleFont.style(.headline)).lineLimit(1)
                    Text("@\(me.handle)").font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary).lineLimit(1)
                }
            }
            Text("Start a show to open your studio. Sessions land in your default show unless you start one from a different show below.")
                .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary)
            Button(startingId == "" ? "Starting…" : "Start a show") { start(nil) }
                .buttonStyle(.borderedProminent)
                .disabled(startingId != nil)
                .wideButton()
            if let startError {
                Text(startError).font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.live)
            }
        }
        .card()
    }

    /// One hosted show: status, lifetime numbers, share link, new session.
    private func hostedCard(_ show: Show) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(show.title).font(RabbleFont.style(.headline)).lineLimit(2)
                    Text("\(show.sessionCount) \(show.sessionCount == 1 ? "session" : "sessions") · \(show.totalListeners) \(show.totalListeners == 1 ? "listener" : "listeners") · \(show.likeCount) \(show.likeCount == 1 ? "like" : "likes")")
                        .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary)
                }
                Spacer(minLength: 8)
                if show.isLive {
                    LiveBadge()
                } else if show.status == "scheduled" {
                    Pill(text: "Scheduled")
                } else if show.replay != nil {
                    Pill(text: "Replay")
                } else if show.status == "active" {
                    Pill(text: "Off air")
                } else {
                    Pill(text: "Ended")
                }
            }
            if !show.tags.isEmpty {
                FlowLayout(spacing: 6) { ForEach(show.tags, id: \.self) { Pill(text: $0) } }
            }
            HStack {
                Text(show.shareableUrl.isEmpty ? "/show/\(show.id)" : show.shareableUrl)
                    .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.accent).lineLimit(1)
                Spacer()
                ShareLink(item: shareURL(show), subject: Text(show.title), message: Text("\(show.title) on Rabble Radio")) {
                    Image(systemName: "square.and.arrow.up").frame(width: 44, height: 44)
                }
                .accessibilityLabel("Share show link")
            }
            HStack(spacing: 8) {
                if show.isLive {
                    Button("Back to the room") { nav.push(.show(id: show.id, autoJoin: false)) }
                        .buttonStyle(.borderedProminent).wideButton(height: 44)
                } else {
                    Button(startingId == show.id ? "Starting…" : "Start a session") { start(show.id) }
                        .buttonStyle(.borderedProminent)
                        .disabled(startingId != nil)
                        .wideButton(height: 44)
                    Button("Show page") { nav.push(.show(id: show.id, autoJoin: false)) }
                        .buttonStyle(.bordered).wideButton(height: 44)
                }
            }
        }
        .card()
    }

    private func joinedCard(_ joined: JoinedShow) -> some View {
        HStack(spacing: 12) {
            HostAvatar(host: joined.host)
            VStack(alignment: .leading, spacing: 2) {
                Text(joined.title).font(RabbleFont.style(.headline)).lineLimit(1)
                Text("@\(joined.host.handle) · \(joined.role == "audience" ? "listened" : "on stage")")
                    .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textTertiary).lineLimit(1)
            }
            Spacer(minLength: 8)
            if joined.isLive { LiveBadge() }
            Button("Open") { nav.push(.show(id: joined.showId, autoJoin: false)) }
                .frame(minHeight: 44)
        }
        .card()
    }
}
