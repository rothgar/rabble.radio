import SwiftUI

/// Top centre of each member's avatar, reported by the tiles so reactions
/// can rise from the right place.
struct AvatarCentreKey: PreferenceKey {
    static let defaultValue: [String: CGPoint] = [:]
    static func reduce(value: inout [String: CGPoint], nextValue: () -> [String: CGPoint]) {
        value.merge(nextValue()) { $1 }
    }
}

private let showSpace = "show"

struct ShowView: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var nav: Navigator
    @StateObject private var model: ShowModel
    let autoJoin: Bool
    @State private var showLogin = false

    init(env: AppEnvironment, showId: String, autoJoin: Bool) {
        _model = StateObject(wrappedValue: ShowModel(env: env, showId: showId))
        self.autoJoin = autoJoin
    }

    private var onAir: Bool {
        model.room.connected?.onAir ?? model.show?.isLive ?? false
    }

    /// Copy for the leave-confirmation alert: audience leaves quietly, stage
    /// members are warned when they are the last one and leaving ends the show.
    private var leaveMessage: String {
        guard let connected = model.room.connected, connected.onStage else {
            return "You'll stop listening and leave the room."
        }
        return connected.lastOnStage
            ? "You're the last one on stage. Leaving will take the show off air."
            : "You'll leave the studio. The show stays open and you can come back from your shows list."
    }

    var body: some View {
        Group {
            if let show = model.show {
                content(show)
            } else if let error = model.loadError {
                ErrorPanel(message: error) { await model.load(autoJoin: autoJoin) }
            } else {
                Loading()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RabbleColors.bg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            // Pinned: reactions are always one tap away, and leaving asks first.
            if let connected = model.room.connected {
                ReactionBar(
                    onReact: { model.react($0) },
                    onLeave: { model.confirmLeave = true },
                    handRaised: connected.join.anonymous || connected.onStage ? nil : connected.handRaised,
                    onToggleHand: { model.toggleHand() }
                )
            }
        }
        .navigationTitle(model.show?.title ?? "Show")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    if model.room.connected != nil { model.confirmLeave = true } else { nav.pop() }
                } label: {
                    Image(systemName: "chevron.left")
                }
                .accessibilityLabel("Back")
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                if model.isHost && !onAir { Button("Edit") { model.editing = true } }
                FeedbackButton(showId: model.showId)
            }
        }
        .alert("Leave the show?", isPresented: $model.confirmLeave) {
            Button("Stay", role: .cancel) {}
            Button("Leave", role: .destructive) {
                model.leave()
                nav.pop()
            }
        } message: {
            Text(leaveMessage)
        }
        .sheet(isPresented: $model.editing) {
            if let show = model.show {
                ShowDetailsSheet(title: show.title, description: show.description ?? "") { title, description in
                    model.saveDetails(title: title, description: description)
                }
            }
        }
        .sheet(isPresented: $showLogin) {
            LoginView { showLogin = false; env.sessionVersion += 1 }
        }
        .task(id: env.sessionVersion) { await model.load(autoJoin: autoJoin) }
        .onAppear { Diagnostics.screen = "show/\(model.showId)" }
        .onDisappear { model.leave() }
    }

    @ViewBuilder
    private func content(_ show: Show) -> some View {
        let connected = model.room.connected
        let onAir = connected?.onAir ?? show.isLive
        let showReplay = show.replay != nil && connected == nil && !onAir
        ZStack(alignment: .top) {
            ScrollView {
                VStack(spacing: 16) {
                    // Top box: title, host, on-air state and the stage.
                    ShowHeader(
                        show: show,
                        onAir: onAir,
                        room: connected,
                        baseURL: env.baseURL,
                        isHost: model.isHostOfShow,
                        moodBusy: model.moodBusy,
                        onMusicPick: { model.setMusicMood($0) }
                    )
                    if showReplay, let replay = show.replay {
                        // Off air with a recording: play it instead of opening an empty stage.
                        ReplayPanel(show: show, replay: replay, audioUrl: env.api.absolute(replay.audioUrl))
                        if case .failed(let message) = model.room {
                            Text(message).foregroundStyle(RabbleColors.live)
                        }
                        if model.isHostOfShow {
                            Button(model.room.isJoining ? "Opening…" : "Open the studio") { model.joinShow() }
                                .buttonStyle(.bordered)
                                .disabled(model.room.isJoining)
                                .wideButton()
                        }
                    }
                    if !showReplay {
                        RoomPanel(model: model, show: show, onLogin: { showLogin = true })
                    }
                    // Below: who is listening.
                    if let connected {
                        AudiencePanel(room: connected, onInvite: connected.isHost ? { model.invite($0) } : nil)
                    }
                    Spacer(minLength: 24)
                }
                .frame(maxWidth: contentMaxWidth)
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .frame(maxWidth: .infinity)
            }
            .onPreferenceChange(AvatarCentreKey.self) { centres in
                model.avatarCentres = centres
            }
            // Reactions float above everything, including the scrolled content.
            GeometryReader { geo in
                ZStack {
                    ForEach(model.floating) { item in
                        FloatingReactionView(item: item, bounds: geo.size)
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
            .allowsHitTesting(false)
        }
        .coordinateSpace(name: showSpace)
    }
}

// MARK: - Top box

private struct ShowHeader: View {
    let show: Show
    let onAir: Bool
    let room: ConnectedRoom?
    let baseURL: URL
    let isHost: Bool
    let moodBusy: Bool
    let onMusicPick: (String?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                if onAir {
                    LiveBadge()
                } else {
                    Pill(text: show.status == "active" || show.status == "live" ? "Off air" : show.status.capitalized)
                }
                Spacer()
                Text("\(room?.listening ?? show.listenerCount) listening").font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary)
            }
            Text(show.title).font(RabbleFont.style(.title2, .semibold))
            HStack(spacing: 8) {
                HostAvatar(host: show.host, size: 28)
                Text(show.host.label).foregroundStyle(RabbleColors.textSecondary)
            }
            if let description = show.description, !description.trimmingCharacters(in: .whitespaces).isEmpty {
                Text(description)
            }
            if !show.tags.isEmpty {
                FlowLayout(spacing: 6) { ForEach(show.tags, id: \.self) { Pill(text: $0) } }
            }

            // The stage lives in the top box. Empty seats are drawn as placeholders.
            // Music shows up on stage like any other guest: visible to everyone once
            // a mood is set, and to the host beforehand too so there's a tile to tap
            // to pick one.
            SectionLabel(text: "ON STAGE").padding(.top, 4)
            let stage = room?.members.filter(\.onStage) ?? []
            let showMusicTile = room != nil && (show.musicMood != nil || (isHost && !(room?.onAir ?? false)))
            if stage.isEmpty, !showMusicTile {
                HStack(spacing: 12) {
                    ForEach(0..<3, id: \.self) { _ in PlaceholderSeat() }
                }
                Text(room == nil ? "Join to see who's on stage." : "No one on stage yet.")
                    .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textTertiary)
            } else {
                FlowLayout(spacing: 12) {
                    if showMusicTile, let room {
                        MusicTile(
                            baseURL: baseURL,
                            spaceId: show.id,
                            moodId: show.musicMood,
                            active: show.musicMood != nil && (!room.onAir || !room.remoteAudio),
                            canPick: isHost && !room.onAir,
                            busy: moodBusy,
                            onPick: onMusicPick
                        )
                    }
                    ForEach(stage) { MemberTile(member: $0, large: true) }
                }
            }
        }
        .card()
    }
}

