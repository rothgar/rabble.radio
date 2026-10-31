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

    private fun get(path: String): Request =
        Request.Builder().url("$baseUrl$path").get().withSession().build()

    private fun Request.Builder.withSession(): Request.Builder = apply {
        header("Accept", "application/json")
        session.cookieHeader()?.let { header("Cookie", it) }
    }

    private suspend fun request(req: Request): JSONObject =
        withContext(Dispatchers.IO) {
            client.newCall(req).execute().use { res ->
                val body = res.body.string()
                if (!res.isSuccessful) {
                    val err = runCatching { ApiError.fromJson(JSONObject(body)) }
                        .getOrDefault(ApiError("http_${res.code}"))
                    throw ApiException(res.code, err.error, err.message)
                }
                JSONObject(body)
            }
        }
}
