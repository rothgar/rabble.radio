package radio.rabble.android.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelsTest {

    // PublicHost

    @Test
    fun `PublicHost parses a full payload`() {
        val host = PublicHost.fromJson(
            JSONObject(
                """{"did":"did:plc:abc","handle":"alice.bsky.social","displayName":"Alice","avatarUrl":"https://example.com/a.png"}"""
            )
        )
        assertEquals("did:plc:abc", host.did)
        assertEquals("alice.bsky.social", host.handle)
        assertEquals("Alice", host.displayName)
        assertEquals("https://example.com/a.png", host.avatarUrl)
    }

    @Test
    fun `PublicHost defaults a missing displayName to null`() {
        val host = PublicHost.fromJson(
            JSONObject("""{"did":"did:plc:abc","handle":"alice.bsky.social","avatarUrl":"https://example.com/a.png"}""")
        )
        assertNull(host.displayName)
    }

    @Test
    fun `PublicHost defaults a missing avatarUrl to null`() {
        val host = PublicHost.fromJson(
            JSONObject("""{"did":"did:plc:abc","handle":"alice.bsky.social","displayName":"Alice"}""")
        )
        assertNull(host.avatarUrl)
    }

    // Replay

    private val fullReplayJson =
        """{"recordingId":"rec-1","audioUrl":"/replays/rec-1.m4a","contentType":"audio/aac",
           "startedAt":"2025-12-01T00:00:00Z","endedAt":"2025-12-01T01:00:00Z",
           "durationSeconds":3600,"sizeBytes":123456}"""

    @Test
    fun `Replay parses a full payload`() {
        val replay = Replay.fromJson(JSONObject(fullReplayJson))
        assertEquals("rec-1", replay.recordingId)
        assertEquals("/replays/rec-1.m4a", replay.audioUrl)
        assertEquals("audio/aac", replay.contentType)
        assertEquals("2025-12-01T00:00:00Z", replay.startedAt)
        assertEquals("2025-12-01T01:00:00Z", replay.endedAt)
        assertEquals(3600, replay.durationSeconds)
        assertEquals(123456L, replay.sizeBytes)
    }

    @Test
    fun `Replay defaults a missing contentType to audio_mp4`() {
        val o = JSONObject(fullReplayJson).apply { remove("contentType") }
        assertEquals("audio/mp4", Replay.fromJson(o).contentType)
    }

    @Test
    fun `Replay defaults a missing startedAt to empty string`() {
        val o = JSONObject(fullReplayJson).apply { remove("startedAt") }
        assertEquals("", Replay.fromJson(o).startedAt)
    }

    @Test
    fun `Replay defaults a missing endedAt to null`() {
        val o = JSONObject(fullReplayJson).apply { remove("endedAt") }
        assertNull(Replay.fromJson(o).endedAt)
    }

    @Test
    fun `Replay defaults a missing durationSeconds to null`() {
        val o = JSONObject(fullReplayJson).apply { remove("durationSeconds") }
        assertNull(Replay.fromJson(o).durationSeconds)
    }

    @Test
    fun `Replay defaults a missing sizeBytes to null`() {
        val o = JSONObject(fullReplayJson).apply { remove("sizeBytes") }
        assertNull(Replay.fromJson(o).sizeBytes)
    }

    // DueReminder

    @Test
    fun `DueReminder parses a full payload`() {
        val reminder = DueReminder.fromJson(
            JSONObject(
                """{"spaceId":"show-1","title":"Friday Jam","host":{"displayName":"Alice","handle":"alice.bsky.social"}}"""
            )
        )
        assertEquals("show-1", reminder.spaceId)
        assertEquals("Friday Jam", reminder.title)
        assertEquals("Alice", reminder.hostName)
    }

    @Test
    fun `DueReminder defaults a missing title to A show`() {
        val reminder = DueReminder.fromJson(
            JSONObject("""{"spaceId":"show-1","host":{"displayName":"Alice"}}""")
        )
        assertEquals("A show", reminder.title)
    }

    @Test
    fun `DueReminder defaults a missing host to The host`() {
        val reminder = DueReminder.fromJson(JSONObject("""{"spaceId":"show-1","title":"Friday Jam"}"""))
        assertEquals("The host", reminder.hostName)
    }

    @Test
    fun `DueReminder falls back to the handle when the host has no displayName`() {
        val reminder = DueReminder.fromJson(
            JSONObject("""{"spaceId":"show-1","title":"Friday Jam","host":{"handle":"alice.bsky.social"}}""")
        )
        assertEquals("@alice.bsky.social", reminder.hostName)
    }

    // Show

    private val fullShowJson = """{
        "id":"show-1","slug":"friday-jam","title":"Friday Jam","description":"A chill set",
        "isLive":true,"status":"live","scheduledAt":"2026-01-01T00:00:00Z","expiresAt":"2026-01-02T00:00:00Z",
        "listenerCount":12,"speakerCount":3,"reactionCount":7,"likeCount":42,"sessionCount":5,"totalListeners":100,
        "tags":["music","chill"],"createdAt":"2025-12-01T00:00:00Z","updatedAt":"2025-12-02T00:00:00Z",
        "host":{"did":"did:plc:host","handle":"host.bsky.social"},
        "shareableUrl":"https://rabble.radio/s/show-1",
        "replay":{"recordingId":"rec-1","audioUrl":"/replays/rec-1.m4a"},
        "reminded":true,"hostFollowed":true,"hostSubscribed":true,"isNamedShow":true,"showFollowed":true,
        "followedInRoom":[{"did":"did:plc:friend","handle":"friend.bsky.social"}],
        "musicMood":"lofi","musicOnStage":false
    }"""

    private fun showJsonWithout(key: String): JSONObject = JSONObject(fullShowJson).apply { remove(key) }

    @Test
    fun `Show parses a full payload`() {
        val show = Show.fromJson(JSONObject(fullShowJson))
        assertEquals("show-1", show.id)
        assertEquals("friday-jam", show.slug)
        assertEquals("Friday Jam", show.title)
        assertEquals("A chill set", show.description)
        assertTrue(show.isLive)
        assertEquals("live", show.status)
        assertEquals("2026-01-01T00:00:00Z", show.scheduledAt)
        assertEquals("2026-01-02T00:00:00Z", show.expiresAt)
        assertEquals(12, show.listenerCount)
        assertEquals(3, show.speakerCount)
        assertEquals(7, show.reactionCount)
        assertEquals(42, show.likeCount)
        assertEquals(5, show.sessionCount)
        assertEquals(100, show.totalListeners)
        assertEquals(listOf("music", "chill"), show.tags)
        assertEquals("2025-12-01T00:00:00Z", show.createdAt)
        assertEquals("2025-12-02T00:00:00Z", show.updatedAt)
        assertEquals("did:plc:host", show.host.did)
        assertEquals("https://rabble.radio/s/show-1", show.shareableUrl)
        assertEquals("rec-1", show.replay?.recordingId)
        assertTrue(show.reminded)
        assertTrue(show.hostFollowed)
        assertTrue(show.hostSubscribed)
        assertTrue(show.isNamedShow)
        assertTrue(show.showFollowed)
        assertEquals(1, show.followedInRoom.size)
        assertEquals("did:plc:friend", show.followedInRoom[0].did)
        assertEquals("lofi", show.musicMood)
        assertFalse(show.musicOnStage)
    }

    @Test
    fun `Show defaults a missing slug to empty string`() {
        assertEquals("", Show.fromJson(showJsonWithout("slug")).slug)
    }

    @Test
    fun `Show defaults a missing description to null`() {
        assertNull(Show.fromJson(showJsonWithout("description")).description)
    }

    @Test
    fun `Show defaults a missing isLive to false`() {
        assertFalse(Show.fromJson(showJsonWithout("isLive")).isLive)
    }

    @Test
    fun `Show defaults a missing status to active`() {
        assertEquals("active", Show.fromJson(showJsonWithout("status")).status)
    }

    @Test
    fun `Show defaults a missing scheduledAt to null`() {
        assertNull(Show.fromJson(showJsonWithout("scheduledAt")).scheduledAt)
    }

    @Test
    fun `Show defaults a missing expiresAt to null`() {
        assertNull(Show.fromJson(showJsonWithout("expiresAt")).expiresAt)
    }

    @Test
    fun `Show defaults a missing listenerCount to zero`() {
        assertEquals(0, Show.fromJson(showJsonWithout("listenerCount")).listenerCount)
    }

    @Test
    fun `Show defaults a missing speakerCount to zero`() {
        assertEquals(0, Show.fromJson(showJsonWithout("speakerCount")).speakerCount)
    }

    @Test
    fun `Show defaults a missing reactionCount to zero`() {
        assertEquals(0, Show.fromJson(showJsonWithout("reactionCount")).reactionCount)
    }

    @Test
    fun `Show defaults a missing likeCount to zero`() {
        assertEquals(0, Show.fromJson(showJsonWithout("likeCount")).likeCount)
    }

    @Test
    fun `Show defaults a missing sessionCount to zero`() {
        assertEquals(0, Show.fromJson(showJsonWithout("sessionCount")).sessionCount)
    }

    @Test
    fun `Show defaults a missing totalListeners to zero`() {
        assertEquals(0, Show.fromJson(showJsonWithout("totalListeners")).totalListeners)
    }

    @Test
    fun `Show defaults missing tags to an empty list`() {
        assertEquals(emptyList<String>(), Show.fromJson(showJsonWithout("tags")).tags)
    }

    @Test
    fun `Show defaults a missing createdAt to empty string`() {
        assertEquals("", Show.fromJson(showJsonWithout("createdAt")).createdAt)
    }

    @Test
    fun `Show defaults a missing updatedAt to empty string`() {
        assertEquals("", Show.fromJson(showJsonWithout("updatedAt")).updatedAt)
    }

    @Test
    fun `Show defaults a missing shareableUrl to empty string`() {
        assertEquals("", Show.fromJson(showJsonWithout("shareableUrl")).shareableUrl)
    }

    @Test
    fun `Show defaults a missing replay to null`() {
        assertNull(Show.fromJson(showJsonWithout("replay")).replay)
    }

    @Test
    fun `Show defaults a missing reminded to false`() {
        assertFalse(Show.fromJson(showJsonWithout("reminded")).reminded)
    }

    @Test
    fun `Show defaults a missing hostFollowed to false`() {
        assertFalse(Show.fromJson(showJsonWithout("hostFollowed")).hostFollowed)
    }

    @Test
    fun `Show defaults a missing hostSubscribed to false`() {
        assertFalse(Show.fromJson(showJsonWithout("hostSubscribed")).hostSubscribed)
    }

    @Test
    fun `Show defaults a missing isNamedShow to false`() {
        assertFalse(Show.fromJson(showJsonWithout("isNamedShow")).isNamedShow)
    }

    @Test
    fun `Show defaults a missing showFollowed to false`() {
        assertFalse(Show.fromJson(showJsonWithout("showFollowed")).showFollowed)
    }

    @Test
    fun `Show defaults missing followedInRoom to an empty list`() {
        assertEquals(emptyList<PublicHost>(), Show.fromJson(showJsonWithout("followedInRoom")).followedInRoom)
    }

    @Test
    fun `Show defaults a missing musicMood to null`() {
        assertNull(Show.fromJson(showJsonWithout("musicMood")).musicMood)
    }

    @Test
    fun `Show defaults a missing musicOnStage to true`() {
        assertTrue(Show.fromJson(showJsonWithout("musicOnStage")).musicOnStage)
    }

    // JoinedShow

    private val fullJoinedShowJson = """{
        "sessionId":"sess-1","role":"speaker","joinedAt":"2025-12-01T00:00:00Z","stageSeconds":120,
        "space":{
            "id":"show-1","title":"Friday Jam","status":"live","isLive":true,"tags":["music"],
            "host":{"did":"did:plc:host","handle":"host.bsky.social"}
        }
    }"""

    private fun joinedShowJsonWithout(key: String): JSONObject {
        val o = JSONObject(fullJoinedShowJson)
        if (o.has(key)) o.remove(key) else o.getJSONObject("space").remove(key)
        return o
    }

    @Test
    fun `JoinedShow parses a full payload`() {
        val joined = JoinedShow.fromJson(JSONObject(fullJoinedShowJson))
        assertEquals("sess-1", joined.sessionId)
        assertEquals("speaker", joined.role)
        assertEquals("2025-12-01T00:00:00Z", joined.joinedAt)
        assertEquals(120, joined.stageSeconds)
        assertEquals("show-1", joined.showId)
        assertEquals("Friday Jam", joined.title)
        assertEquals("live", joined.status)
        assertTrue(joined.isLive)
        assertEquals(listOf("music"), joined.tags)
        assertEquals("did:plc:host", joined.host.did)
    }

    @Test
    fun `JoinedShow defaults a missing role to audience`() {
        assertEquals("audience", JoinedShow.fromJson(joinedShowJsonWithout("role")).role)
    }

    @Test
    fun `JoinedShow defaults a missing joinedAt to empty string`() {
        assertEquals("", JoinedShow.fromJson(joinedShowJsonWithout("joinedAt")).joinedAt)
    }

    @Test
    fun `JoinedShow defaults a missing stageSeconds to zero`() {
        assertEquals(0, JoinedShow.fromJson(joinedShowJsonWithout("stageSeconds")).stageSeconds)
    }

    @Test
    fun `JoinedShow defaults a missing space status to active`() {
        assertEquals("active", JoinedShow.fromJson(joinedShowJsonWithout("status")).status)
    }

    @Test
    fun `JoinedShow defaults a missing space isLive to false`() {
        assertFalse(JoinedShow.fromJson(joinedShowJsonWithout("isLive")).isLive)
    }

    @Test
    fun `JoinedShow defaults missing space tags to an empty list`() {
        assertEquals(emptyList<String>(), JoinedShow.fromJson(joinedShowJsonWithout("tags")).tags)
    }

    // MyShows

    private val fullMyShowsJson = """{
        "hosted":[{"id":"show-1","title":"Friday Jam","host":{"did":"did:plc:host","handle":"host.bsky.social"}}],
        "joined":[{"sessionId":"sess-1","space":{"id":"show-2","title":"Saturday Set","host":{"did":"did:plc:h2","handle":"h2.bsky.social"}}}]
    }"""

    @Test
    fun `MyShows parses a full payload`() {
        val myShows = MyShows.fromJson(JSONObject(fullMyShowsJson))
        assertEquals(1, myShows.hosted.size)
        assertEquals("show-1", myShows.hosted[0].id)
        assertEquals(1, myShows.joined.size)
        assertEquals("sess-1", myShows.joined[0].sessionId)
    }

    @Test
    fun `MyShows defaults missing hosted to an empty list`() {
        val o = JSONObject(fullMyShowsJson).apply { remove("hosted") }
        assertEquals(emptyList<Show>(), MyShows.fromJson(o).hosted)
    }

    @Test
    fun `MyShows defaults missing joined to an empty list`() {
        val o = JSONObject(fullMyShowsJson).apply { remove("joined") }
        assertEquals(emptyList<JoinedShow>(), MyShows.fromJson(o).joined)
    }

    // Me

    private val fullMeJson = """{"id":"user-1","did":"did:plc:abc","handle":"alice.bsky.social","displayName":"Alice","avatarUrl":"https://example.com/a.png","isAdmin":true}"""

    @Test
    fun `Me parses a full payload`() {
        val me = Me.fromJson(JSONObject(fullMeJson))
        assertEquals("user-1", me.id)
        assertEquals("did:plc:abc", me.did)
        assertEquals("alice.bsky.social", me.handle)
        assertEquals("Alice", me.displayName)
        assertEquals("https://example.com/a.png", me.avatarUrl)
        assertEquals(true, me.isAdmin)
    }

    @Test
    fun `Me defaults a missing id to empty string`() {
        val o = JSONObject(fullMeJson).apply { remove("id") }
        assertEquals("", Me.fromJson(o).id)
    }

    @Test
    fun `Me defaults a missing displayName to null`() {
        val o = JSONObject(fullMeJson).apply { remove("displayName") }
        assertNull(Me.fromJson(o).displayName)
    }

    @Test
    fun `Me defaults a missing avatarUrl to null`() {
        val o = JSONObject(fullMeJson).apply { remove("avatarUrl") }
        assertNull(Me.fromJson(o).avatarUrl)
    }

    @Test
    fun `Me defaults a missing isAdmin to false`() {
        val o = JSONObject(fullMeJson).apply { remove("isAdmin") }
        assertEquals(false, Me.fromJson(o).isAdmin)
    }

    // IceServer

    @Test
    fun `IceServer parses a full payload`() {
        val ice = IceServer.fromJson(
            JSONObject("""{"urls":["turn:turn.rabble.radio:443"],"username":"u","credential":"c"}""")
        )
        assertEquals(listOf("turn:turn.rabble.radio:443"), ice?.urls)
        assertEquals("u", ice?.username)
        assertEquals("c", ice?.credential)
    }

    @Test
    fun `IceServer parses a single urls string as a one-element list`() {
        val ice = IceServer.fromJson(JSONObject("""{"urls":"stun:stun.rabble.radio:443"}"""))
        assertEquals(listOf("stun:stun.rabble.radio:443"), ice?.urls)
    }

    @Test
    fun `IceServer defaults a missing username to null`() {
        val ice = IceServer.fromJson(JSONObject("""{"urls":["turn:turn.rabble.radio:443"],"credential":"c"}"""))
        assertNull(ice?.username)
    }

    @Test
    fun `IceServer defaults a missing credential to null`() {
        val ice = IceServer.fromJson(JSONObject("""{"urls":["turn:turn.rabble.radio:443"],"username":"u"}"""))
        assertNull(ice?.credential)
    }

    @Test
    fun `IceServer returns null when urls is missing`() {
        assertNull(IceServer.fromJson(JSONObject("""{"username":"u","credential":"c"}""")))
    }

    // JoinResponse

    private val fullJoinResponseJson = """{
        "token":"tok","wsUrl":"wss://live.rabble.radio","role":"speaker","roomName":"room-1",
        "identity":"did:plc:abc","handle":"alice.bsky.social","displayName":"Alice",
        "avatarUrl":"https://example.com/a.png","anonymous":true,
        "iceServers":[{"urls":["turn:turn.rabble.radio:443"],"username":"u","credential":"c"}]
    }"""

    private fun joinResponseJsonWithout(key: String): JSONObject =
        JSONObject(fullJoinResponseJson).apply { remove(key) }

    @Test
    fun `JoinResponse parses a full payload`() {
        val join = JoinResponse.fromJson(JSONObject(fullJoinResponseJson))
        assertEquals("tok", join.token)
        assertEquals("wss://live.rabble.radio", join.wsUrl)
        assertEquals("speaker", join.role)
        assertEquals("room-1", join.roomName)
        assertEquals("did:plc:abc", join.identity)
        assertEquals("alice.bsky.social", join.handle)
        assertEquals("Alice", join.displayName)
        assertEquals("https://example.com/a.png", join.avatarUrl)
        assertTrue(join.anonymous)
        assertEquals(1, join.iceServers.size)
    }

    @Test
    fun `JoinResponse defaults a missing role to audience`() {
        assertEquals("audience", JoinResponse.fromJson(joinResponseJsonWithout("role")).role)
    }

    @Test
    fun `JoinResponse defaults a missing roomName to empty string`() {
        assertEquals("", JoinResponse.fromJson(joinResponseJsonWithout("roomName")).roomName)
    }

    @Test
    fun `JoinResponse defaults a missing identity to empty string`() {
        assertEquals("", JoinResponse.fromJson(joinResponseJsonWithout("identity")).identity)
    }

    @Test
    fun `JoinResponse defaults a missing handle to empty string`() {
        assertEquals("", JoinResponse.fromJson(joinResponseJsonWithout("handle")).handle)
    }

    @Test
    fun `JoinResponse defaults a missing displayName to null`() {
        assertNull(JoinResponse.fromJson(joinResponseJsonWithout("displayName")).displayName)
    }

    @Test
    fun `JoinResponse defaults a missing avatarUrl to null`() {
        assertNull(JoinResponse.fromJson(joinResponseJsonWithout("avatarUrl")).avatarUrl)
    }

    @Test
    fun `JoinResponse defaults a missing anonymous to false`() {
        assertFalse(JoinResponse.fromJson(joinResponseJsonWithout("anonymous")).anonymous)
    }

    @Test
    fun `JoinResponse defaults missing iceServers to an empty list`() {
        assertEquals(emptyList<IceServer>(), JoinResponse.fromJson(joinResponseJsonWithout("iceServers")).iceServers)
    }

    // ApiError

    @Test
    fun `ApiError parses a full payload`() {
        val error = ApiError.fromJson(JSONObject("""{"error":"not_found","message":"Show not found"}"""))
        assertEquals("not_found", error.error)
        assertEquals("Show not found", error.message)
    }

    @Test
    fun `ApiError defaults a missing error to unknown`() {
        val error = ApiError.fromJson(JSONObject("""{"message":"Show not found"}"""))
        assertEquals("unknown", error.error)
    }

    @Test
    fun `ApiError defaults a missing message to null`() {
        val error = ApiError.fromJson(JSONObject("""{"error":"not_found"}"""))
        assertNull(error.message)
    }

    // StageStatus

    @Test
    fun `StageStatus parses a full payload`() {
        val status = StageStatus.fromJson(
            JSONObject("""{"onAir":true,"onStage":true,"pendingInvite":{"hostDid":"did:plc:host"}}""")
        )
        assertTrue(status.onAir)
        assertTrue(status.onStage)
        assertEquals("did:plc:host", status.pendingInviteFrom)
    }

    @Test
    fun `StageStatus defaults a missing onAir to false`() {
        val status = StageStatus.fromJson(JSONObject("""{"onStage":true}"""))
        assertFalse(status.onAir)
    }

    @Test
    fun `StageStatus defaults a missing onStage to false`() {
        val status = StageStatus.fromJson(JSONObject("""{"onAir":true}"""))
        assertFalse(status.onStage)
    }

    @Test
    fun `StageStatus defaults a missing pendingInvite to null`() {
        val status = StageStatus.fromJson(JSONObject("""{"onAir":true,"onStage":false}"""))
        assertNull(status.pendingInviteFrom)
    }

    // StageActionResponse

    private val fullStageActionResponseJson = """{"token":"tok","wsUrl":"wss://live.rabble.radio","role":"speaker"}"""

    private fun stageActionResponseJsonWithout(key: String): JSONObject =
        JSONObject(fullStageActionResponseJson).apply { remove(key) }

    @Test
    fun `StageActionResponse parses a full payload`() {
        val response = StageActionResponse.fromJson(JSONObject(fullStageActionResponseJson))
        assertEquals("tok", response.token)
        assertEquals("wss://live.rabble.radio", response.wsUrl)
        assertEquals("speaker", response.role)
    }

    @Test
    fun `StageActionResponse defaults a missing token to null`() {
        assertNull(StageActionResponse.fromJson(stageActionResponseJsonWithout("token")).token)
    }

    @Test
    fun `StageActionResponse defaults a missing wsUrl to null`() {
        assertNull(StageActionResponse.fromJson(stageActionResponseJsonWithout("wsUrl")).wsUrl)
    }

    @Test
    fun `StageActionResponse defaults a missing role to null`() {
        assertNull(StageActionResponse.fromJson(stageActionResponseJsonWithout("role")).role)
    }

    // UserSummary

    private val fullUserSummaryJson =
        """{"did":"did:plc:abc","handle":"alice.bsky.social","displayName":"Alice","avatarUrl":"https://example.com/a.png"}"""

    @Test
    fun `UserSummary parses a full payload`() {
        val user = UserSummary.fromJson(JSONObject(fullUserSummaryJson))
        assertEquals("did:plc:abc", user.did)
        assertEquals("alice.bsky.social", user.handle)
        assertEquals("Alice", user.displayName)
        assertEquals("https://example.com/a.png", user.avatarUrl)
    }

    @Test
    fun `UserSummary defaults a missing handle to empty string`() {
        val o = JSONObject(fullUserSummaryJson).apply { remove("handle") }
        assertEquals("", UserSummary.fromJson(o).handle)
    }

    @Test
    fun `UserSummary defaults a missing displayName to null`() {
        val o = JSONObject(fullUserSummaryJson).apply { remove("displayName") }
        assertNull(UserSummary.fromJson(o).displayName)
    }

    @Test
    fun `UserSummary defaults a missing avatarUrl to null`() {
        val o = JSONObject(fullUserSummaryJson).apply { remove("avatarUrl") }
        assertNull(UserSummary.fromJson(o).avatarUrl)
    }

    // AdminOverview / AdminUser / AdminOverviewResponse

    private val fullAdminOverviewJson =
        """{"totalUsers":10,"bannedUsers":1,"totalShows":5,"liveNow":2,"totalSessions":20,"buildId":"abc123"}"""

    @Test
    fun `AdminOverview parses a full payload`() {
        val overview = AdminOverview.fromJson(JSONObject(fullAdminOverviewJson))
        assertEquals(10, overview.totalUsers)
        assertEquals(1, overview.bannedUsers)
        assertEquals(5, overview.totalShows)
        assertEquals(2, overview.liveNow)
        assertEquals(20, overview.totalSessions)
        assertEquals("abc123", overview.buildId)
    }

    @Test
    fun `AdminOverview defaults a missing buildId to null`() {
        val o = JSONObject(fullAdminOverviewJson).apply { remove("buildId") }
        assertNull(AdminOverview.fromJson(o).buildId)
    }

    private val fullAdminUserJson =
        """{"did":"did:plc:a","handle":"alice.bsky.social","displayName":"Alice","createdAt":"2026-11-01T00:00:00.000Z","bannedAt":"2026-11-19T00:00:00.000Z","banReason":"spam"}"""

    @Test
    fun `AdminUser parses a full payload`() {
        val user = AdminUser.fromJson(JSONObject(fullAdminUserJson))
        assertEquals("did:plc:a", user.did)
        assertEquals("alice.bsky.social", user.handle)
        assertEquals("Alice", user.displayName)
        assertEquals("2026-11-01T00:00:00.000Z", user.createdAt)
        assertEquals("2026-11-19T00:00:00.000Z", user.bannedAt)
        assertEquals("spam", user.banReason)
    }

    @Test
    fun `AdminUser defaults a missing displayName to null`() {
        val o = JSONObject(fullAdminUserJson).apply { remove("displayName") }
        assertNull(AdminUser.fromJson(o).displayName)
    }

    @Test
    fun `AdminUser defaults a missing bannedAt to null`() {
        val o = JSONObject(fullAdminUserJson).apply { remove("bannedAt") }
        assertNull(AdminUser.fromJson(o).bannedAt)
    }

    @Test
    fun `AdminUser defaults a missing banReason to null`() {
        val o = JSONObject(fullAdminUserJson).apply { remove("banReason") }
        assertNull(AdminUser.fromJson(o).banReason)
    }

    @Test
    fun `AdminOverviewResponse parses overview and users`() {
        val json = """{"overview":$fullAdminOverviewJson,"users":[$fullAdminUserJson]}"""
        val response = AdminOverviewResponse.fromJson(JSONObject(json))
        assertEquals(10, response.overview.totalUsers)
        assertEquals(1, response.users.size)
        assertEquals("did:plc:a", response.users[0].did)
    }

    @Test
    fun `AdminOverviewResponse defaults missing users to an empty list`() {
        val json = """{"overview":$fullAdminOverviewJson}"""
        assertEquals(emptyList<AdminUser>(), AdminOverviewResponse.fromJson(JSONObject(json)).users)
    }
}
