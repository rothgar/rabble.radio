import SwiftUI

struct StationView: View {
    @EnvironmentObject private var env: AppEnvironment
    let tag: String
    @State private var shows: [Show] = []
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        Group {
            if loading {
                ProgressView().tint(RabbleColors.accent)
            } else if let error {
                ErrorPanel(message: error) { await load() }
            } else if shows.isEmpty {
                VStack(spacing: 8) {
                    Text("No shows in this station yet.").font(.title3.weight(.semibold))
                    Text("When a host tags a show with \(tag), it will appear here.")
                        .foregroundStyle(RabbleColors.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .padding(24)
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        HStack {
                            Text("\(shows.count) shows").foregroundStyle(RabbleColors.textSecondary)
                            Spacer()
                            Pill(
                                text: "\(shows.reduce(0) { $0 + $1.listenerCount }) listening",
                                color: RabbleColors.live,
                                background: RabbleColors.live.opacity(0.15)
                            )
                        }
                        ForEach(shows) { show in
                            NavigationLink(value: show) {
                                ShowRow(show: show)
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
        .navigationTitle(tag)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Show.self) { show in
            ShowView(showId: show.id)
        }
        .task { await load() }
    }

    private func load() async {
        loading = shows.isEmpty
        do {
            shows = try await env.api.shows(forStation: tag)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

struct ShowRow: View {
    let show: Show

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                HostAvatar(host: show.host)
                VStack(alignment: .leading, spacing: 2) {
                    Text(show.title).font(.headline).lineLimit(1)
                    Text("@\(show.host.handle)").font(.caption).foregroundStyle(RabbleColors.textTertiary).lineLimit(1)
                }
                Spacer()
                if show.isLive { LiveBadge() }
            }
            HStack(spacing: 12) {
                Text("\(show.listenerCount) listening")
                Text("\(show.speakerCount) on stage")
                Text("\(show.reactionCount) reactions")
            }
            .font(.caption)
            .foregroundStyle(RabbleColors.textSecondary)
            HStack(spacing: 6) {
                ForEach(show.tags, id: \.self) { Pill(text: $0) }
            }
        }
        .card()
    }
}