/// An empty seat on the stage: a faint avatar-sized circle.
private struct PlaceholderSeat: View {
    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle().fill(RabbleColors.surfaceRaised.opacity(0.6))
                Circle().strokeBorder(RabbleColors.textTertiary.opacity(0.6), lineWidth: 1)
                Text("👤").font(RabbleFont.sans(22)).opacity(0.35)
            }
            .frame(width: 64, height: 64)
            Text("Open seat").font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textTertiary)
        }
        .frame(width: 80)
    }
}

// MARK: - Controls

private struct RoomPanel: View {
    @ObservedObject var model: ShowModel
    let show: Show
    let onLogin: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch model.room {
            case .idle, .failed:
                idle
            case .joining:
                Text("Connecting…").foregroundStyle(RabbleColors.textSecondary)
            case .connected(let room):
                connected(room)
            }
        }
        .card()
    }

    @ViewBuilder
    private var idle: some View {
        if case .failed(let message) = model.room {
            Text(message).foregroundStyle(RabbleColors.live)
        }
        if !show.isLive, !model.isHostOfShow {
            // Scheduled or just off air: nothing to listen to yet, offer a reminder.
            let scheduled = show.status == "scheduled"
            Text(scheduled
                 ? "This show hasn't started yet" + (show.scheduledAt.map { " — planned for \(formatWhen($0))" } ?? "") + "."
                 : "The host is off air right now. Get notified the moment they go live.")
                .foregroundStyle(RabbleColors.textSecondary)
            if model.signedIn {
                Button {
                    model.toggleRemind()
                } label: {
                    Label(model.remindBusy ? "Saving…" : (model.reminded ? "You'll be notified" : "Notify me"),
                          systemImage: model.reminded ? "bell.fill" : "bell")
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.remindBusy)
                .wideButton()
                Text(model.reminded
                     ? "We'll notify you when the host goes on air. Tap again to cancel. Checks run when the app wakes up, about every 15 minutes."
                     : "Get a notification on this phone when the host goes on air.")
                    .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textTertiary)
            } else {
                Button("Sign in to get notified", action: onLogin).buttonStyle(.bordered).wideButton()
            }
            if model.signedIn {
                Button {
                    model.toggleHostFollow()
                } label: {
                    Label(model.hostFollowBusy ? "Saving…" : (model.hostFollowing ? "Following \(show.host.label)" : "Follow \(show.host.label)"),
                          systemImage: model.hostFollowing ? "bell.fill" : "bell")
                }
                .buttonStyle(.bordered)
                .disabled(model.hostFollowBusy)
                .wideButton()
                Text(model.hostFollowing
                     ? "We'll tell you whenever \(show.host.label) goes on air, on any show. Tap again to stop."
                     : "Get notified whenever \(show.host.label) goes on air, on any show, not just this one.")
                    .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textTertiary)
            }
            if model.signedIn, show.isNamedShow {
                Button {
                    model.toggleShowFollow()
                } label: {
                    Label(model.showFollowBusy ? "Saving…" : (model.showFollowing ? "Following \(show.title)" : "Follow \(show.title)"),
                          systemImage: model.showFollowing ? "bell.fill" : "bell")
                }
                .buttonStyle(.bordered)
                .disabled(model.showFollowBusy)
                .wideButton()
                Text(model.showFollowing
                     ? "We'll tell you whenever \(show.title) goes on air. Tap again to stop."
                     : "Get notified whenever \(show.title) goes on air.")
                    .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textTertiary)
            }
            if model.signedIn, !scheduled {
                // Guests the host wants on stage before air can still get in.
                Button(model.room.isJoining ? "Opening…" : "Invited to the stage? Enter the studio") { model.joinShow() }
                    .font(RabbleFont.style(.caption))
                    .foregroundStyle(RabbleColors.textTertiary)
                    .disabled(model.room.isJoining)
                    .frame(minHeight: 44)
            }
        } else if !model.signedIn {
            Text("Listen without an account. You count toward the listener total but stay invisible; sign in with Bluesky to take the stage.")
                .foregroundStyle(RabbleColors.textSecondary)
            HStack(spacing: 8) {
                Button("Listen") { model.joinShow() }.buttonStyle(.borderedProminent).wideButton()
                Button("Sign in", action: onLogin).buttonStyle(.bordered).wideButton()
            }
        } else {
            Text(show.isLive
                 ? "The show is on air. Joining puts you in the audience."
                 : "The host is off air. You can join and wait in the studio; audio starts when they go on air.")
                .foregroundStyle(RabbleColors.textSecondary)
            Button("Join") { model.joinShow() }.buttonStyle(.borderedProminent).wideButton()
        }
    }

    @ViewBuilder
    private func connected(_ room: ConnectedRoom) -> some View {
        let status: String = room.join.anonymous ? "Listening anonymously"
            : room.isHost ? "You're hosting"
            : room.onStage ? "You're on stage"
            : "You're in the audience"
        Text(status).font(RabbleFont.style(.headline)).foregroundStyle(RabbleColors.success)
        if !room.onAir {
            Text(room.isHost
                 ? "Off air: only the stage can hear each other. Invite co-hosts from the web, name the show with Edit, then go on air to broadcast and record."
                 : room.onStage ? "Off air: only the stage can hear each other right now."
                 : "Off air: you'll hear audio as soon as the host goes on air.")
                .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary)
        }
        if let notice = room.notice {
            Text(notice).font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary)
        }
        if room.isHost {
            Button(room.stageBusy ? "Working…" : (room.onAir ? "Go off air" : "Go on air")) { model.setOnAir(!room.onAir) }
                .buttonStyle(.borderedProminent)
                .tint(room.onAir ? RabbleColors.surfaceRaised : RabbleColors.live)
                .disabled(room.stageBusy)
                .wideButton(height: 52)
        }
        if room.onStage {
            HStack(spacing: 8) {
                Button(room.micOn ? "Mute mic" : "Unmute mic") { model.toggleMic() }
                    .buttonStyle(.bordered).wideButton()
                if room.join.role == "speaker" {
                    Button("Step down") { model.stage("leave") }
                        .buttonStyle(.bordered).disabled(room.stageBusy).wideButton()
                }
            }
        }
    }
}

