import AVFoundation
import Foundation
import LiveKit
import SwiftUI

/// One person in the room as the UI shows them. Anonymous listeners are counted, not listed.
struct RoomMember: Identifiable, Hashable {
    let identity: String
    let name: String
    let avatarUrl: String?
    let isHost: Bool
    let onStage: Bool
    let speaking: Bool
    let micOn: Bool
    let isLocal: Bool
    /// Listener asking to speak (LiveKit participant attribute `hand`).
    let handRaised: Bool
    var id: String { identity }
}

/// A reaction in flight. `origin` is the top centre of the sender's avatar
/// in the show's coordinate space; nil when their tile is not on screen, in
/// which case it rises from the bottom centre.
struct FloatingEmoji: Identifiable {
    let id: UInt64
    let emoji: String
    let origin: CGPoint?
    let jitter: CGFloat
}

/// How long a reaction stays on screen.
let reactionFloatSeconds: Double = 3.2
let reactions = ["👍", "❤️", "😂", "🎉", "👏"]
private let stagePollSeconds: Double = 4

struct ConnectedRoom {
    var join: JoinResponse
    var members: [RoomMember] = []
    var anonymousListeners: Int = 0
    var micOn: Bool = false
    var onAir: Bool = false
    var invitePending: Bool = false
    var stageBusy: Bool = false
    var notice: String?
    /// Someone other than us is publishing audio (so pre-show music should yield).
    var remoteAudio: Bool = false
    /// The local listener's hand is up.
    var handRaised: Bool = false
    /// Listeners the host has invited this session.
    var invited: Set<String> = []

    var isHost: Bool { join.role == "host" }
    var onStage: Bool { join.onStage }
    var listening: Int { members.filter { !$0.onStage }.count + anonymousListeners }
    var raisedHands: [RoomMember] { members.filter { !$0.onStage && $0.handRaised } }
    /// We are on stage, on air, and the only one left — leaving would end the show.
    var lastOnStage: Bool { onAir && onStage && members.filter { $0.onStage }.count <= 1 }
}

enum RoomState {
    case idle
    case joining
    case connected(ConnectedRoom)
    case failed(String)

    var connected: ConnectedRoom? {
        if case .connected(let c) = self { return c }
        return nil
    }

    var isJoining: Bool {
        if case .joining = self { return true }
        return false
    }
}

/// Everything the show screen knows: the show itself, the LiveKit room,
/// who is in it, reactions in flight, and the host's controls.
@MainActor
final class ShowModel: ObservableObject {
    let showId: String
    private let env: AppEnvironment

    @Published var show: Show?
    @Published var loadError: String?
    @Published var signedIn = false
    @Published var me: Me?
    @Published var room: RoomState = .idle
    @Published var profiles: [String: UserSummary] = [:]
    @Published var floating: [FloatingEmoji] = []
    @Published var reminded = false
    @Published var remindBusy = false
    @Published var moodBusy = false
    @Published var editing = false
    @Published var confirmLeave = false
    /// Top centre of each member's avatar in the show coordinate space, kept fresh by the tiles.
    var avatarCentres: [String: CGPoint] = [:]

    private var lkRoom: Room!
    private var delegate: RoomEvents!
    private var autoJoined = false
    private var reconnecting = false
    private var pollTask: Task<Void, Never>?

    init(env: AppEnvironment, showId: String) {
        self.env = env
        self.showId = showId
        delegate = RoomEvents(model: self)
        lkRoom = Room(delegate: delegate)
    }

    var isHost: Bool { room.connected?.isHost ?? false }
    /// Hosting now, or the owner of this show looking at it from outside the room.
    var isHostOfShow: Bool {
        if isHost { return true }
        guard let did = show?.host.did, let mine = me?.did else { return false }
        return did == mine
    }

    func load(autoJoin: Bool) async {
        signedIn = env.session.hasSession
        async let profile: Me? = env.session.hasSession ? (try? await env.api.me()) : nil
        do {
            let loaded = try await env.api.show(id: showId)
            show = loaded
            reminded = loaded.reminded
            loadError = nil
        } catch {
            if show == nil { loadError = error.localizedDescription }
        }
        me = await profile
        if autoJoin, !autoJoined, show != nil, case .idle = room {
            autoJoined = true
            joinShow()
        }
    }

    // MARK: Room lifecycle

