import AVFoundation
import LiveKit
import SwiftUI

struct ShowView: View {
    @EnvironmentObject private var env: AppEnvironment
    let showId: String

    @State private var show: Show?
    @State private var error: String?
    @State private var loading = true
    @State private var signedIn = false
    @State private var showLogin = false
    @StateObject private var room = RoomSession()

    var body: some View {
        Group {
            if loading {
                ProgressView().tint(RabbleColors.accent)
            } else if let error {
                ErrorPanel(message: error) { await load() }
            } else if let show {
                ScrollView {
                    VStack(spacing: 16) {
                        header(show)
                        roomPanel(show)
                    }
                    .padding(16)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RabbleColors.bg.ignoresSafeArea())
        .navigationTitle(show?.title ?? "Show")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showLogin) {
            LoginView { showLogin = false; env.sessionVersion += 1 }
        }
        .task(id: env.sessionVersion) { await load() }
        .onDisappear { room.leave() }
    }

    private func load() async {
        signedIn = env.session.hasSession
        do {
            show = try await env.api.show(id: showId)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    @ViewBuilder
    private func header(_ show: Show) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                if show.isLive { LiveBadge() } else { Pill(text: show.status.capitalized) }
                Spacer()
                Text("\(show.listenerCount) listening").font(.caption).foregroundStyle(RabbleColors.textSecondary)
            }
            Text(show.title).font(.title2.weight(.semibold))
            HStack(spacing: 8) {
                HostAvatar(host: show.host, size: 28)
                Text(show.host.displayName ?? "@\(show.host.handle)").foregroundStyle(RabbleColors.textSecondary)
            }
            if let description = show.description, !description.isEmpty {
                Text(description)
            }
            HStack(spacing: 6) { ForEach(show.tags, id: \.self) { Pill(text: $0) } }
        }
        .card()
    }

    @ViewBuilder
    private func roomPanel(_ show: Show) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            switch room.state {
            case .idle, .failed:
                if case .failed(let message) = room.state {
                    Text(message).foregroundStyle(RabbleColors.live)
                }
                if signedIn {
                    Text(show.isLive ? "Joining connects you to the live audio room." : "This show is not live yet; you can still join the room.")
                        .foregroundStyle(RabbleColors.textSecondary)
                    Button("Join") { Task { await room.join(showId: showId, api: env.api) } }
                        .buttonStyle(.borderedProminent)
                        .frame(maxWidth: .infinity, minHeight: 44)
                } else {
                    Text("Listen without an account. You count toward the listener total but stay invisible; sign in with Bluesky to take the stage.")
                        .foregroundStyle(RabbleColors.textSecondary)
                    HStack(spacing: 8) {
                        Button("Listen") { Task { await room.join(showId: showId, api: env.api) } }
                            .buttonStyle(.borderedProminent)
                            .frame(maxWidth: .infinity, minHeight: 44)
                        Button("Sign in") { showLogin = true }
                            .buttonStyle(.bordered)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                }
            case .joining:
                Text("Connecting…").foregroundStyle(RabbleColors.textSecondary)
            case .connected(let join):
                let role = join.anonymous ? "anonymous listener" : join.role
                Text("Connected as \(role) · \(room.participants) in the room")
                    .foregroundStyle(RabbleColors.success)
                HStack(spacing: 8) {
                    if join.role != "audience" {
                        Button(room.micOn ? "Mute mic" : "Unmute mic") { Task { await room.toggleMic() } }
                            .buttonStyle(.bordered)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    Button("Leave") { room.leave() }
                        .buttonStyle(.borderedProminent)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
            }
        }
        .card()
    }
}

/// Owns the LiveKit room connection for the show screen.
@MainActor
final class RoomSession: ObservableObject, RoomDelegate {
    enum State {
        case idle, joining
        case connected(JoinResponse)
        case failed(String)
    }

    @Published var state: State = .idle
    @Published var participants = 0
    @Published var micOn = false

    private lazy var room = Room(delegate: self)

    func join(showId: String, api: RabbleAPI) async {
        state = .joining
        do {
            let join = try await api.join(showId: showId)
            // Relay credentials from the join response replace the SFU's own
            // ICE list so devices off the homelab LAN can reach the room.
            let iceServers = (join.iceServers ?? []).map {
                IceServer(urls: $0.urls, username: $0.username, credential: $0.credential)
            }
            try await room.connect(
                url: join.wsUrl,
                token: join.token,
                connectOptions: ConnectOptions(iceServers: iceServers)
            )
            if join.role == "host" {
                try await room.localParticipant.setMicrophone(enabled: true)
                micOn = true
            }
            participants = room.remoteParticipants.count + 1
            state = .connected(join)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func toggleMic() async {
        do {
            try await room.localParticipant.setMicrophone(enabled: !micOn)
            micOn.toggle()
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func leave() {
        Task { await room.disconnect() }
        state = .idle
        micOn = false
    }

    nonisolated func room(_ room: Room, participantDidConnect participant: RemoteParticipant) {
        Task { @MainActor in self.participants = room.remoteParticipants.count + 1 }
    }

    nonisolated func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
        Task { @MainActor in self.participants = room.remoteParticipants.count + 1 }
    }

    nonisolated func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldConnectionState: ConnectionState) {
        Task { @MainActor in
            if case .disconnected = connectionState, case .connected = self.state { self.state = .idle }
        }
    }
}
