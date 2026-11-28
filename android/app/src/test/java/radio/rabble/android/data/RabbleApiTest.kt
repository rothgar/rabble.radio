package radio.rabble.android.data

import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class RabbleApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: RabbleApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val session = mockk<SessionStore>()
        every { session.cookieHeader() } returns "bs_spaces_session=abc"
        api = RabbleApi(server.url("/").toString().trimEnd('/'), session)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    // join

    @Test
    fun `join posts an empty body to the join route with the session cookie`() = runBlocking {
        server.enqueue(MockResponse().setBody(minimalJoinResponseJson))

        api.join("show-1")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/spaces/show-1/join", request.path)
        assertEquals("{}", request.body.readUtf8())
        assertEquals("bs_spaces_session=abc", request.getHeader("Cookie"))
    }

    @Test
    fun `join parses a response missing role, anonymous and iceServers instead of throwing`() = runBlocking {
        server.enqueue(MockResponse().setBody(minimalJoinResponseJson))

        val join = api.join("show-1")

        assertEquals("tok", join.token)
        assertEquals("wss://live.rabble.radio", join.wsUrl)
        assertEquals("audience", join.role)
        assertFalse(join.anonymous)
        assertTrue(join.iceServers.isEmpty())
    }

    @Test
    fun `join throws ApiException with the server's error code on a non-2xx response`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(404)
                .setBody("""{"error":"not_found","message":"Show not found"}""")
        )

        val error = try {
            api.join("show-1")
            null
        } catch (e: ApiException) {
            e
        }

        assertEquals(404, error?.status)
        assertEquals("not_found", error?.code)
    }

    // stageAction

    @Test
    fun `stageAction posts the action in the request body`() = runBlocking {
        server.enqueue(MockResponse().setBody("{}"))

        api.stageAction("show-1", "leave")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/spaces/show-1/stage", request.path)
        assertEquals("""{"action":"leave"}""", JSONObject(request.body.readUtf8()).toString())
    }

    @Test
    fun `stageAction parses a response missing token, wsUrl and role instead of throwing`() = runBlocking {
        server.enqueue(MockResponse().setBody("{}"))

        val response = api.stageAction("show-1", "leave")

        assertNull(response.token)
        assertNull(response.wsUrl)
        assertNull(response.role)
    }

    // adminOverview / adminAction

    @Test
    fun `adminOverview parses the overview counts and user list`() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """{"overview":{"totalUsers":10,"bannedUsers":1,"totalShows":5,"liveNow":2,"totalSessions":20,"buildId":"abc123"},
                   |"users":[{"did":"did:plc:a","handle":"alice.bsky.social","createdAt":"2026-11-01T00:00:00.000Z","bannedAt":null,"banReason":null}]}"""
                    .trimMargin()
            )
        )

        val response = api.adminOverview()

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/admin/overview", request.path)
        assertEquals("bs_spaces_session=abc", request.getHeader("Cookie"))
        assertEquals(10, response.overview.totalUsers)
        assertEquals(1, response.users.size)
        assertEquals("did:plc:a", response.users[0].did)
    }

    @Test
    fun `adminOverview throws ApiException with the 404 the server answers for non-admins`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"not_found"}"""))

        val error = try {
            api.adminOverview()
            null
        } catch (e: ApiException) {
            e
        }

        assertEquals(404, error?.status)
    }

    @Test
    fun `adminAction posts did, action and the reason when given`() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))

        api.adminAction("did:plc:a", "ban", "spam")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/admin/users", request.path)
        assertEquals(
            """{"did":"did:plc:a","action":"ban","reason":"spam"}""",
            JSONObject(request.body.readUtf8()).toString()
        )
    }

    @Test
    fun `adminAction omits reason when none is given`() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))

        api.adminAction("did:plc:a", "kick")

        val body = JSONObject(server.takeRequest().body.readUtf8())
        assertFalse(body.has("reason"))
    }

    // reportCrash

    @Test
    fun `reportCrash sends no app secret header when CRASH_REPORT_SECRET is unset`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(204))

        api.reportCrash("java.lang.NullPointerException", "boom", "stack", "ShowScreen")

        val request = server.takeRequest()
        assertEquals("/api/crashes", request.path)
        assertNull(request.getHeader("X-Rabble-App-Secret"))
    }

    companion object {
        private const val minimalJoinResponseJson = """{"token":"tok","wsUrl":"wss://live.rabble.radio"}"""
    }
}