    private func connectOptions(for join: JoinResponse) -> ConnectOptions {
        // Relay credentials from the join response replace the SFU's own ICE
        // list so devices off the homelab LAN can reach the room through
        // Cloudflare TURN.
        let servers = join.iceServers.map { IceServer(urls: $0.urls, username: $0.username, credential: $0.credential) }
        return ConnectOptions(iceServers: servers)
    }

    private func micPermission() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return true
        case .denied: return false
        default: return await AVAudioApplication.requestRecordPermission()
        }
    }

    private func connect(with join: JoinResponse, enableMic: Bool) async throws {
        try await lkRoom.connect(url: join.wsUrl, token: join.token, connectOptions: connectOptions(for: join))
        var micOn = false
        if enableMic, await micPermission() {
            do {
                try await lkRoom.localParticipant.setMicrophone(enabled: true)
                micOn = true
            } catch {
                Diagnostics.event("mic_failed", error.localizedDescription)
            }
        }
        let previous = room.connected
        room = .connected(ConnectedRoom(join: join, micOn: micOn, onAir: previous?.onAir ?? (show?.isLive ?? false)))
        refreshMembers()
        startPolling()
    }

    func joinShow() {
        room = .joining
        Task {
            do {
                let join = try await env.api.join(showId: showId)
                try await connect(with: join, enableMic: join.onStage)
            } catch {
                room = .failed(error.localizedDescription)
                Diagnostics.event("room_failed", error.localizedDescription)
            }
        }
    }

    func leave() {
        pollTask?.cancel()
        pollTask = nil
        let r = lkRoom!
        Task { await r.disconnect() }
        room = .idle
        Diagnostics.clearRoom()
    }

    func toggleMic() {
        guard let current = room.connected else { return }
        Task {
            if !current.micOn, !(await micPermission()) {
                update { $0.notice = "Microphone access is off for Rabble in Settings." }
                return
            }
            do {
                try await lkRoom.localParticipant.setMicrophone(enabled: !current.micOn)
                update { $0.micOn = !current.micOn }
            } catch {
                update { $0.notice = error.localizedDescription }
            }
        }
    }

    /// Listener only: raise or lower a hand. Carried as a LiveKit participant
    /// attribute so the host (and late joiners) see it without a server round trip.
    func toggleHand() {
        guard let current = room.connected, !current.join.anonymous, !current.onStage else { return }
        let next = !current.handRaised
        Task {
            do {
                try await lkRoom.localParticipant.set(attributes: ["hand": next ? "1" : ""])
                update { $0.handRaised = next }
                refreshMembers()
            } catch {
                update { $0.notice = error.localizedDescription }
            }
        }
    }

    /// Host only: ask a listener onto the stage.
    func invite(_ identity: String) {
        guard let current = room.connected, current.isHost, !current.invited.contains(identity) else { return }
        update { $0.invited.insert(identity) }
        Task {
            do {
                try await env.api.invite(showId: showId, identity: identity)
            } catch {
                update { $0.invited.remove(identity); $0.notice = error.localizedDescription }
            }
        }
    }

    /// accept = take the stage; leave = decline an invite or step down. Both reconnect with the new token.
    func stage(_ action: String) {
        guard let current = room.connected else { return }
        update { $0.stageBusy = true; $0.notice = nil }
        Task {
            do {
                let result = try await env.api.stageAction(showId: showId, action: action)
                if let token = result.token, let wsUrl = result.wsUrl {
                    let role = result.role ?? (action == "accept" ? "speaker" : "audience")
                    let goingOnStage = role != "audience"
                    var join = current.join
                    join.token = token
                    join.wsUrl = wsUrl
                    join.role = role
                    reconnecting = true
                    await lkRoom.disconnect()
                    try await connect(with: join, enableMic: goingOnStage)
                    reconnecting = false
                    update {
                        $0.invitePending = false
                        $0.stageBusy = false
                        $0.notice = goingOnStage ? "You're on stage." : nil
                    }
                } else {
                    update { $0.invitePending = false; $0.stageBusy = false }
                }
            } catch {
                reconnecting = false
                update { $0.stageBusy = false; $0.invitePending = false; $0.notice = error.localizedDescription }
            }
        }
    }

    /// Host only. Flips the show on or off air; the server opens or closes the audience's audio.
    func setOnAir(_ onAir: Bool) {
        guard room.connected != nil else { return }
        update { $0.stageBusy = true; $0.notice = nil }
        Task {
            do {
                let updated = try await env.api.setOnAir(showId: showId, onAir: onAir)
                show = updated
                update {
                    $0.onAir = updated.isLive
                    $0.stageBusy = false
                    $0.notice = updated.isLive ? "You're on air. Listeners can hear the stage now." : "Off air. The recording has stopped."
                }
            } catch {
                update { $0.stageBusy = false; $0.notice = error.localizedDescription }
            }
        }
    }

    /// Host only. Rename the show or set a description from inside the room.
    func saveDetails(title: String, description: String) {
        Task {
            do {
                show = try await env.api.updateShow(
                    showId: showId,
                    title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                    description: description.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            } catch {
                update { $0.notice = error.localizedDescription }
            }
            editing = false
        }
    }

    func setMusicMood(_ mood: String?) {
        if moodBusy { return }
        moodBusy = true
        Task {
            do {
                show = try await env.api.setMusicMood(showId: showId, mood: mood)
            } catch {
                Diagnostics.event("music_mood_failed", error.localizedDescription)
            }
            moodBusy = false
        }
    }

    func toggleRemind() {
        if remindBusy { return }
        remindBusy = true
        let next = !reminded
        Task {
            do {
                reminded = try await env.api.remind(showId: showId, on: next)
                if reminded {
                    if !(await Reminders.canPost()) { _ = await Reminders.requestPermission() }
                    Reminders.schedule()
                }
            } catch {
                Diagnostics.event("remind_failed", error.localizedDescription)
            }
            remindBusy = false
        }
    }

    func react(_ emoji: String) {
        guard let current = room.connected else { return }
        spawnReaction(emoji, from: current.join.identity)
        Task { try? await env.api.react(showId: showId, emoji: emoji) }
    }

    // MARK: Internals

    private func update(_ change: (inout ConnectedRoom) -> Void) {
        guard var current = room.connected else { return }
        change(&current)
        room = .connected(current)
        Diagnostics.setRoom(
            showId: showId, role: current.join.role, connected: true, onAir: current.onAir, micOn: current.micOn,
            members: current.members.count, anonymousListeners: current.anonymousListeners, invitePending: current.invitePending
        )
    }

    /// Float a reaction chip up from the sender's avatar (or the bottom bar) for a few seconds.
    func spawnReaction(_ emoji: String, from identity: String) {
        let id = DispatchTime.now().uptimeNanoseconds
        floating.append(FloatingEmoji(
            id: id, emoji: emoji, origin: avatarCentres[identity],
            jitter: CGFloat(Int((id / 7) % 61)) - 30
        ))
        Task {
            try? await Task.sleep(for: .seconds(reactionFloatSeconds + 0.1))
            floating.removeAll { $0.id == id }
        }
    }

    /// Rebuild the member list from the LiveKit room plus the profile cache.
    func refreshMembers() {
        guard let current = room.connected else { return }
        let hostDid = show?.host.did
        let local = lkRoom.localParticipant
        let everyone: [Participant] = [local] + Array(lkRoom.remoteParticipants.values)
        var anonymous = 0
        var members: [RoomMember] = []
        for p in everyone {
            guard let id = p.identity?.stringValue else { continue }
            if id.hasPrefix("anon:") {
                anonymous += 1
                continue
            }
            let isLocal = p === local
            if isLocal, current.join.anonymous { continue }
            let profile = profiles[id]
            let name = profile?.label
                ?? (isLocal ? current.join.label : (p.name?.isEmpty == false ? p.name : nil))
                ?? "Listener"
            let canPublish = isLocal ? (p.permissions.canPublish || current.join.onStage) : p.permissions.canPublish
            members.append(RoomMember(
                identity: id,
                name: name,
                avatarUrl: profile?.avatarUrl ?? (isLocal ? current.join.avatarUrl : nil),
                isHost: id == hostDid,
                onStage: canPublish,
                speaking: p.isSpeaking,
                micOn: p.isMicrophoneEnabled(),
                isLocal: isLocal,
                handRaised: !canPublish && p.attributes["hand"] == "1"
            ))
        }
        members.sort { a, b in
            if a.isHost != b.isHost { return a.isHost }
            if a.onStage != b.onStage { return a.onStage }
            return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
        }
        let remoteAudio = lkRoom.remoteParticipants.values.contains { !$0.audioTracks.isEmpty }
        let localHand = !current.onStage && local.attributes["hand"] == "1"
        update {
            $0.members = members
            $0.anonymousListeners = anonymous
            $0.remoteAudio = remoteAudio
            $0.handRaised = localHand
        }
        // Resolve any identities we have not seen yet.
        let missing = members.map(\.identity).filter { profiles[$0] == nil }
        if !missing.isEmpty {
            Task {
                guard let found = try? await env.api.users(identities: missing) else { return }
                for u in found { profiles[u.did] = u }
                // Mark the rest so we do not refetch them every event.
                for id in missing where profiles[id] == nil { profiles[id] = UserSummary(did: id) }
                refreshMembers()
            }
        }
    }

    /// Poll the stage status while connected: invites and on-air changes reach
    /// listeners this way even when data messages do not.
    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, let current = self.room.connected else { return }
                if !current.join.anonymous, let status = try? await self.env.api.stageStatus(showId: self.showId) {
                    self.update {
                        $0.onAir = status.onAir
                        $0.invitePending = $0.invitePending || (status.pendingInviteFrom != nil && !status.onStage)
                    }
                }
                try? await Task.sleep(for: .seconds(stagePollSeconds))
            }
        }
    }

    fileprivate func handleData(_ data: Data) {
        guard let current = room.connected,
              let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = msg["type"] as? String else { return }
        switch type {
        case "stage_invite":
            if msg["targetIdentity"] as? String == current.join.identity {
                update { $0.invitePending = true }
            }
        case "on_air_changed":
            update { $0.onAir = msg["onAir"] as? Bool ?? current.onAir }
        case "space_updated":
            guard var s = show else { return }
            if let title = msg["title"] as? String { s.title = title }
            if msg.keys.contains("description") { s.description = msg["description"] as? String }
            if let tags = msg["tags"] as? [String] { s.tags = tags }
            if msg.keys.contains("musicMood") { s.musicMood = msg["musicMood"] as? String }
            show = s
        case "stage_removed":
            if msg["identity"] as? String == current.join.identity {
                update { $0.notice = "The host moved you back to the audience." }
            }
        case "reaction":
            // Our own reaction already floated when we tapped it.
            if let did = msg["did"] as? String, !did.isEmpty, did != current.join.identity {
                spawnReaction(msg["emoji"] as? String ?? "❤️", from: did)
            }
        default:
            break
        }
    }

    fileprivate func handleDisconnect() {
        if reconnecting { return }
        if room.connected != nil {
            room = .idle
            Diagnostics.clearRoom()
        }
    }
}