// MARK: - Audience

private struct AudiencePanel: View {
    let room: ConnectedRoom
    /// Present for the host: invites a listener onto the stage.
    var onInvite: ((String) -> Void)?

    var body: some View {
        let audience = room.members.filter { !$0.onStage }
        let hands = room.raisedHands
        VStack(alignment: .leading, spacing: 12) {
            if let onInvite, !hands.isEmpty {
                SectionLabel(text: "RAISED HANDS · \(hands.count)")
                ForEach(hands) { member in
                    HStack(spacing: 10) {
                        Avatar(name: member.name, avatarUrl: member.avatarUrl, size: 36)
                        Text("✋ \(member.name)")
                            .font(RabbleFont.style(.subheadline, .semibold))
                            .foregroundStyle(RabbleColors.text)
                            .lineLimit(1)
                        Spacer(minLength: 8)
                        if room.invited.contains(member.identity) {
                            Pill(text: "Invited", color: RabbleColors.textOnInk, background: RabbleColors.ink)
                        } else {
                            Button("Invite") { onInvite(member.identity) }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.small)
                        }
                    }
                    .padding(10)
                    .background(RabbleColors.highlightMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .accessibilityIdentifier("raised-hand-\(member.identity)")
                }
            }
            SectionLabel(text: "LISTENING · \(audience.count + room.anonymousListeners)")
            if audience.isEmpty {
                Text(room.anonymousListeners > 0 ? "\(room.anonymousListeners) listening without an account." : "Nobody in the audience yet.")
                    .foregroundStyle(RabbleColors.textSecondary)
            } else {
                FlowLayout(spacing: 10) {
                    ForEach(audience) { MemberTile(member: $0, large: false) }
                }
                if room.anonymousListeners > 0 {
                    Text("+\(room.anonymousListeners) listening without an account")
                        .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary)
                }
            }
        }
        .card()
    }
}

