package radio.rabble.android.data

import org.json.JSONArray
import org.json.JSONObject

private fun JSONObject.optNullableString(key: String): String? =
    if (isNull(key)) null else optString(key, null)

private fun JSONArray.toStringList(): List<String> =
    (0 until length()).map { getString(it) }

data class PublicHost(
    val did: String,
    val handle: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
) {
    companion object {
        fun fromJson(o: JSONObject) = PublicHost(
            did = o.getString("did"),
            handle = o.getString("handle"),
            displayName = o.optNullableString("displayName"),
            avatarUrl = o.optNullableString("avatarUrl"),
        )
    }
}

/** Mirror of PublicReplay: a finished show's recording, playable without joining. */
data class Replay(
    val recordingId: String,
    /** Server-relative; prefix with the API base URL. */
    val audioUrl: String,
    val contentType: String,
    val startedAt: String,
    val endedAt: String?,
    val durationSeconds: Int?,
    val sizeBytes: Long?,
) {
    companion object {
        fun fromJson(o: JSONObject) = Replay(
            recordingId = o.getString("recordingId"),
            audioUrl = o.getString("audioUrl"),
            contentType = o.optString("contentType", "audio/mp4"),
            startedAt = o.optString("startedAt", ""),
            endedAt = o.optNullableString("endedAt"),
            durationSeconds = if (o.isNull("durationSeconds")) null else o.optInt("durationSeconds"),
            sizeBytes = if (o.isNull("sizeBytes")) null else o.optLong("sizeBytes"),
        )
    }
}

/** One due reminder from GET /api/me/reminders?due=1. */
data class DueReminder(val spaceId: String, val title: String, val hostName: String) {
    companion object {
        fun fromJson(o: JSONObject): DueReminder {
            val host = o.optJSONObject("host")
            val name = host?.optNullableString("displayName") ?: host?.optString("handle")?.let { "@$it" } ?: "The host"
            return DueReminder(o.getString("spaceId"), o.optString("title", "A show"), name)
        }
    }
}

/** Mirror of PublicSpace in src/types.ts. */
data class Show(
    val id: String,
    val slug: String,
    val title: String,
    val description: String? = null,
    val isLive: Boolean = false,
    val status: String = "active",
    val scheduledAt: String? = null,
    val expiresAt: String? = null,
    val listenerCount: Int = 0,
    val speakerCount: Int = 0,
    val reactionCount: Int = 0,
    val tags: List<String> = emptyList(),
    val createdAt: String = "",
    val updatedAt: String = "",
    val host: PublicHost,
    val shareableUrl: String = "",
    val replay: Replay? = null,
    val reminded: Boolean = false,
) {
    companion object {
        fun fromJson(o: JSONObject) = Show(
            id = o.getString("id"),
            slug = o.optString("slug", ""),
            title = o.getString("title"),
            description = o.optNullableString("description"),
            isLive = o.optBoolean("isLive", false),
            status = o.optString("status", "active"),
            scheduledAt = o.optNullableString("scheduledAt"),
            expiresAt = o.optNullableString("expiresAt"),
            listenerCount = o.optInt("listenerCount", 0),
            speakerCount = o.optInt("speakerCount", 0),
            reactionCount = o.optInt("reactionCount", 0),
            tags = o.optJSONArray("tags")?.toStringList() ?: emptyList(),
            createdAt = o.optString("createdAt", ""),
            updatedAt = o.optString("updatedAt", ""),
            host = PublicHost.fromJson(o.getJSONObject("host")),
            shareableUrl = o.optString("shareableUrl", ""),
            replay = o.optJSONObject("replay")?.let { Replay.fromJson(it) },
            reminded = o.optBoolean("reminded", false),
        )

        fun listFromJson(arr: JSONArray): List<Show> =
            (0 until arr.length()).map { fromJson(arr.getJSONObject(it)) }
    }
}

