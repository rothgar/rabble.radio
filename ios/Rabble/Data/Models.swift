import Foundation

// Mirrors of the JSON the rabble.radio API returns. Decoding is lenient on
// purpose: a missing or null field falls back to its default so an older
// client keeps working when the server grows a field.

extension KeyedDecodingContainer {
    func opt<T: Decodable>(_ key: Key, _ fallback: T) -> T {
        (try? decodeIfPresent(T.self, forKey: key)) ?? fallback
    }

    func optional<T: Decodable>(_ key: Key) -> T? {
        try? decodeIfPresent(T.self, forKey: key)
    }
}

struct PublicHost: Codable, Hashable, Identifiable {
    let did: String
    let handle: String
    var displayName: String?
    var avatarUrl: String?
    var id: String { did }

    /// Display name when set, otherwise the handle with an @.
    var label: String {
        if let displayName, !displayName.trimmingCharacters(in: .whitespaces).isEmpty { return displayName }
        return "@\(handle)"
    }

    init(did: String, handle: String, displayName: String? = nil, avatarUrl: String? = nil) {
        self.did = did
        self.handle = handle
        self.displayName = displayName
        self.avatarUrl = avatarUrl
    }

    enum CodingKeys: String, CodingKey { case did, handle, displayName, avatarUrl }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        did = try c.decode(String.self, forKey: .did)
        handle = c.opt(.handle, "")
        displayName = c.optional(.displayName)
        avatarUrl = c.optional(.avatarUrl)
    }
}

/// A finished show's recording, playable without joining.
struct Replay: Codable, Hashable {
    let recordingId: String
    /// Server-relative; prefix with the API base URL.
    let audioUrl: String
    var contentType: String = "audio/mp4"
    var startedAt: String = ""
    var endedAt: String?
    var durationSeconds: Int?
    var sizeBytes: Int64?

    enum CodingKeys: String, CodingKey { case recordingId, audioUrl, contentType, startedAt, endedAt, durationSeconds, sizeBytes }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        recordingId = try c.decode(String.self, forKey: .recordingId)
        audioUrl = try c.decode(String.self, forKey: .audioUrl)
        contentType = c.opt(.contentType, "audio/mp4")
        startedAt = c.opt(.startedAt, "")
        endedAt = c.optional(.endedAt)
        durationSeconds = c.optional(.durationSeconds)
        sizeBytes = c.optional(.sizeBytes)
    }
}

/// One due reminder from GET /api/me/reminders?due=1.
struct DueReminder: Decodable {
    let spaceId: String
    let title: String
    let hostName: String

    enum CodingKeys: String, CodingKey { case spaceId, title, host }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        spaceId = try c.decode(String.self, forKey: .spaceId)
        title = c.opt(.title, "A show")
        let host: PublicHost? = c.optional(.host)
        hostName = host?.label ?? "The host"
    }
}

struct DueRemindersResponse: Decodable { var due: [DueReminder] = [] }

/// Mirror of PublicSpace in src/types.ts.
struct Show: Codable, Identifiable, Hashable {
    let id: String
    var slug: String = ""
    var title: String
    var description: String?
    var isLive: Bool = false
    var status: String = "active"
    var scheduledAt: String?
    var expiresAt: String?
    var listenerCount: Int = 0
    var speakerCount: Int = 0
    var reactionCount: Int = 0
    /// Lifetime totals rolled up from finished shows.
    var likeCount: Int = 0
    var sessionCount: Int = 0
    var totalListeners: Int = 0
    var tags: [String] = []
    var createdAt: String = ""
    var updatedAt: String = ""
    let host: PublicHost
    var shareableUrl: String = ""
    var replay: Replay?
    var reminded: Bool = false
    /// Signed-in viewers: the host is someone they follow on Bluesky.
    var hostFollowed: Bool = false
    /// Signed-in viewers: people they follow who are in the room right now.
    var followedInRoom: [PublicHost] = []
    /// Pre-show music mood id (see Music), nil for silence.
    var musicMood: String?

    /// Worth surfacing in "For you": a followed host, or a follow in the room.
    var forYou: Bool { hostFollowed || !followedInRoom.isEmpty }

