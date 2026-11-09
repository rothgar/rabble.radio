import Foundation

struct APIError: LocalizedError {
    let status: Int
    let code: String
    let message: String?
    var errorDescription: String? { message ?? code }
}

/// Thin client for the rabble.radio JSON API. Session cookies come from
/// HTTPCookieStorage, where SessionStore puts them after the web sign-in.
final class RabbleAPI {
    let baseURL: URL
    private let http: URLSession
    private let decoder = JSONDecoder()

    init(baseURL: URL, session: SessionStore) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 30
        http = URLSession(configuration: config)
    }

    func listShows() async throws -> [Show] {
        try await request(SpacesResponse.self, path: "/api/spaces").spaces
    }

    func stations() async throws -> [Station] {
        Station.group(try await listShows())
    }

    func shows(forStation tag: String) async throws -> [Show] {
        try await listShows().filter { $0.tags.contains(tag) }
    }

    func show(id: String) async throws -> Show {
        try await request(ShowEnvelope.self, path: "/api/spaces/\(id)").space
    }

    /// Open a show for a new session and land the caller in it as host, off
    /// air. Without `showId` the server reopens the host's default show (or
    /// creates it the first time); with one it reopens that show.
    func startShow(showId: String? = nil) async throws -> Show {
        var body: [String: Any] = ["startNow": true]
        if let showId { body["spaceId"] = showId }
        return try await request(ShowEnvelope.self, path: "/api/spaces", method: "POST", json: body).space
    }

    /// The signed-in user's hosted and joined shows.
    func myShows() async throws -> MyShows {
        try await request(MyShows.self, path: "/api/me/shows")
    }

    /// Host only: go on air (start broadcasting + recording) or off air.
    func setOnAir(showId: String, onAir: Bool) async throws -> Show {
        try await request(ShowEnvelope.self, path: "/api/spaces/\(showId)/live", method: "POST", json: ["action": onAir ? "start" : "end"]).space
    }

    /// Host only: rename the show or set its description from inside the room.
    func updateShow(showId: String, title: String? = nil, description: String? = nil, tags: [String]? = nil) async throws -> Show {
        var body: [String: Any] = [:]
        if let title { body["title"] = title }
        if let description { body["description"] = description }
        if let tags { body["tags"] = tags }
        return try await request(ShowEnvelope.self, path: "/api/spaces/\(showId)", method: "PATCH", json: body).space
    }

    /// Host only: set the pre-show music mood (nil for silence).
    func setMusicMood(showId: String, mood: String?) async throws -> Show {
        let body: [String: Any] = ["musicMood": mood ?? NSNull()]
        return try await request(ShowEnvelope.self, path: "/api/spaces/\(showId)", method: "PATCH", json: body).space
    }

    /// nil when there is no valid session.
    func me() async throws -> Me? {
        do {
            return try await request(Me.self, path: "/api/me")
        } catch let error as APIError where error.status == 401 || error.status == 404 {
            return nil
        }
    }

    func join(showId: String) async throws -> JoinResponse {
        try await request(JoinResponse.self, path: "/api/spaces/\(showId)/join", method: "POST", json: [:])
    }

    /// The caller's stage status: pending invite, on-stage flag, on-air flag.
    func stageStatus(showId: String) async throws -> StageStatus {
        try await request(StageStatus.self, path: "/api/spaces/\(showId)/stage")
    }

    /// Stage actions. `accept` and `leave` return a fresh LiveKit token with the
    /// new role; the room must be reconnected with it.
    func stageAction(showId: String, action: String) async throws -> StageActionResponse {
        try await request(StageActionResponse.self, path: "/api/spaces/\(showId)/stage", method: "POST", json: ["action": action])
    }

    /// Host only: invite a listener onto the stage. Mirrors the web host's POST /api/spaces/{id}/stage with action "invite".
    func invite(showId: String, identity: String) async throws {
        _ = try await request(StageActionResponse.self, path: "/api/spaces/\(showId)/stage", method: "POST", json: ["action": "invite", "targetIdentity": identity])
    }

    /// Record a reaction; the server counts it and broadcasts it to the room with our profile.
    func react(showId: String, emoji: String) async throws {
        _ = try await raw(path: "/api/spaces/\(showId)/reactions", method: "POST", json: ["emoji": emoji])
    }

    /// Send a problem report. Works signed out. `context` is the Diagnostics
    /// capture; the server adds the session user and User-Agent.
    func sendFeedback(message: String, category: String, showId: String?, context: [String: Any]) async throws {
        var body: [String: Any] = [
            "message": message,
            "category": category,
            "platform": "ios",
            "appVersion": Diagnostics.appVersion,
            "page": Diagnostics.screen,
            "context": context,
        ]
        if let showId { body["spaceId"] = showId }
        _ = try await raw(path: "/api/feedback", method: "POST", json: body)
    }

    /// "Notify me" on a show that is off air. Returns the resulting state.
    func remind(showId: String, on: Bool) async throws -> Bool {
        try await request(RemindResponse.self, path: "/api/spaces/\(showId)/remind", method: "POST", json: ["on": on]).reminded ?? on
    }

    /// Reminders whose show just went on air; each is returned once.
    func dueReminders() async throws -> [DueReminder] {
        try await request(DueRemindersResponse.self, path: "/api/me/reminders?due=1").due
    }

    /// Absolute URL for a server-relative path such as a replay's audio.
    func absolute(_ path: String) -> URL {
        if path.hasPrefix("http"), let url = URL(string: path) { return url }
        return baseURL.appending(path: path)
    }

    /// Resolve DIDs to handles and avatars for the people in a room.
    func users(identities: [String]) async throws -> [UserSummary] {
        if identities.isEmpty { return [] }
        var comps = URLComponents(url: baseURL.appending(path: "/api/users"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "identities", value: identities.joined(separator: ","))]
        return try await request(UsersResponse.self, url: comps.url!).users
    }

    private func request<T: Decodable>(_ type: T.Type, path: String, method: String = "GET", json: [String: Any]? = nil) async throws -> T {
        try await request(type, url: baseURL.appending(path: path), method: method, json: json)
    }

    private func request<T: Decodable>(_ type: T.Type, url: URL, method: String = "GET", json: [String: Any]? = nil) async throws -> T {
        let data = try await raw(url: url, method: method, json: json)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            Diagnostics.event("decode_error", "\(method) \(url.path): \(error)")
            throw error
        }
    }

    @discardableResult
    private func raw(path: String, method: String, json: [String: Any]?) async throws -> Data {
        try await raw(url: baseURL.appending(path: path), method: method, json: json)
    }

    private func raw(url: URL, method: String, json: [String: Any]?) async throws -> Data {
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let json {
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await http.data(for: req)
        } catch {
            Diagnostics.event("network_error", "\(method) \(url.path): \(error.localizedDescription)")
            throw error
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let err = (try? decoder.decode(APIErrorBody.self, from: data)) ?? APIErrorBody(error: "http_\(status)")
            Diagnostics.event("api_error", "\(method) \(url.path) -> \(status) \(err.error)", extra: ["message": err.message ?? NSNull()])
            throw APIError(status: status, code: err.error, message: err.message)
        }
        return data
    }
}
