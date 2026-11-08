import SwiftUI

/// The landing screen: every visible show (on air first), the "Start a show"
/// call to action for signed-in users, and the stations to browse by topic.
/// Mirrors / on the web.
struct HomeView: View {
    @EnvironmentObject private var env: AppEnvironment
    @StateObject private var nav = Navigator()
    @State private var shows: [Show]?
    @State private var error: String?
    @State private var me: Me?
    @State private var showLogin = false
    @State private var starting = false
    @State private var startError: String?

    var body: some View {
        NavigationStack(path: $nav.path) {
            Group {
                if let shows {
                    content(shows)
                } else if let error {
                    ErrorPanel(message: error) { await load() }
                } else {
                    Loading()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RabbleColors.bg.ignoresSafeArea())
            .navigationTitle("Rabble Radio")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    FeedbackButton(showId: nil)
                    if let me {
                        Button {
                            nav.push(.me)
                        } label: {
                            HStack(spacing: 8) {
                                Avatar(name: me.label, avatarUrl: me.avatarUrl, size: 24)
                                Text("@\(me.handle)").lineLimit(1)
                            }
                        }
                    } else {
                        Button("Sign in") { showLogin = true }
                    }
                }
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .station(let tag): StationView(tag: tag)
                case .show(let id, let autoJoin): ShowView(env: env, showId: id, autoJoin: autoJoin)
                case .me: MeView()
                }
            }
            .sheet(isPresented: $showLogin) {
                LoginView { showLogin = false; env.sessionVersion += 1 }
            }
            .task(id: env.sessionVersion) { await load() }
            .onChange(of: env.pendingShowId) { _, _ in openPendingShow() }
        }
        .environmentObject(nav)
        .onAppear {
            Diagnostics.screen = "home"
            openPendingShow()
        }
    }

    /// A reminder notification was tapped (or a launch argument named a show): jump to it.
    private func openPendingShow() {
        guard let wanted = env.pendingShowId else { return }
        env.pendingShowId = nil
        let autoJoin = env.pendingAutoJoin
        env.pendingAutoJoin = false
        nav.push(.show(id: wanted, autoJoin: autoJoin))
    }

    private func load() async {
        // Keep the current list on screen while it refreshes (after sign-in,
        // say); only the very first load shows the spinner. Profile and
        // listing are independent requests, so they run together.
        async let profile: Me? = env.session.hasSession ? (try? await env.api.me()) : nil
        do {
            shows = try await env.api.listShows()
            error = nil
        } catch {
            if shows == nil { self.error = error.localizedDescription }
        }
        me = await profile
    }

    private func startShow() {
        if starting { return }
        starting = true
        startError = nil
        Task {
            do {
                let show = try await env.api.startShow()
                nav.push(.show(id: show.id, autoJoin: true))
            } catch {
                startError = error.localizedDescription
            }
            starting = false
        }
    }

    @ViewBuilder
    private func content(_ shows: [Show]) -> some View {
        let forYou = shows.filter(\.forYou).sorted { a, b in
            if a.isLive != b.isLive { return a.isLive }
            return a.listenerCount > b.listenerCount
        }
        let onAir = shows.filter(\.isLive).sorted { score($0) > score($1) }
        let offAir = shows.filter { !$0.isLive }.sorted { lifetime($0) > lifetime($1) }
        let stations = Station.group(shows)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text("Shows").font(.largeTitle.weight(.bold))
                Text("On-air and upcoming shows from Bluesky hosts.").foregroundStyle(RabbleColors.textSecondary)
                startCard
                if shows.isEmpty {
                    VStack(spacing: 8) {
                        Text("No shows yet.").font(.title3.weight(.semibold))
                        Text(me != nil ? "Start one and invite people to the stage." : "Sign in with Bluesky to start the first one.")
                            .foregroundStyle(RabbleColors.textSecondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
                }
                if !forYou.isEmpty {
                    SectionLabel(text: "FOR YOU").padding(.top, 8)
                    Text("Hosts you follow on Bluesky, and rooms your follows are in.").font(.caption).foregroundStyle(RabbleColors.textSecondary)
                    ForEach(forYou) { show in showLink(show) }
                }
                if !onAir.isEmpty {
                    SectionLabel(text: "ON AIR NOW").padding(.top, 8)
                    ForEach(onAir) { show in showLink(show) }
                }
                if !offAir.isEmpty {
                    SectionLabel(text: onAir.isEmpty ? "POPULAR SHOWS" : "POPULAR · OFF AIR & UPCOMING").padding(.top, 8)
                    ForEach(offAir) { show in showLink(show) }
                }
                if !stations.isEmpty {
                    SectionLabel(text: "STATIONS").padding(.top, 16)
                    Text("Browse shows by topic.").font(.caption).foregroundStyle(RabbleColors.textSecondary)
                    FlowLayout(spacing: 8) {
                        ForEach(stations) { station in
                            NavigationLink(value: Route.station(station.tag)) {
                                Pill(text: "\(station.tag) · \(station.shows.count)" + (station.liveCount > 0 ? " · on air" : ""))
                                    .frame(minHeight: 44)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .frame(maxWidth: contentMaxWidth)
            .padding(16)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
    }

    private func showLink(_ show: Show) -> some View {
        NavigationLink(value: Route.show(id: show.id, autoJoin: false)) { ShowCard(show: show) }
            .buttonStyle(.plain)
    }

    private var startCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Go live from your phone").font(.headline)
            Text(me != nil
                 ? "Open a studio, invite people to the stage, then press On air when you're ready. You can name the show once you're in."
                 : "Sign in with Bluesky to host a show. Listening never needs an account.")
                .font(.caption)
                .foregroundStyle(RabbleColors.textSecondary)
            if me != nil {
                Button(starting ? "Starting…" : "Start a show") { startShow() }
                    .buttonStyle(.borderedProminent)
                    .disabled(starting)
                    .wideButton()
            } else {
                Button("Sign in to start a show") { showLogin = true }
                    .buttonStyle(.bordered)
                    .wideButton()
            }
            if let startError {
                Text(startError).font(.caption).foregroundStyle(RabbleColors.live)
            }
        }
        .card()
    }

    private func score(_ s: Show) -> Int { s.listenerCount * 3 + s.speakerCount * 5 + s.reactionCount }
    private func lifetime(_ s: Show) -> Int { s.totalListeners * 3 + s.likeCount * 4 + s.reactionCount }
}