data class Me(
    val id: String = "",
    val did: String,
    val handle: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
) {
    companion object {
        fun fromJson(o: JSONObject) = Me(
            id = o.optString("id", ""),
            did = o.getString("did"),
            handle = o.getString("handle"),
            displayName = o.optNullableString("displayName"),
            avatarUrl = o.optNullableString("avatarUrl"),
        )
    }
}

/** One STUN/TURN entry from the join response (Cloudflare TURN credentials). */
data class IceServer(
    val urls: List<String>,
    val username: String? = null,
    val credential: String? = null,
) {
    companion object {
        fun fromJson(o: JSONObject): IceServer? {
            val urls = o.optJSONArray("urls")?.let { arr -> List(arr.length()) { arr.getString(it) } }
                ?: o.optString("urls", "").takeIf { it.isNotEmpty() }?.let { listOf(it) }
                ?: return null
            return IceServer(
                urls = urls,
                username = o.optNullableString("username"),
                credential = o.optNullableString("credential"),
            )
        }
    }
}

/** Mirror of the POST /api/spaces/[id]/join response. */
data class JoinResponse(
    val token: String,
    val wsUrl: String,
    val role: String,
    val roomName: String,
    val identity: String,
    val handle: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    /** True when joined without a session (listen-only, never shown in the room). */
    val anonymous: Boolean = false,
    /**
     * Per-join STUN/TURN servers. Empty when the server offers no relay, in
     * which case the LiveKit SDK uses the SFU's own list (LAN only).
     */
    val iceServers: List<IceServer> = emptyList(),
) {
    companion object {
        fun fromJson(o: JSONObject) = JoinResponse(
            token = o.getString("token"),
            wsUrl = o.getString("wsUrl"),
            role = o.optString("role", "audience"),
            roomName = o.optString("roomName", ""),
            identity = o.optString("identity", ""),
            handle = o.optString("handle", ""),
            displayName = o.optNullableString("displayName"),
            avatarUrl = o.optNullableString("avatarUrl"),
            anonymous = o.optBoolean("anonymous", false),
            iceServers = o.optJSONArray("iceServers")?.let { arr ->
                (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let(IceServer::fromJson) }
            } ?: emptyList(),
        )
    }
}

data class ApiError(val error: String = "unknown", val message: String? = null) {
    companion object {
        fun fromJson(o: JSONObject) = ApiError(
            error = o.optString("error", "unknown"),
            message = o.optNullableString("message"),
        )
    }
}

/** A station is a category tag plus the shows whose primary tag it is. */
data class Station(val tag: String, val shows: List<Show>) {
    val hosts: List<PublicHost> get() = shows.map { it.host }.distinctBy { it.did }
    val liveCount: Int get() = shows.count { it.isLive }
}

/** Mirror of GET /api/spaces/[id]/stage. */
data class StageStatus(
    val onAir: Boolean,
    val onStage: Boolean,
    val pendingInviteFrom: String?,
) {
    companion object {
        fun fromJson(o: JSONObject) = StageStatus(
            onAir = o.optBoolean("onAir", false),
            onStage = o.optBoolean("onStage", false),
            pendingInviteFrom = o.optJSONObject("pendingInvite")?.optString("hostDid"),
        )
    }
}

/** Mirror of the accept/leave/remove responses from POST /api/spaces/[id]/stage. */
data class StageActionResponse(
    val token: String? = null,
    val wsUrl: String? = null,
    val role: String? = null,
) {
    companion object {
        fun fromJson(o: JSONObject) = StageActionResponse(
            token = o.optNullableString("token"),
            wsUrl = o.optNullableString("wsUrl"),
            role = o.optNullableString("role"),
        )
    }
}

/** One row of GET /api/users. */
data class UserSummary(
    val did: String,
    val handle: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
) {
    companion object {
        fun fromJson(o: JSONObject) = UserSummary(
            did = o.getString("did"),
            handle = o.optString("handle", ""),
            displayName = o.optNullableString("displayName"),
            avatarUrl = o.optNullableString("avatarUrl"),
        )
    }
}
