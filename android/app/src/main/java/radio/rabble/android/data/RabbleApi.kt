package radio.rabble.android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import radio.rabble.android.Tags
import java.io.IOException

class ApiException(val status: Int, val code: String, message: String?) :
    IOException(message ?: code)

/** Thin client for the rabble.radio JSON API. */
class RabbleApi(
    private val baseUrl: String,
    private val session: SessionStore,
    private val client: OkHttpClient = OkHttpClient(),
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    suspend fun listShows(): List<Show> =
        Show.listFromJson(request(get("/api/spaces")).getJSONArray("spaces"))

    suspend fun stations(): List<Station> {
        val shows = listShows()
        return Tags.CATEGORIES.mapNotNull { tag ->
            val inStation = shows.filter { Tags.primaryTagOf(it.tags) == tag }
            if (inStation.isEmpty()) null else Station(tag, inStation)
        }
    }

    suspend fun showsForStation(tag: String): List<Show> =
        listShows().filter { tag in it.tags }

    suspend fun show(id: String): Show =
        Show.fromJson(request(get("/api/spaces/$id")).getJSONObject("space"))

    /**
     * Open a show for a new session and land the caller in it as host, off
     * air. Without [showId] the server reopens the host's default show (or
     * creates it the first time); with one it reopens that show. The host
     * token in the response is ignored because ShowScreen joins through
     * /join, which mints a host token for the owner anyway.
     */
    suspend fun startShow(showId: String? = null): Show {
        val body = JSONObject().put("startNow", true)
        if (showId != null) body.put("spaceId", showId)
        return Show.fromJson(request(post("/api/spaces", body)).getJSONObject("space"))
    }

    /** The signed-in user's hosted and joined shows. */
    suspend fun myShows(): MyShows = MyShows.fromJson(request(get("/api/me/shows")))

    /** Host only: go on air (start broadcasting + recording) or off air. */
    suspend fun setOnAir(showId: String, onAir: Boolean): Show =
        Show.fromJson(
            request(post("/api/spaces/$showId/live", JSONObject().put("action", if (onAir) "start" else "end")))
                .getJSONObject("space")
        )

    /** Host only: rename the show or set its description/tags from inside the room. */
    suspend fun updateShow(showId: String, title: String? = null, description: String? = null, tags: List<String>? = null): Show {
        val body = JSONObject()
        if (title != null) body.put("title", title)
        if (description != null) body.put("description", description)
        if (tags != null) body.put("tags", org.json.JSONArray(tags))
        return Show.fromJson(request(patch("/api/spaces/$showId", body)).getJSONObject("space"))
    }

    /** Host only: set the pre-show music mood (null for silence). */
    suspend fun setMusicMood(showId: String, mood: String?): Show {
        val body = JSONObject().put("musicMood", mood ?: JSONObject.NULL)
        return Show.fromJson(request(patch("/api/spaces/$showId", body)).getJSONObject("space"))
    }

    /** Returns null when there is no valid session. */
    suspend fun me(): Me? = try {
        Me.fromJson(request(get("/api/me")))
    } catch (e: ApiException) {
        if (e.status == 401 || e.status == 404) null else throw e
    }

    suspend fun join(showId: String): JoinResponse =
        JoinResponse.fromJson(
            request(
                Request.Builder()
                    .url("$baseUrl/api/spaces/$showId/join")
                    .post("{}".toRequestBody(jsonType))
                    .withSession()
                    .build()
            )
        )

    /** The caller's stage status: pending invite, on-stage flag, on-air flag. */
    suspend fun stageStatus(showId: String): StageStatus =
        StageStatus.fromJson(request(get("/api/spaces/$showId/stage")))

    /**
     * Stage actions. `accept` and `leave` return a fresh LiveKit token with the
     * new role; the room must be reconnected with it.
     */
    suspend fun stageAction(showId: String, action: String): StageActionResponse =
        StageActionResponse.fromJson(request(post("/api/spaces/$showId/stage", JSONObject().put("action", action))))

    /** Host: invite an audience member to the stage (they get a `stage_invite` data message). */
    suspend fun inviteToStage(showId: String, targetIdentity: String) {
        request(post("/api/spaces/$showId/stage", JSONObject().put("action", "invite").put("targetIdentity", targetIdentity)))
    }

    /** Record a reaction; the server counts it and broadcasts it to the room with our profile. */
    suspend fun react(showId: String, emoji: String) {
        request(post("/api/spaces/$showId/reactions", JSONObject().put("emoji", emoji)))
    }

    /**
     * Send a problem report. Works signed out. `context` is the Diagnostics
     * capture; the server adds the session user and User-Agent.
     */
    suspend fun sendFeedback(message: String, category: String, showId: String?, context: JSONObject) {
        val body = JSONObject()
            .put("message", message)
            .put("category", category)
            .put("platform", "android")
            .put("appVersion", radio.rabble.android.BuildConfig.VERSION_NAME)
            .put("page", Diagnostics.screen)
            .put("context", context)
        if (showId != null) body.put("spaceId", showId)
        request(post("/api/feedback", body))
    }

    /** "Notify me" on a scheduled show. Returns the resulting state. */
    suspend fun remind(showId: String, on: Boolean): Boolean =
        request(post("/api/spaces/$showId/remind", JSONObject().put("on", on))).optBoolean("reminded", on)

    /** "Follow this host" for every show they go live on, not just one. Returns the resulting state. */
    suspend fun followHost(hostDid: String, on: Boolean): Boolean =
        request(post("/api/hosts/$hostDid/follow", JSONObject().put("on", on))).optBoolean("following", on)

    /** Reminders whose show just went on air; each is returned once. */
    suspend fun dueReminders(): List<DueReminder> {
        val arr = request(get("/api/me/reminders?due=1")).optJSONArray("due") ?: return emptyList()
        return (0 until arr.length()).map { DueReminder.fromJson(arr.getJSONObject(it)) }
    }

    /** Absolute URL for a replay's audio. */
    fun absolute(path: String): String = if (path.startsWith("http")) path else "$baseUrl$path"

    /** Resolve DIDs to handles and avatars for the people in a room. */
    suspend fun users(identities: Collection<String>): List<UserSummary> {
        if (identities.isEmpty()) return emptyList()
        val q = java.net.URLEncoder.encode(identities.joinToString(","), "UTF-8")
        val arr = request(get("/api/users?identities=$q")).optJSONArray("users") ?: return emptyList()
        return (0 until arr.length()).map { UserSummary.fromJson(arr.getJSONObject(it)) }
    }

    private fun post(path: String, body: JSONObject): Request =
        Request.Builder().url("$baseUrl$path").post(body.toString().toRequestBody(jsonType)).withSession().build()

    private fun patch(path: String, body: JSONObject): Request =
        Request.Builder().url("$baseUrl$path").patch(body.toString().toRequestBody(jsonType)).withSession().build()

    private fun get(path: String): Request =
        Request.Builder().url("$baseUrl$path").get().withSession().build()

    private fun Request.Builder.withSession(): Request.Builder = apply {
        header("Accept", "application/json")
        session.cookieHeader()?.let { header("Cookie", it) }
    }

    private suspend fun request(req: Request): JSONObject =
        withContext(Dispatchers.IO) {
            val call = runCatching { client.newCall(req).execute() }.getOrElse { e ->
                Diagnostics.event("network_error", "${req.method} ${req.url.encodedPath}: ${e.message ?: e.javaClass.simpleName}")
                throw e
            }
            call.use { res ->
                val body = res.body.string()
                if (!res.isSuccessful) {
                    val err = runCatching { ApiError.fromJson(JSONObject(body)) }
                        .getOrDefault(ApiError("http_${res.code}"))
                    Diagnostics.event(
                        "api_error",
                        "${req.method} ${req.url.encodedPath} -> ${res.code} ${err.error}",
                        JSONObject().put("message", err.message ?: JSONObject.NULL),
                    )
                    throw ApiException(res.code, err.error, err.message)
                }
                JSONObject(body)
            }
        }
}
