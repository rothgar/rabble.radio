import Foundation

struct PublicHost: Codable, Hashable {
    let did: String
    let handle: String
    var displayName: String?
    var avatarUrl: String?
}

/// Mirror of PublicSpace in src/types.ts.
struct Show: Codable, Identifiable, Hashable {
    let id: String
    var slug: String = ""
    let title: String
    var description: String?
    var isLive: Bool = false
    var status: String = "active"
    var scheduledAt: String?
    var expiresAt: String?
    var listenerCount: Int = 0
    var speakerCount: Int = 0
    var reactionCount: Int = 0
    var tags: [String] = []
    var createdAt: String = ""
    var updatedAt: String = ""
    let host: PublicHost
    var shareableUrl: String = ""
}

struct SpacesResponse: Codable { var spaces: [Show] = [] }
struct ShowEnvelope: Codable { let space: Show }

struct Me: Codable {
    var id: String = ""
    let did: String
    let handle: String
    var displayName: String?
    var avatarUrl: String?
}

/// Mirror of the POST /api/spaces/[id]/join response.
struct JoinResponse: Codable {
    let token: String
    let wsUrl: String
    var role: String = "audience"
    var roomName: String = ""
    var identity: String = ""
    var handle: String = ""
    var displayName: String?
    var avatarUrl: String?
    /// True when joined without a session (listen-only, never shown in the room).
    var anonymous: Bool = false
}

struct APIErrorBody: Codable {
    var error: String = "unknown"
    var message: String?
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
}