/// LiveKit's delegate callbacks arrive off the main actor; this forwards
/// them to the model on it.
private final class RoomEvents: RoomDelegate {
    private weak var model: ShowModel?
    init(model: ShowModel) { self.model = model }

    private func refresh() {
        Task { @MainActor [model] in model?.refreshMembers() }
    }

    func room(_ room: Room, participantDidConnect participant: RemoteParticipant) { refresh() }
    func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) { refresh() }
    func room(_ room: Room, didUpdateSpeakingParticipants participants: [Participant]) { refresh() }
    func room(_ room: Room, participant: RemoteParticipant, didPublishTrack publication: RemoteTrackPublication) { refresh() }
    func room(_ room: Room, participant: RemoteParticipant, didUnpublishTrack publication: RemoteTrackPublication) { refresh() }
    func room(_ room: Room, participant: LocalParticipant, didPublishTrack publication: LocalTrackPublication) { refresh() }
    func room(_ room: Room, participant: LocalParticipant, didUnpublishTrack publication: LocalTrackPublication) { refresh() }
    func room(_ room: Room, participant: Participant, trackPublication: TrackPublication, didUpdateIsMuted isMuted: Bool) { refresh() }
    func room(_ room: Room, participant: Participant, didUpdatePermissions permissions: ParticipantPermissions) { refresh() }
    func room(_ room: Room, participant: Participant, didUpdateAttributes attributes: [String: String]) { refresh() }

    func room(_ room: Room, participant: RemoteParticipant?, didReceiveData data: Data, forTopic topic: String, encryptionType: EncryptionType) {
        Task { @MainActor [model] in model?.handleData(data) }
    }

    func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldConnectionState: ConnectionState) {
        if case .disconnected = connectionState {
            Task { @MainActor [model] in model?.handleDisconnect() }
        }
    }
}
