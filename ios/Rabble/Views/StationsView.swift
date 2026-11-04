import SwiftUI

struct StationsView: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var stations: [Station] = []
    @State private var error: String?
    @State private var loading = true
    @State private var me: Me?
    @State private var showLogin = false

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView().tint(RabbleColors.accent)
                } else if let error {
                    ErrorPanel(message: error) { await load() }
                } else if stations.isEmpty {
                    VStack(spacing: 8) {
                        Text("No stations yet.").font(.title3.weight(.semibold))
                        Text("Stations fill up as hosts tag their shows on the web.")
                            .foregroundStyle(RabbleColors.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(24)
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            Text("Stations").font(.largeTitle.weight(.bold))
                            Text("On-air and upcoming shows by station.")
                                .foregroundStyle(RabbleColors.textSecondary)
                            ForEach(stations) { station in
                                NavigationLink(value: station.tag) {
                                    StationRow(station: station)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(16)
                    }
                    .refreshable { await load() }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RabbleColors.bg.ignoresSafeArea())
            .navigationTitle("Rabble Radio")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: String.self) { tag in
                StationView(tag: tag)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if let me {
                        Button("@\(me.handle)") {
                            env.session.clear()
                            env.sessionVersion += 1
                        }
                    } else {
                        Button("Sign in") { showLogin = true }
                    }
                }
            }
            .sheet(isPresented: $showLogin) {
                LoginView { showLogin = false; env.sessionVersion += 1 }
            }
            .task(id: env.sessionVersion) { await load() }
        }
    }

    private func load() async {
        loading = stations.isEmpty
        do {
            stations = try await env.api.stations()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        me = env.session.hasSession ? try? await env.api.me() : nil
        loading = false
    }
}

struct StationRow: View {
    let station: Station

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(station.tag).font(.headline)
                Spacer()
                Pill(text: station.shows.count == 1 ? "1 show" : "\(station.shows.count) shows")
            }
            HStack(spacing: 8) {
                HStack(spacing: -8) {
                    ForEach(station.hosts.prefix(3), id: \.did) { HostAvatar(host: $0, size: 28) }
                }
                if station.liveCount > 0 { LiveBadge() }
                Spacer()
                if station.listening > 0 {
                    Text("\(station.listening) listening")
                        .font(.caption)
                        .foregroundStyle(RabbleColors.live)
                }
                Text(station.hosts.count == 1 ? "1 host" : "\(station.hosts.count) hosts")
                    .font(.caption)
                    .foregroundStyle(RabbleColors.textTertiary)
            }
        }
        .card()
    }
}

struct ErrorPanel: View {
    let message: String
    let retry: () async -> Void

    var body: some View {
        VStack(spacing: 8) {
            Text("Something went wrong").font(.title3.weight(.semibold))
            Text(message)
                .foregroundStyle(RabbleColors.textSecondary)
                .multilineTextAlignment(.center)
            Button("Retry") { Task { await retry() } }
                .buttonStyle(.borderedProminent)
                .frame(minHeight: 44)
        }
        .padding(24)
    }
}
