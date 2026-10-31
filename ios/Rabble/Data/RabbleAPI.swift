import Foundation

struct APIError: LocalizedError {
    let status: Int
    let code: String
    let message: String?
    var errorDescription: String? { message ?? code }
}

/// Thin client for the rabble.radio JSON API.
final class RabbleAPI {
    let baseURL: URL
    private let http: URLSession
    private let decoder = JSONDecoder()

    init(baseURL: URL, session: SessionStore) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        http = URLSession(configuration: config)
    }

    func listShows() async throws -> [Show] {
        try await request(SpacesResponse.self, path: "/api/spaces").spaces
    }

    func stations() async throws -> [Station] {
        let shows = try await listShows()
        return Tags.categories.compactMap { tag in
            let inStation = shows.filter { Tags.primaryTag(of: $0.tags) == tag }
            return inStation.isEmpty ? nil : Station(tag: tag, shows: inStation)
        }
    }

    func shows(forStation tag: String) async throws -> [Show] {
        try await listShows().filter { $0.tags.contains(tag) }
    }

    func show(id: String) async throws -> Show {
        try await request(ShowEnvelope.self, path: "/api/spaces/\(id)").space
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
        try await request(
            JoinResponse.self,
            path: "/api/spaces/\(showId)/join",
            method: "POST",
            body: Data("{}".utf8)
        )
    }

    private func request<T: Decodable>(
        _ type: T.Type,
        path: String,
        method: String = "GET",
        body: Data? = nil
    ) async throws -> T {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await http.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let err = (try? decoder.decode(APIErrorBody.self, from: data)) ?? APIErrorBody(error: "http_\(status)")
            throw APIError(status: status, code: err.error, message: err.message)
        }
        return try decoder.decode(T.self, from: data)
    }
}