private struct MemberTile: View {
    let member: RoomMember
    let large: Bool

    var body: some View {
        let size: CGFloat = large ? 64 : 44
        VStack(spacing: 4) {
            ZStack(alignment: .bottomTrailing) {
                Avatar(name: member.name, avatarUrl: member.avatarUrl, size: size, ring: member.speaking ? RabbleColors.success : nil)
                if member.onStage, !member.micOn {
                    Text("🔇")
                        .font(RabbleFont.sans(10))
                        .frame(width: 18, height: 18)
                        .background(RabbleColors.surface)
                        .clipShape(Circle())
                } else if member.handRaised {
                    Text("✋")
                        .font(RabbleFont.sans(11))
                        .frame(width: 20, height: 20)
                        .background(RabbleColors.highlight)
                        .clipShape(Circle())
                        .accessibilityLabel("Hand raised")
                }
            }
            .background(
                GeometryReader { geo in
                    let frame = geo.frame(in: .named(showSpace))
                    Color.clear.preference(key: AvatarCentreKey.self, value: [member.identity: CGPoint(x: frame.midX, y: frame.minY)])
                }
            )
            Text(member.isLocal ? "You" : member.name)
                .font(RabbleFont.style(.caption))
                .foregroundStyle(RabbleColors.text)
                .lineLimit(1)
                .multilineTextAlignment(.center)
            if member.isHost {
                Text("Host").font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.accent)
            }
        }
        .frame(width: size + 16)
    }
}

