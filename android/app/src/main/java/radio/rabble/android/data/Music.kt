package radio.rabble.android.data

/**
 * Pre-show music catalog, mirrored from src/lib/music.ts on the web. Keep
 * the ids, files and order in step: the playlist order for a room is
 * derived from the same hash on both platforms so everyone hears the
 * same song first.
 *
 * All tracks: Kevin MacLeod (incompetech.com), CC BY 4.0.
 */
data class MusicTrack(val file: String, val title: String, val durationSeconds: Int) {
    val artistName: String get() = "Kevin MacLeod"
    val artist: String get() = "Kevin MacLeod (incompetech.com)"
    val license: String get() = "CC BY 4.0"
    val attribution: String get() = "$title by $artist, $license"

    /** The track's title and artist, standing in for a guest's name on the tile. */
    val guestName: String get() = "$title by $artistName"
}

data class MusicMood(val id: String, val label: String, val description: String, val tracks: List<MusicTrack>)

object Music {
    val MOODS: List<MusicMood> = listOf(
        MusicMood(
            "lounge", "Lounge", "Easy-going jazz and bossa for a relaxed room.",
            listOf(
                MusicTrack("airport-lounge.mp3", "Airport Lounge", 308),
                MusicTrack("backbay-lounge.mp3", "Backbay Lounge", 267),
                MusicTrack("lobby-time.mp3", "Lobby Time", 193),
            ),
        ),
        MusicMood(
            "upbeat", "Upbeat", "Bright and bouncy, for shows that start with energy.",
            listOf(
                MusicTrack("carefree.mp3", "Carefree", 205),
                MusicTrack("george-street-shuffle.mp3", "George Street Shuffle", 268),
                MusicTrack("pamgaea.mp3", "Pamgaea", 169),
            ),
        ),
        MusicMood(
            "focus", "Focus", "Calm, ambient piano and pads for talks and deep dives.",
            listOf(
                MusicTrack("deliberate-thought.mp3", "Deliberate Thought", 177),
                MusicTrack("meditation-impromptu-01.mp3", "Meditation Impromptu 01", 213),
                MusicTrack("dreamy-flashback.mp3", "Dreamy Flashback", 127),
            ),
        ),
        MusicMood(
            "groove", "Groove", "Latin and funk grooves with a bit of swagger.",
            listOf(
                MusicTrack("bossa-antigua.mp3", "Bossa Antigua", 283),
                MusicTrack("fretless.mp3", "Fretless", 336),
                MusicTrack("wallpaper.mp3", "Wallpaper", 220),
            ),
        ),
    )

    fun mood(id: String?): MusicMood? = id?.let { m -> MOODS.firstOrNull { it.id == m } }

    fun url(baseUrl: String, track: MusicTrack): String = "$baseUrl/music/${track.file}"

    /** FNV-1a over UTF-16 code units, matching hashString in src/lib/music.ts. */
    private fun hash(s: String): Long {
        var h = 2166136261L
        for (ch in s) {
            h = h xor ch.code.toLong()
            h = (h * 16777619L) and 0xFFFFFFFFL
        }
        return h
    }

    /** The mood's tracks in the order this room plays them; same on the web. */
    fun playlist(mood: MusicMood, spaceId: String): List<MusicTrack> {
        val n = mood.tracks.size
        if (n == 0) return emptyList()
        val start = (hash(spaceId) % n).toInt()
        return List(n) { i -> mood.tracks[(start + i) % n] }
    }
}
