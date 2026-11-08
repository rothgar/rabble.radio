import SwiftUI

struct StationView: View {
    @EnvironmentObject private var env: AppEnvironment
    let tag: String
    @State private var shows: [Show]?
    @State private var error: String?

    var body: some View {
        Group {
            if let shows {
                if shows.isEmpty {
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
                                NavigationLink(value: Route.show(id: show.id, autoJoin: false)) { ShowCard(show: show) }
                                    .buttonStyle(.plain)
                            }
                        }
                        .frame(maxWidth: contentMaxWidth)
                        .padding(16)
                        .frame(maxWidth: .infinity)
                    }
                    .refreshable { await load() }
                }
            } else if let error {
                ErrorPanel(message: error) { await load() }
            } else {
                Loading()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RabbleColors.bg.ignoresSafeArea())
        .navigationTitle(tag)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { FeedbackButton(showId: nil) } }
        .task { await load() }
        .onAppear { Diagnostics.screen = "station/\(tag)" }
    }

    private func load() async {
        do {
            shows = try await env.api.shows(forStation: tag)
            error = nil
        } catch {
            if shows == nil { self.error = error.localizedDescription }
        }
    }
}