    enum CodingKeys: String, CodingKey {
        case id, slug, title, description, isLive, status, scheduledAt, expiresAt
        case listenerCount, speakerCount, reactionCount, likeCount, sessionCount, totalListeners
        case tags, createdAt, updatedAt, host, shareableUrl, replay, reminded, hostFollowed, followedInRoom, musicMood
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        slug = c.opt(.slug, "")
        title = c.opt(.title, "Untitled show")
        description = c.optional(.description)
        isLive = c.opt(.isLive, false)
        status = c.opt(.status, "active")
        scheduledAt = c.optional(.scheduledAt)
        expiresAt = c.optional(.expiresAt)
        listenerCount = c.opt(.listenerCount, 0)
        speakerCount = c.opt(.speakerCount, 0)
        reactionCount = c.opt(.reactionCount, 0)
        likeCount = c.opt(.likeCount, 0)
        sessionCount = c.opt(.sessionCount, 0)
        totalListeners = c.opt(.totalListeners, 0)
        tags = c.opt(.tags, [])
        createdAt = c.opt(.createdAt, "")
        updatedAt = c.opt(.updatedAt, "")
        host = try c.decode(PublicHost.self, forKey: .host)
        shareableUrl = c.opt(.shareableUrl, "")
        replay = c.optional(.replay)
        reminded = c.opt(.reminded, false)
        hostFollowed = c.opt(.hostFollowed, false)
        followedInRoom = c.opt(.followedInRoom, [])
        musicMood = c.optional(.musicMood)
    }
}

struct SpacesResponse: Decodable { var spaces: [Show] = [] }
struct ShowEnvelope: Decodable { let space: Show }

/// A show the user took part in, from GET /api/me/shows.
struct JoinedShow: Decodable, Identifiable, Hashable {
    let sessionId: String
    var role: String = "audience"
    var joinedAt: String = ""
    var stageSeconds: Int = 0
    let showId: String
    let title: String
    var status: String = "active"
    var isLive: Bool = false
    var tags: [String] = []
    let host: PublicHost
    var id: String { sessionId }

    enum CodingKeys: String, CodingKey { case sessionId, role, joinedAt, stageSeconds, space }
    enum SpaceKeys: String, CodingKey { case id, title, status, isLive, tags, host }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sessionId = try c.decode(String.self, forKey: .sessionId)
        role = c.opt(.role, "audience")
        joinedAt = c.opt(.joinedAt, "")
        stageSeconds = c.opt(.stageSeconds, 0)
        let sp = try c.nestedContainer(keyedBy: SpaceKeys.self, forKey: .space)
        showId = try sp.decode(String.self, forKey: .id)
        title = sp.opt(.title, "Untitled show")
        status = sp.opt(.status, "active")
        isLive = sp.opt(.isLive, false)
        tags = sp.opt(.tags, [])
        host = try sp.decode(PublicHost.self, forKey: .host)
    }
}

/// The signed-in user's own shows and the ones they joined.
struct MyShows: Decodable {
    var hosted: [Show] = []
    var joined: [JoinedShow] = []

    enum CodingKeys: String, CodingKey { case hosted, joined }

    init(hosted: [Show] = [], joined: [JoinedShow] = []) {
        self.hosted = hosted
        self.joined = joined
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        hosted = c.opt(.hosted, [])
        joined = c.opt(.joined, [])
    }
}

struct Me: Decodable, Hashable {
    var id: String = ""
    let did: String
    let handle: String
    var displayName: String?
    var avatarUrl: String?

    var label: String {
        if let displayName, !displayName.trimmingCharacters(in: .whitespaces).isEmpty { return displayName }
        return "@\(handle)"
    }

    enum CodingKeys: String, CodingKey { case id, did, handle, displayName, avatarUrl }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.opt(.id, "")
        did = try c.decode(String.self, forKey: .did)
        handle = try c.decode(String.self, forKey: .handle)
        displayName = c.optional(.displayName)
        avatarUrl = c.optional(.avatarUrl)
    }
}

/// One STUN/TURN entry from the join response (Cloudflare TURN credentials).
struct IceServerInfo: Decodable {
    let urls: [String]
    var username: String?
    var credential: String?

    enum CodingKeys: String, CodingKey { case urls, username, credential }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let many: [String] = c.optional(.urls) {
            urls = many
        } else if let one: String = c.optional(.urls) {
            urls = [one]
        } else {
            urls = []
        }
        username = c.optional(.username)
        credential = c.optional(.credential)
    }
}

/// Mirror of the POST /api/spaces/[id]/join response.
struct JoinResponse: Decodable {
    var token: String
    var wsUrl: String
    var role: String = "audience"
    var roomName: String = ""
    var identity: String = ""
    var handle: String = ""
    var displayName: String?
    var avatarUrl: String?
    /// True when joined without a session (listen-only, never shown in the room).
    var anonymous: Bool = false
    /// Per-join STUN/TURN servers. Empty when the server offers no relay, in
    /// which case the LiveKit SDK uses the SFU's own list (LAN only).
    var iceServers: [IceServerInfo] = []

