import Foundation

/// Pre-show music catalog, mirrored from src/lib/music.ts on the web. Keep
/// the ids, files and order in step: the playlist order for a room is
/// derived from the same hash on every platform so everyone hears the same
/// song first.
///
/// All tracks: Kevin MacLeod (incompetech.com), CC BY 4.0.
struct MusicTrack: Hashable {
    let file: String
    let title: String
    let durationSeconds: Int
    var artist: String { "Kevin MacLeod (incompetech.com)" }
    var license: String { "CC BY 4.0" }
    var attribution: String { "\(title) by \(artist), \(license)" }
}

struct MusicMood: Identifiable, Hashable {
    let id: String
    let label: String
    let description: String
    let tracks: [MusicTrack]
}

enum Music {
    static let moods: [MusicMood] = [
        MusicMood(
            id: "lounge", label: "Lounge", description: "Easy-going jazz and bossa for a relaxed room.",
            tracks: [
                MusicTrack(file: "airport-lounge.mp3", title: "Airport Lounge", durationSeconds: 308),
                MusicTrack(file: "backbay-lounge.mp3", title: "Backbay Lounge", durationSeconds: 267),
                MusicTrack(file: "lobby-time.mp3", title: "Lobby Time", durationSeconds: 193),
            ]
        ),
        MusicMood(
            id: "upbeat", label: "Upbeat", description: "Bright and bouncy, for shows that start with energy.",
            tracks: [
                MusicTrack(file: "carefree.mp3", title: "Carefree", durationSeconds: 205),
                MusicTrack(file: "george-street-shuffle.mp3", title: "George Street Shuffle", durationSeconds: 268),
                MusicTrack(file: "pamgaea.mp3", title: "Pamgaea", durationSeconds: 169),
            ]
        ),
        MusicMood(
            id: "focus", label: "Focus", description: "Calm, ambient piano and pads for talks and deep dives.",
            tracks: [
                MusicTrack(file: "deliberate-thought.mp3", title: "Deliberate Thought", durationSeconds: 177),
                MusicTrack(file: "meditation-impromptu-01.mp3", title: "Meditation Impromptu 01", durationSeconds: 213),
                MusicTrack(file: "dreamy-flashback.mp3", title: "Dreamy Flashback", durationSeconds: 127),
            ]
        ),
        MusicMood(
            id: "groove", label: "Groove", description: "Latin and funk grooves with a bit of swagger.",
            tracks: [
                MusicTrack(file: "bossa-antigua.mp3", title: "Bossa Antigua", durationSeconds: 283),
                MusicTrack(file: "fretless.mp3", title: "Fretless", durationSeconds: 336),
                MusicTrack(file: "wallpaper.mp3", title: "Wallpaper", durationSeconds: 220),
            ]
        ),
    ]

    static func mood(_ id: String?) -> MusicMood? {
        guard let id else { return nil }
        return moods.first { $0.id == id }
    }

    static func url(baseURL: URL, track: MusicTrack) -> URL {
        baseURL.appending(path: "/music/\(track.file)")
    }

    /// FNV-1a over UTF-16 code units, matching hashString in src/lib/music.ts.
    private static func hash(_ s: String) -> UInt32 {
        var h: UInt32 = 2_166_136_261
        for unit in s.utf16 {
            h ^= UInt32(unit)
            h = h &* 16_777_619
        }
        return h
    }

    /// The mood's tracks in the order this room plays them; same on the web.
    static func playlist(_ mood: MusicMood, spaceId: String) -> [MusicTrack] {
        let n = mood.tracks.count
        if n == 0 { return [] }
        let start = Int(hash(spaceId) % UInt32(n))
        return (0..<n).map { mood.tracks[(start + $0) % n] }
    }
}
