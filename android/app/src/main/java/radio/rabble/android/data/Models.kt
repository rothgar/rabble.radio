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