    enum CodingKeys: String, CodingKey { case token, wsUrl, role, roomName, identity, handle, displayName, avatarUrl, anonymous, iceServers }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        token = try c.decode(String.self, forKey: .token)
        wsUrl = try c.decode(String.self, forKey: .wsUrl)
        role = c.opt(.role, "audience")
        roomName = c.opt(.roomName, "")
        identity = c.opt(.identity, "")
        handle = c.opt(.handle, "")
        displayName = c.optional(.displayName)
        avatarUrl = c.optional(.avatarUrl)
        anonymous = c.opt(.anonymous, false)
        iceServers = c.opt(.iceServers, [])
    }

    /// Whether the person this token was minted for can publish audio.
    var onStage: Bool { role != "audience" }

    /// How the local person is named in the room: display name, then @handle.
    var label: String {
        if let displayName, !displayName.trimmingCharacters(in: .whitespaces).isEmpty { return displayName }
        return handle.isEmpty ? "You" : "@\(handle)"
    }
}

struct APIErrorBody: Decodable {
    var error: String = "unknown"
    var message: String?

    enum CodingKeys: String, CodingKey { case error, message }

    init(error: String, message: String? = nil) {
        self.error = error
        self.message = message
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        error = c.opt(.error, "unknown")
        message = c.optional(.message)
    }
}

/// A station is a category tag plus the shows whose primary tag it is.
struct Station: Identifiable, Hashable {
    let tag: String
    let shows: [Show]
    var id: String { tag }
    var hosts: [PublicHost] {
        var seen = Set<String>()
        return shows.map(\.host).filter { seen.insert($0.did).inserted }
    }
    var liveCount: Int { shows.filter(\.isLive).count }
    var listening: Int { shows.reduce(0) { $0 + $1.listenerCount } }

    /// Group shows into stations by primary tag, in category order.
    static func group(_ shows: [Show]) -> [Station] {
        Tags.categories.compactMap { tag in
            let inStation = shows.filter { Tags.primaryTag(of: $0.tags) == tag }
            return inStation.isEmpty ? nil : Station(tag: tag, shows: inStation)
        }
    }
}

/// Mirror of GET /api/spaces/[id]/stage.
struct StageStatus: Decodable {
    var onAir: Bool = false
    var onStage: Bool = false
    var pendingInviteFrom: String?

    enum CodingKeys: String, CodingKey { case onAir, onStage, pendingInvite }
    enum InviteKeys: String, CodingKey { case hostDid }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        onAir = c.opt(.onAir, false)
        onStage = c.opt(.onStage, false)
        if let invite = try? c.nestedContainer(keyedBy: InviteKeys.self, forKey: .pendingInvite) {
            pendingInviteFrom = invite.optional(.hostDid)
        }
    }
}

/// Mirror of the accept/leave/remove responses from POST /api/spaces/[id]/stage.
struct StageActionResponse: Decodable {
    var token: String?
    var wsUrl: String?
    var role: String?

    enum CodingKeys: String, CodingKey { case token, wsUrl, role }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        token = c.optional(.token)
        wsUrl = c.optional(.wsUrl)
        role = c.optional(.role)
    }
}

/// One row of GET /api/users.
struct UserSummary: Decodable, Hashable {
    let did: String
    var handle: String = ""
    var displayName: String?
    var avatarUrl: String?

    init(did: String, handle: String = "", displayName: String? = nil, avatarUrl: String? = nil) {
        self.did = did
        self.handle = handle
        self.displayName = displayName
        self.avatarUrl = avatarUrl
    }

    enum CodingKeys: String, CodingKey { case did, handle, displayName, avatarUrl }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        did = try c.decode(String.self, forKey: .did)
        handle = c.opt(.handle, "")
        displayName = c.optional(.displayName)
        avatarUrl = c.optional(.avatarUrl)
    }

    /// Display name, then @handle, then nil when the row is only a placeholder.
    var label: String? {
        if let displayName, !displayName.trimmingCharacters(in: .whitespaces).isEmpty { return displayName }
        return handle.isEmpty ? nil : "@\(handle)"
    }
}

struct UsersResponse: Decodable { var users: [UserSummary] = [] }
struct RemindResponse: Decodable { var reminded: Bool? }