// MARK: - Reactions

/// Pinned to the bottom of the show: one tap to react, and an exit that asks first.
private struct ReactionBar: View {
    let onReact: (String) -> Void
    let onLeave: () -> Void
    /// nil hides the control (anonymous listeners and people already on stage).
    var handRaised: Bool? = nil
    var onToggleHand: () -> Void = {}

    var body: some View {
        HStack {
            if let handRaised {
                Button(action: onToggleHand) {
                    Image(systemName: handRaised ? "hand.raised.fill" : "hand.raised")
                        .font(RabbleFont.sans(20, .semibold))
                        .foregroundStyle(handRaised ? RabbleColors.textOnInk : RabbleColors.text)
                        .frame(width: 52, height: 52)
                        .background(handRaised ? RabbleColors.ink : RabbleColors.highlightMuted)
                        .clipShape(Circle())
                        .overlay(Circle().strokeBorder(RabbleColors.border, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(handRaised ? "Lower hand" : "Raise hand to speak")
                .accessibilityAddTraits(handRaised ? .isSelected : [])
            }
            ForEach(reactions, id: \.self) { emoji in
                Spacer(minLength: 0)
                Button {
                    onReact(emoji)
                } label: {
                    Text(emoji)
                        .font(RabbleFont.sans(26))
                        .frame(width: 52, height: 52)
                        .background(RabbleColors.surfaceRaised)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
            Button(action: onLeave) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(RabbleFont.sans(20, .semibold))
                    .foregroundStyle(RabbleColors.live)
                    .frame(width: 52, height: 52)
                    .background(RabbleColors.live.opacity(0.18))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Leave the show")
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(RabbleColors.surface)
    }
}

private struct ReactionValues {
    var alpha: Double = 0
    var scale: Double = 1.35
    var progress: Double = 0
}

/// A reaction chip rising from someone's avatar. It pops in at full
/// strength, holds solid for most of its life so the room can read who sent
/// what, then fades as it drifts off. Rises from the sender's avatar when
/// there is room above it; an avatar at the top of the screen has none, so
/// those rise from the bottom bar instead and stay visible.
private struct FloatingReactionView: View {
    let item: FloatingEmoji
    let bounds: CGSize
    @State private var fired = false

    var body: some View {
        KeyframeAnimator(initialValue: ReactionValues(), trigger: fired) { values in
            let drift = item.jitter * values.progress
            chip
                .opacity(values.alpha)
                .scaleEffect(values.scale)
                .position(position(progress: values.progress, drift: drift))
        } keyframes: { _ in
            KeyframeTrack(\.alpha) {
                LinearKeyframe(1, duration: reactionFloatSeconds * 0.08)
                LinearKeyframe(1, duration: reactionFloatSeconds * 0.52)
                LinearKeyframe(0, duration: reactionFloatSeconds * 0.40)
            }
            KeyframeTrack(\.scale) {
                LinearKeyframe(1.0, duration: reactionFloatSeconds * 0.15)
                LinearKeyframe(0.95, duration: reactionFloatSeconds * 0.85)
            }
            KeyframeTrack(\.progress) {
                LinearKeyframe(1, duration: reactionFloatSeconds)
            }
        }
        .onAppear { fired = true }
    }

    private func position(progress: Double, drift: CGFloat) -> CGPoint {
        if let origin = item.origin, origin.y >= 140, origin.y <= bounds.height {
            let room = min(origin.y - 60, 220)
            return CGPoint(x: origin.x + drift, y: origin.y - 32 - room * progress)
        }
        return CGPoint(x: bounds.width / 2 + drift, y: bounds.height - 40 - 260 * progress)
    }

    private var chip: some View {
        Text(item.emoji)
        .font(RabbleFont.sans(28))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(RabbleColors.surfaceRaised)
        .clipShape(Capsule())
        .overlay(Capsule().strokeBorder(RabbleColors.textTertiary, lineWidth: 1))
        .fixedSize()
    }
}

// MARK: - Music and replay

/// One glyph per mood so a guest's tile is recognizable at a glance; moods
/// without a listed icon (or no mood picked) fall back to "music.note".
/// Mirrors MOOD_ICONS in src/components/MusicCard.tsx.
private let moodIcons: [String: String] = [
    "lounge": "wineglass.fill",
    "upbeat": "sparkles",
    "focus": "brain.head.profile",
    "groove": "opticaldisc",
]

/// Pre-show music, rendered as a tile in the on-stage grid the same way a
/// MemberTile is (issue #105) — each phone plays the mood's tracks locally
/// while `active`; nothing enters the room or the recording. The host taps
/// the tile (off air only) for a menu to change the mood or remove music
/// from the stage.
private struct MusicTile: View {
    let baseURL: URL
    let spaceId: String
    let moodId: String?
    let active: Bool
    let canPick: Bool
    let busy: Bool
    let onPick: (String?) -> Void
    @StateObject private var player = MusicPlayer()

    private var mood: MusicMood? { Music.mood(moodId) }
    private var playlist: [MusicTrack] { mood.map { Music.playlist($0, spaceId: spaceId) } ?? [] }
    private var track: MusicTrack? { playlist.isEmpty ? nil : playlist[player.index % playlist.count] }
    private var url: URL? { track.map { Music.url(baseURL: baseURL, track: $0) } }
    private var playing: Bool { active && url != nil }

    var body: some View {
        VStack(spacing: 4) {
            ZStack(alignment: .bottomTrailing) {
                avatar
                if !playing {
                    Text("🔇")
                        .font(RabbleFont.sans(10))
                        .frame(width: 18, height: 18)
                        .background(RabbleColors.surface)
                        .clipShape(Circle())
                }
            }
            Text(track?.guestName ?? "Music").font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.text).lineLimit(1)
            Text(mood?.label ?? "No music")
                .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary).lineLimit(1)
            if let error = player.error {
                Text(error)
                    .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.live)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(width: 80)
        .onChange(of: moodId) { _, _ in player.index = 0 }
        .onChange(of: playing) { _, _ in sync() }
        .onChange(of: url) { _, _ in sync() }
        .onAppear { sync() }
        .onDisappear { player.stop() }
    }

    @ViewBuilder
    private var avatar: some View {
        let symbol = mood.flatMap { moodIcons[$0.id] } ?? "music.note"
        let circle = ZStack {
            Circle().fill(RabbleColors.ink)
            Image(systemName: symbol).font(RabbleFont.sans(24, .semibold)).foregroundStyle(RabbleColors.textOnInk)
        }
        .frame(width: 64, height: 64)

        if canPick {
            Menu {
                Text("Plays for everyone waiting in the room until you go on air. It is not recorded.")
                ForEach(Music.moods) { m in
                    Button {
                        onPick(m.id)
                    } label: {
                        if m.id == mood?.id {
                            Label(m.label, systemImage: "checkmark")
                        } else {
                            Text(m.label)
                        }
                    }
                    .disabled(busy)
                }
                if mood != nil {
                    Button("Remove from stage", role: .destructive) { onPick(nil) }
                        .disabled(busy)
                }
            } label: {
                circle
            }
            .accessibilityLabel("Music actions")
        } else {
            circle
        }
    }

    private func sync() {
        let count = playlist.count
        player.sync(url: url, playing: playing) {
            if count > 0 { player.index = (player.index + 1) % count }
        }
    }
}

private struct ReplayPanel: View {
    let show: Show
    let replay: Replay
    @StateObject private var player: ReplayPlayer

    init(show: Show, replay: Replay, audioUrl: URL) {
        self.show = show
        self.replay = replay
        _player = StateObject(wrappedValue: ReplayPlayer(url: audioUrl, durationSeconds: replay.durationSeconds))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Pill(text: "Replay")
                Text("This show is off air.").font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary)
            }
            Text("Listen to the recording of \(show.title).")
            HStack(spacing: 12) {
                Button {
                    player.toggle()
                } label: {
                    Image(systemName: player.playing ? "pause.fill" : "play.fill")
                        .font(RabbleFont.sans(22))
                        .frame(width: 56, height: 56)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel(player.playing ? "Pause" : "Play")
                VStack(spacing: 4) {
                    Slider(
                        value: Binding(
                            get: { player.duration > 0 ? player.position / player.duration : 0 },
                            set: { player.seek(to: $0) }
                        ),
                        in: 0...1
                    )
                    .disabled(player.duration <= 0)
                    HStack {
                        Text(formatClock(player.position))
                        Spacer()
                        Text(player.loading ? "Loading…" : formatClock(player.duration))
                    }
                    .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary)
                }
            }
            let meta = [
                replay.startedAt.isEmpty ? nil : "Recorded \(formatWhen(replay.startedAt))",
                replay.sizeBytes.map { String(format: "%.1f MB", Double($0) / 1_048_576) },
            ].compactMap { $0 }.joined(separator: " · ")
            if !meta.isEmpty {
                Text(meta).font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textTertiary)
            }
            if let error = player.error {
                Text(error).font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.live)
            }
        }
        .card()
    }
}

// MARK: - Edit

private struct ShowDetailsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var description: String
    let onSave: (String, String) -> Void

    init(title: String, description: String, onSave: @escaping (String, String) -> Void) {
        _title = State(initialValue: title)
        _description = State(initialValue: description)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $title)
                    .onChange(of: title) { _, v in if v.count > 200 { title = String(v.prefix(200)) } }
                TextField("What's the show about?", text: $description, axis: .vertical)
                    .lineLimit(2...6)
                    .onChange(of: description) { _, v in if v.count > 2000 { description = String(v.prefix(2000)) } }
                Text("Topics (stations) can be set from the web for now.")
                    .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textTertiary)
            }
            .scrollContentBackground(.hidden)
            .background(RabbleColors.bg.ignoresSafeArea())
            .navigationTitle("Show details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { onSave(title, description) }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
