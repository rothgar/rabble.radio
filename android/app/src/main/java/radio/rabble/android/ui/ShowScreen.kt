package radio.rabble.android.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.border
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.runtime.mutableStateMapOf
import radio.rabble.android.data.Diagnostics
import radio.rabble.android.data.Me
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import radio.rabble.android.data.Music
import radio.rabble.android.data.Replay
import radio.rabble.android.Reminders
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.LocalBar
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material3.Slider
import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.ui.zIndex
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.Surface
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import io.livekit.android.AudioOptions
import io.livekit.android.AudioType
import io.livekit.android.ConnectOptions
import io.livekit.android.LiveKit
import io.livekit.android.LiveKitOverrides
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.participant.Participant
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import livekit.org.webrtc.PeerConnection
import org.json.JSONObject
import radio.rabble.android.RabbleApp
import radio.rabble.android.data.ApiException
import radio.rabble.android.data.JoinResponse
import radio.rabble.android.data.Show
import radio.rabble.android.data.UserSummary

sealed interface ShowState {
    data object Loading : ShowState
    data class Ready(val show: Show) : ShowState
    data class Failed(val message: String) : ShowState
}

/** One person in the room as the UI shows them. Anonymous listeners are counted, not listed. */
data class RoomMember(
    val identity: String,
    val name: String,
    val avatarUrl: String?,
    val isHost: Boolean,
    val onStage: Boolean,
    val speaking: Boolean,
    val micOn: Boolean,
    val isLocal: Boolean,
    /** Audience member asking to speak (LiveKit participant attribute `hand`). */
    val handRaised: Boolean = false,
)

/**
 * A reaction in flight. `origin` is the centre of the sender's avatar in
 * root coordinates (px); null when their tile is not on screen, in which
 * case it rises from the bottom centre.
 */
data class FloatingEmoji(
    val id: Long,
    val emoji: String,
    val origin: Offset?,
    val jitter: Int,
)

/** How long a reaction stays on screen, in ms. */
private const val REACTION_FLOAT_MS = 3200

sealed interface RoomState {
    data object Idle : RoomState
    data object Joining : RoomState
    data class Connected(
        val join: JoinResponse,
        val members: List<RoomMember> = emptyList(),
        val anonymousListeners: Int = 0,
        val micOn: Boolean = false,
        val onAir: Boolean = false,
        val stageBusy: Boolean = false,
        val notice: String? = null,
        /** Someone other than us is publishing audio (so pre-show music should yield). */
        val remoteAudio: Boolean = false,
        /** Our own raised hand (audience only). */
        val handRaised: Boolean = false,
        /** Audience members the host has already invited this session. */
        val invited: Set<String> = emptySet(),
    ) : RoomState
    data class Failed(val message: String) : RoomState
}

private val REACTIONS = listOf("👍", "❤️", "😂", "🎉", "👏")

/**
 * Listeners get a room in media mode, so the show and the pre-show music follow the
 * phone's media volume like a podcast app would. Anyone publishing a microphone gets
 * call mode instead, which is what turns on the hardware echo cancellation. LiveKit
 * fixes the mode when the Room is created, so changing it means a new Room; stage
 * changes already reconnect, so that is where the swap happens.
 */
private fun createRoom(context: Context, callMode: Boolean): Room =
    LiveKit.create(
        context.applicationContext,
        overrides = LiveKitOverrides(
            audioOptions = AudioOptions(
                audioOutputType = if (callMode) AudioType.CallAudioType() else AudioType.MediaAudioType(),
            ),
        ),
    )
private const val STAGE_POLL_MS = 4000L

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShowScreen(app: RabbleApp, showId: String, sessionVersion: Int, onLogin: () -> Unit, onBack: () -> Unit, autoJoin: Boolean = false) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<ShowState>(ShowState.Loading) }
    var reload by remember { mutableStateOf(0) }
    var room by remember { mutableStateOf<RoomState>(RoomState.Idle) }
    var signedIn by remember { mutableStateOf(false) }
    var profiles by remember { mutableStateOf<Map<String, UserSummary>>(emptyMap()) }
    var floating by remember { mutableStateOf<List<FloatingEmoji>>(emptyList()) }
    var editing by remember { mutableStateOf(false) }
    var autoJoined by remember { mutableStateOf(false) }
    var reminded by remember { mutableStateOf(false) }
    var remindBusy by remember { mutableStateOf(false) }
    var hostFollowing by remember { mutableStateOf(false) }
    var hostFollowBusy by remember { mutableStateOf(false) }
    var showFollowing by remember { mutableStateOf(false) }
    var showFollowBusy by remember { mutableStateOf(false) }
    val notifPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    fun toggleRemind() {
        if (remindBusy) return
        remindBusy = true
        val next = !reminded
        scope.launch {
            try {
                reminded = app.api.remind(showId, next)
                if (reminded && !Reminders.canPost(context)) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                if (reminded) Reminders.schedule(context.applicationContext)
            } catch (e: Exception) {
                Diagnostics.event("remind_failed", e.message ?: "")
            } finally {
                remindBusy = false
            }
        }
    }

    /** "Follow this host" for every show they go live on, not just this one. */
    fun toggleHostFollow(hostDid: String) {
        if (hostFollowBusy) return
        hostFollowBusy = true
        val next = !hostFollowing
        scope.launch {
            try {
                hostFollowing = app.api.followHost(hostDid, next)
                if (hostFollowing && !Reminders.canPost(context)) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                if (hostFollowing) Reminders.schedule(context.applicationContext)
            } catch (e: Exception) {
                Diagnostics.event("host_follow_failed", e.message ?: "")
            } finally {
                hostFollowBusy = false
            }
        }
    }

    /** "Follow this show": notified only when this exact named show goes live. */
    fun toggleShowFollow(showId: String) {
        if (showFollowBusy) return
        showFollowBusy = true
        val next = !showFollowing
        scope.launch {
            try {
                showFollowing = app.api.followShow(showId, next)
                if (showFollowing && !Reminders.canPost(context)) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                if (showFollowing) Reminders.schedule(context.applicationContext)
            } catch (e: Exception) {
                Diagnostics.event("show_follow_failed", e.message ?: "")
            } finally {
                showFollowBusy = false
            }
        }
    }

    var moodBusy by remember { mutableStateOf(false) }
    fun setMusicMood(mood: String?) {
        if (moodBusy) return
        moodBusy = true
        scope.launch {
            try {
                state = ShowState.Ready(app.api.setMusicMood(showId, mood))
            } catch (e: Exception) {
                Diagnostics.event("music_mood_failed", e.message ?: "")
            } finally {
                moodBusy = false
            }
        }
    }

    /** Centre of each member's avatar (root px), kept fresh by MemberTile. */
    val avatarCentres = remember { mutableStateMapOf<String, Offset>() }
    var overlayOrigin by remember { mutableStateOf(Offset.Zero) }

    LaunchedEffect(showId) { Diagnostics.screen = "show/$showId" }
    LaunchedEffect(room) {
        when (val r = room) {
            is RoomState.Connected -> Diagnostics.setRoom(
                showId = showId,
                role = r.join.role,
                connected = true,
                onAir = r.onAir,
                micOn = r.micOn,
                members = r.members.size,
                anonymousListeners = r.anonymousListeners,
                // No stage invites to accept anymore; always false, kept so the
                // feedback context key stays stable.
                invitePending = false,
            )
            is RoomState.Failed -> Diagnostics.event("room_failed", r.message)
            else -> Diagnostics.clearRoom()
        }
    }
    var lkRoom by remember { mutableStateOf(createRoom(context, callMode = false)) }
    var roomCallMode by remember { mutableStateOf(false) }

    var me by remember { mutableStateOf<Me?>(null) }
    LaunchedEffect(sessionVersion) {
        me = if (app.session.hasSession()) runCatching { app.api.me() }.getOrNull() else null
    }
    LaunchedEffect(showId, reload, sessionVersion) {
        state = ShowState.Loading
        signedIn = app.session.hasSession()
        state = try {
            val show = app.api.show(showId)
            reminded = show.reminded
            hostFollowing = show.hostSubscribed
            showFollowing = show.showFollowed
            ShowState.Ready(show)
        } catch (e: Exception) {
            ShowState.Failed(e.message ?: "Could not load this show.")
        }
    }

    /** Float an emoji up from a member's avatar in the stage/audience area for ~1.6s. */
    fun spawnReaction(emoji: String, identity: String) {
        val id = System.nanoTime()
        floating = floating + FloatingEmoji(id, emoji, avatarCentres[identity], jitter = ((id / 7) % 61).toInt() - 30)
        scope.launch {
            delay(REACTION_FLOAT_MS.toLong() + 100)
            floating = floating.filterNot { it.id == id }
        }
    }

    /** Rebuild the member list from the LiveKit room plus the profile cache. */
    fun refreshMembers() {
        val current = room as? RoomState.Connected ?: return
        val hostDid = (state as? ShowState.Ready)?.show?.host?.did
        val everyone: List<Participant> = listOf(lkRoom.localParticipant) + lkRoom.remoteParticipants.values
        var anonymous = 0
        val members = everyone.mapNotNull { p ->
            val id = p.identity?.value ?: return@mapNotNull null
            if (id.startsWith("anon:")) {
                anonymous++
                return@mapNotNull null
            }
            val isLocal = p === lkRoom.localParticipant
            if (isLocal && current.join.anonymous) return@mapNotNull null
            val profile = profiles[id]
            val name = profile?.displayName?.takeIf { it.isNotBlank() }
                ?: profile?.handle?.let { "@$it" }
                ?: (if (isLocal) current.join.displayName ?: "@${current.join.handle}" else p.name?.takeIf { it.isNotBlank() })
                ?: "Listener"
            val canPublish = p.permissions?.canPublish ?: (isLocal && current.join.role != "audience")
            RoomMember(
                identity = id,
                name = name,
                avatarUrl = profile?.avatarUrl ?: if (isLocal) current.join.avatarUrl else null,
                isHost = id == hostDid,
                onStage = canPublish,
                speaking = p.isSpeaking,
                micOn = p.isMicrophoneEnabled,
                isLocal = isLocal,
                handRaised = !canPublish && p.attributes["hand"] == "1",
            )
        }.sortedWith(compareByDescending<RoomMember> { it.isHost }.thenByDescending { it.onStage }.thenBy { it.name })
        val remoteAudio = lkRoom.remoteParticipants.values.any { it.audioTrackPublications.isNotEmpty() }
        val localCanPublish = members.any { it.isLocal && it.onStage }
        room = current.copy(
            members = members,
            anonymousListeners = anonymous,
            remoteAudio = remoteAudio,
            // Taking the stage answers the request; drop the hand.
            handRaised = current.handRaised && !localCanPublish,
        )
        if (current.handRaised && localCanPublish) lkRoom.localParticipant.updateAttributes(mapOf("hand" to ""))
        // Resolve any identities we have not seen yet.
        val missing = members.map { it.identity }.filter { it !in profiles }
        if (missing.isNotEmpty()) {
            scope.launch {
                runCatching { app.api.users(missing) }.getOrNull()?.let { found ->
                    profiles = profiles + found.associateBy { it.did }
                    // Mark the rest so we do not refetch them every event.
                    profiles = profiles + missing.filter { it !in profiles }.associateWith { UserSummary(it, "") }
                }
            }
        }
    }

    LaunchedEffect(profiles) { refreshMembers() }

    LaunchedEffect(lkRoom) {
        lkRoom.events.collect { event ->
            when (event) {
                is RoomEvent.Connected,
                is RoomEvent.ParticipantConnected,
                is RoomEvent.ParticipantDisconnected,
                is RoomEvent.ActiveSpeakersChanged,
                is RoomEvent.TrackMuted,
                is RoomEvent.TrackUnmuted,
                is RoomEvent.TrackPublished,
                is RoomEvent.TrackUnpublished,
                is RoomEvent.ParticipantPermissionsChanged,
                is RoomEvent.ParticipantAttributesChanged -> refreshMembers()
                is RoomEvent.DataReceived -> {
                    val current = room as? RoomState.Connected ?: return@collect
                    val msg = runCatching { JSONObject(String(event.data)) }.getOrNull() ?: return@collect
                    when (msg.optString("type")) {
                        "on_air_changed" -> room = current.copy(onAir = msg.optBoolean("onAir", current.onAir))
                        "space_updated" -> (state as? ShowState.Ready)?.let { ready ->
                            val tags = msg.optJSONArray("tags")?.let { arr -> List(arr.length()) { arr.getString(it) } } ?: ready.show.tags
                            state = ShowState.Ready(
                                ready.show.copy(
                                    title = msg.optString("title", ready.show.title),
                                    description = if (msg.isNull("description")) null else msg.optString("description", ready.show.description ?: ""),
                                    tags = tags,
                                    musicMood = when {
                                        !msg.has("musicMood") -> ready.show.musicMood
                                        msg.isNull("musicMood") -> null
                                        else -> msg.optString("musicMood")
                                    },
                                )
                            )
                        }
                        "stage_removed" ->
                            if (msg.optString("identity") == current.join.identity) {
                                room = current.copy(notice = "The host moved you back to the audience.")
                            }
                        "reaction" -> {
                            // Our own reaction already floated when we tapped it.
                            val did = msg.optString("did")
                            if (did.isNotEmpty() && did != current.join.identity) {
                                spawnReaction(msg.optString("emoji", "❤️"), did)
                            }
                        }
                    }
                }
                is RoomEvent.Disconnected -> if (room is RoomState.Connected) room = RoomState.Idle
                else -> Unit
            }
        }
    }

    // Poll the stage status while connected: on-air changes reach listeners
    // this way even when data messages do not.
    LaunchedEffect(room is RoomState.Connected) {
        while (room is RoomState.Connected) {
            val current = room as RoomState.Connected
            if (!current.join.anonymous) {
                runCatching { app.api.stageStatus(showId) }.getOrNull()?.let { status ->
                    val latest = room as? RoomState.Connected ?: return@let
                    room = latest.copy(onAir = status.onAir)
                }
            }
            delay(STAGE_POLL_MS)
        }
    }

    DisposableEffect(lkRoom) {
        // Capture this room: by the time it is disposed, lkRoom may already be its replacement.
        val disposing = lkRoom
        onDispose {
            disposing.disconnect()
            disposing.release()
        }
    }

    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val current = room
        if (granted && current is RoomState.Connected && !current.micOn) {
            scope.launch {
                lkRoom.localParticipant.setMicrophoneEnabled(true)
                (room as? RoomState.Connected)?.let { room = it.copy(micOn = true) }
            }
        }
    }

    fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    suspend fun connectWith(join: JoinResponse, enableMic: Boolean) {
        val callMode = join.role != "audience"
        if (callMode != roomCallMode) {
            lkRoom.disconnect()
            // The old room is released when the DisposableEffect above re-runs for the new one.
            lkRoom = createRoom(context, callMode)
            roomCallMode = callMode
        }
        lkRoom.connect(join.wsUrl, join.token, connectOptionsFor(join))
        val micOn = enableMic && hasMicPermission()
        if (micOn) lkRoom.localParticipant.setMicrophoneEnabled(true)
        val previous = room as? RoomState.Connected
        room = RoomState.Connected(
            join = join,
            micOn = micOn,
            onAir = previous?.onAir ?: ((state as? ShowState.Ready)?.show?.isLive ?: false),
        )
        refreshMembers()
    }

    fun joinShow() {
        room = RoomState.Joining
        scope.launch {
            try {
                val join = app.api.join(showId)
                val onStage = join.role != "audience"
                if (onStage && !hasMicPermission()) micPermission.launch(Manifest.permission.RECORD_AUDIO)
                connectWith(join, enableMic = onStage)
            } catch (e: ApiException) {
                room = RoomState.Failed(e.message ?: e.code)
            } catch (e: Exception) {
                room = RoomState.Failed(e.message ?: "Could not connect to the room.")
            }
        }
    }

    fun leave() {
        lkRoom.disconnect()
        room = RoomState.Idle
    }

    fun toggleMic() {
        val current = room as? RoomState.Connected ?: return
        if (!current.micOn && !hasMicPermission()) {
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        scope.launch {
            lkRoom.localParticipant.setMicrophoneEnabled(!current.micOn)
            (room as? RoomState.Connected)?.let { room = it.copy(micOn = !current.micOn) }
        }
    }

    /** Audience: ask to speak. Everyone sees the `hand` participant attribute; the host gets a list. */
    fun toggleHand() {
        val current = room as? RoomState.Connected ?: return
        if (current.join.anonymous || current.join.role != "audience") return
        val next = !current.handRaised
        room = current.copy(handRaised = next)
        lkRoom.localParticipant.updateAttributes(mapOf("hand" to if (next) "1" else ""))
        Diagnostics.event("hand", if (next) "raised" else "lowered")
    }

    /** Host: invite an audience member to the stage. */
    fun invite(identity: String) {
        val current = room as? RoomState.Connected ?: return
        room = current.copy(invited = current.invited + identity, notice = null)
        scope.launch {
            try {
                app.api.inviteToStage(showId, identity)
            } catch (e: Exception) {
                (room as? RoomState.Connected)?.let {
                    room = it.copy(invited = it.invited - identity, notice = e.message ?: "Could not send the invite.")
                }
            }
        }
    }

    /** Step down from the stage, reconnecting with an audience token. */
    fun stage(action: String) {
        val current = room as? RoomState.Connected ?: return
        room = current.copy(stageBusy = true, notice = null)
        scope.launch {
            try {
                val result = app.api.stageAction(showId, action)
                val token = result.token
                val wsUrl = result.wsUrl
                if (token != null && wsUrl != null) {
                    val role = result.role ?: "audience"
                    val goingOnStage = role != "audience"
                    if (goingOnStage && !hasMicPermission()) micPermission.launch(Manifest.permission.RECORD_AUDIO)
                    lkRoom.disconnect()
                    connectWith(current.join.copy(token = token, wsUrl = wsUrl, role = role), enableMic = goingOnStage)
                    (room as? RoomState.Connected)?.let {
                        room = it.copy(
                            stageBusy = false,
                            notice = if (goingOnStage) "You're on stage." else null,
                        )
                    }
                } else {
                    (room as? RoomState.Connected)?.let { room = it.copy(stageBusy = false) }
                }
            } catch (e: Exception) {
                (room as? RoomState.Connected)?.let {
                    room = it.copy(stageBusy = false, notice = e.message ?: "Stage action failed.")
                }
            }
        }
    }

    /** Host only. Flips the show on or off air; the server opens or closes the audience's audio. */
    fun setOnAir(onAir: Boolean) {
        val current = room as? RoomState.Connected ?: return
        room = current.copy(stageBusy = true, notice = null)
        scope.launch {
            try {
                val updated = app.api.setOnAir(showId, onAir)
                state = ShowState.Ready(updated)
                (room as? RoomState.Connected)?.let {
                    room = it.copy(onAir = updated.isLive, stageBusy = false, notice = if (updated.isLive) "You're on air. Listeners can hear the stage now." else "Off air. The recording has stopped.")
                }
            } catch (e: Exception) {
                (room as? RoomState.Connected)?.let { room = it.copy(stageBusy = false, notice = e.message ?: "Could not change on-air state.") }
            }
        }
    }

    /** Host only. Rename the show or set a description from inside the room. */
    fun saveDetails(title: String, description: String) {
        scope.launch {
            try {
                state = ShowState.Ready(app.api.updateShow(showId, title = title.trim(), description = description.trim()))
                editing = false
            } catch (e: Exception) {
                (room as? RoomState.Connected)?.let { room = it.copy(notice = e.message ?: "Could not save show details.") }
                editing = false
            }
        }
    }

    fun react(emoji: String) {
        val current = room as? RoomState.Connected ?: return
        spawnReaction(emoji, current.join.identity)
        scope.launch { runCatching { app.api.react(showId, emoji) } }
    }

    LaunchedEffect(state) {
        if (autoJoin && !autoJoined && state is ShowState.Ready && room == RoomState.Idle) {
            autoJoined = true
            joinShow()
        }
    }

    val isHost = (room as? RoomState.Connected)?.join?.role == "host"
    val isHostOfShow = isHost || ((state as? ShowState.Ready)?.show?.host?.did != null && me?.did == (state as? ShowState.Ready)?.show?.host?.did)
    // Audience leaves quietly; the stage is warned when they are the last one and leaving ends the show.
    val connectedRoom = room as? RoomState.Connected
    val selfOnStage = connectedRoom != null && connectedRoom.join.role != "audience"
    val lastOnStage = connectedRoom != null && connectedRoom.onAir && selfOnStage && connectedRoom.members.count { it.onStage } <= 1

    if (editing) {
        val show = (state as? ShowState.Ready)?.show
        if (show != null) {
            ShowDetailsDialog(
                title = show.title,
                description = show.description ?: "",
                onSave = ::saveDetails,
                onDismiss = { editing = false },
            )
        }
    }

    var confirmLeave by remember { mutableStateOf(false) }
    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text("Leave the show?") },
            text = {
                Text(
                    when {
                        !selfOnStage -> "You'll stop listening and leave the room."
                        lastOnStage -> "You're the last one on stage. Leaving will take the show off air."
                        else -> "You'll leave the studio. The show stays open and you can come back from your shows list."
                    }
                )
            },
            confirmButton = {
                TextButton(onClick = { confirmLeave = false; leave(); onBack() }) { Text("Leave", color = RabbleColors.Live) }
            },
            dismissButton = { TextButton(onClick = { confirmLeave = false }) { Text("Stay") } },
        )
    }

    Scaffold(
        containerColor = RabbleColors.Bg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = RabbleColors.Bg),
                actions = {
                    if (isHost && connectedRoom?.onAir != true) TextButton(onClick = { editing = true }) { Text("Edit") }
                    FeedbackAction(app.api, showId)
                },
                navigationIcon = {
                    IconButton(onClick = { if (room is RoomState.Connected) confirmLeave = true else onBack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                title = { Text((state as? ShowState.Ready)?.show?.title ?: "Show", maxLines = 1, overflow = TextOverflow.Ellipsis) },
            )
        },
        bottomBar = {
            // Pinned: reactions are always one tap away, and leaving asks first.
            (room as? RoomState.Connected)?.let { c ->
                ReactionBar(
                    onReact = ::react,
                    onLeave = { confirmLeave = true },
                    handRaised = if (!c.join.anonymous && c.join.role == "audience") c.handRaised else null,
                    onToggleHand = ::toggleHand,
                )
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding).onGloballyPositioned { overlayOrigin = it.positionInRoot() }) {
            when (val s = state) {
                ShowState.Loading -> Loading()
                is ShowState.Failed -> ErrorPanel(s.message) { reload++ }
                is ShowState.Ready -> {
                    val connected = room as? RoomState.Connected
                    val replay = s.show.replay
                    val showReplay = replay != null && connected == null && !(connected?.onAir ?: s.show.isLive)
                    // Top box: title, host, on-air state and the stage.
                    val topBox: @Composable () -> Unit = {
                        ShowHeader(
                            s.show,
                            onAir = connected?.onAir ?: s.show.isLive,
                            room = connected,
                            avatarCentres = avatarCentres,
                            baseUrl = app.baseUrl,
                            isHost = isHostOfShow,
                            moodBusy = moodBusy,
                            onMusicPick = ::setMusicMood,
                        )
                        if (showReplay && replay != null) {
                            // Off air with a recording: play it instead of opening an empty stage.
                            ReplayPanel(show = s.show, replay = replay, audioUrl = app.api.absolute(replay.audioUrl))
                            if (room is RoomState.Failed) Text((room as RoomState.Failed).message, color = RabbleColors.Live)
                            if (isHostOfShow) {
                                OutlinedButton(onClick = ::joinShow, enabled = room != RoomState.Joining, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                                    Text(if (room == RoomState.Joining) "Opening…" else "Open the studio")
                                }
                            }
                        }
                        if (!showReplay) RoomPanel(
                            show = s.show,
                            room = room,
                            signedIn = signedIn,
                            isHost = isHostOfShow,
                            reminded = reminded,
                            remindBusy = remindBusy,
                            onToggleRemind = ::toggleRemind,
                            hostFollowing = hostFollowing,
                            hostFollowBusy = hostFollowBusy,
                            onToggleHostFollow = { toggleHostFollow(s.show.host.did) },
                            showFollowing = showFollowing,
                            showFollowBusy = showFollowBusy,
                            onToggleShowFollow = { toggleShowFollow(s.show.id) },
                            onJoin = ::joinShow,
                            onToggleMic = ::toggleMic,
                            onStepDown = { stage("leave") },
                            onToggleOnAir = { setOnAir(!(connected?.onAir ?: false)) },
                            onLogin = onLogin,
                        )
                    }
                    // Below: who is listening.
                    val bottom: @Composable () -> Unit = {
                        if (connected != null) {
                            if (isHostOfShow) RaisedHandsPanel(connected, onInvite = ::invite)
                            AudiencePanel(connected, avatarCentres)
                        } else if (isWideScreen()) {
                            Card {
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text("THE ROOM", style = MaterialTheme.typography.labelSmall, color = RabbleColors.TextSecondary, fontWeight = FontWeight.SemiBold)
                                    Text(
                                        if (room is RoomState.Joining) "Connecting…" else "Join to see who's on stage and in the audience, and to send reactions.",
                                        color = RabbleColors.TextSecondary,
                                    )
                                }
                            }
                        }
                    }
                    if (isWideScreen()) {
                        // Unfolded: stage, music and controls on the left, the audience on the right.
                        Row(
                            Modifier.fillMaxSize().widthIn(max = ContentMaxWidth).align(Alignment.TopCenter).padding(horizontal = 24.dp),
                            horizontalArrangement = Arrangement.spacedBy(24.dp),
                        ) {
                            Column(
                                Modifier.weight(1f).fillMaxHeight().verticalScroll(rememberScrollState()),
                                verticalArrangement = Arrangement.spacedBy(16.dp),
                            ) { topBox(); Spacer(Modifier.height(24.dp)) }
                            Column(
                                Modifier.weight(1f).fillMaxHeight().verticalScroll(rememberScrollState()),
                                verticalArrangement = Arrangement.spacedBy(16.dp),
                            ) { bottom(); Spacer(Modifier.height(24.dp)) }
                        }
                    } else {
                        Column(
                            Modifier
                                .fillMaxSize()
                                .padding(horizontal = 16.dp)
                                .verticalScroll(rememberScrollState()),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            topBox()
                            bottom()
                            Spacer(Modifier.height(24.dp))
                        }
                    }
                }
            }
            // Reactions float above everything, including the scrolled content.
            Box(Modifier.fillMaxSize().zIndex(1f)) {
                floating.forEach { FloatingReaction(it, overlayOrigin) }
            }
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun ShowHeader(
    show: Show,
    onAir: Boolean,
    room: RoomState.Connected?,
    avatarCentres: MutableMap<String, Offset>,
    baseUrl: String,
    isHost: Boolean,
    moodBusy: Boolean,
    onMusicPick: (String?) -> Unit,
) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (onAir) LiveBadge() else Pill(if (show.status == "active" || show.status == "live") "Off air" else show.status.replaceFirstChar { it.uppercase() })
                Spacer(Modifier.weight(1f))
                Text("${room?.let { it.members.count { m -> !m.onStage } + it.anonymousListeners } ?: show.listenerCount} listening", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
            }
            Text(show.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                HostAvatar(show.host, 28)
                Spacer(Modifier.width(8.dp))
                Text(show.host.displayName ?: "@${show.host.handle}", color = RabbleColors.TextSecondary)
            }
            show.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = RabbleColors.Text)
            }
            if (show.tags.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { show.tags.forEach { Pill(it) } }

            // The stage lives in the top box. Empty seats are drawn as placeholders.
            // Music shows up on stage like any other guest: visible to everyone once
            // a mood is set, and to the host beforehand too so there's a tile to tap
            // to pick one.
            Text("ON STAGE", style = MaterialTheme.typography.labelSmall, color = RabbleColors.TextSecondary, fontWeight = FontWeight.SemiBold)
            val stage = room?.members?.filter { it.onStage } ?: emptyList()
            val musicTile: (@Composable () -> Unit)? = room?.let { r ->
                if (show.musicMood != null || (isHost && !r.onAir)) {
                    {
                        MusicTile(
                            baseUrl = baseUrl,
                            spaceId = show.id,
                            moodId = show.musicMood,
                            active = show.musicMood != null && (!r.onAir || !r.remoteAudio),
                            canPick = isHost && !r.onAir,
                            busy = moodBusy,
                            onPick = onMusicPick,
                        )
                    }
                } else null
            }
            if (stage.isEmpty() && musicTile == null) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    repeat(3) { PlaceholderSeat() }
                }
                Text(
                    if (room == null) "Join to see who's on stage." else "No one on stage yet.",
                    color = RabbleColors.TextTertiary,
                    style = MaterialTheme.typography.labelSmall,
                )
            } else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    musicTile?.invoke()
                    stage.forEach { m -> MemberTile(m, large = true, onAvatarCentre = { c -> avatarCentres[m.identity] = c }) }
                }
            }
        }
    }
}

/** An empty seat on the stage: a faint avatar-sized circle. */
@Composable
private fun PlaceholderSeat() {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(80.dp)) {
        Box(
            Modifier
                .size(64.dp)
                .clip(CircleShape)
                .background(RabbleColors.SurfaceRaised.copy(alpha = 0.6f))
                .border(1.dp, RabbleColors.TextTertiary.copy(alpha = 0.6f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Text("👤", fontSize = 22.sp, modifier = Modifier.alpha(0.35f)) }
        Spacer(Modifier.height(4.dp))
        Text("Open seat", style = MaterialTheme.typography.labelSmall, color = RabbleColors.TextTertiary)
    }
}

@Composable
private fun RoomPanel(
    show: Show,
    room: RoomState,
    signedIn: Boolean,
    isHost: Boolean,
    reminded: Boolean,
    remindBusy: Boolean,
    onToggleRemind: () -> Unit,
    hostFollowing: Boolean,
    hostFollowBusy: Boolean,
    onToggleHostFollow: () -> Unit,
    showFollowing: Boolean,
    showFollowBusy: Boolean,
    onToggleShowFollow: () -> Unit,
    onJoin: () -> Unit,
    onToggleMic: () -> Unit,
    onStepDown: () -> Unit,
    onToggleOnAir: () -> Unit,
    onLogin: () -> Unit,
) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when (room) {
                RoomState.Idle, is RoomState.Failed -> {
                    if (room is RoomState.Failed) {
                        Text(room.message, color = RabbleColors.Live)
                    }
                    if (!show.isLive && !isHost) {
                        // Scheduled or just off air: nothing to listen to yet, offer a reminder.
                        val scheduled = show.status == "scheduled"
                        Text(
                            if (scheduled) "This show hasn't started yet" + (show.scheduledAt?.let { " — planned for ${formatWhen(it)}" } ?: "") + "."
                            else "The host is off air right now. Get notified the moment they go live.",
                            color = RabbleColors.TextSecondary,
                        )
                        if (signedIn) {
                            Button(onClick = onToggleRemind, enabled = !remindBusy, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                                Icon(if (reminded) Icons.Filled.NotificationsActive else Icons.Outlined.Notifications, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text(if (remindBusy) "Saving…" else if (reminded) "You'll be notified" else "Notify me")
                            }
                            Text(
                                if (reminded) "We'll notify you when the host goes on air. Tap again to cancel. Checks run about every 15 minutes."
                                else "Get a notification on this phone when the host goes on air.",
                                color = RabbleColors.TextTertiary,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        } else {
                            OutlinedButton(onClick = onLogin, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("Sign in to get notified") }
                        }
                        if (signedIn) {
                            val hostName = show.host.displayName ?: "@${show.host.handle}"
                            OutlinedButton(onClick = onToggleHostFollow, enabled = !hostFollowBusy, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                                Icon(if (hostFollowing) Icons.Filled.NotificationsActive else Icons.Outlined.Notifications, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text(if (hostFollowBusy) "Saving…" else if (hostFollowing) "Following $hostName" else "Follow $hostName")
                            }
                            Text(
                                if (hostFollowing) "We'll tell you whenever $hostName goes on air, on any show. Tap again to stop."
                                else "Get notified whenever $hostName goes on air, on any show, not just this one.",
                                color = RabbleColors.TextTertiary,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        if (signedIn && show.isNamedShow) {
                            OutlinedButton(onClick = onToggleShowFollow, enabled = !showFollowBusy, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                                Icon(if (showFollowing) Icons.Filled.NotificationsActive else Icons.Outlined.Notifications, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text(if (showFollowBusy) "Saving…" else if (showFollowing) "Following ${show.title}" else "Follow ${show.title}")
                            }
                            Text(
                                if (showFollowing) "We'll tell you whenever ${show.title} goes on air. Tap again to stop."
                                else "Get notified whenever ${show.title} goes on air.",
                                color = RabbleColors.TextTertiary,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        if (signedIn && !scheduled) {
                            // Guests the host wants on stage before air can still get in.
                            TextButton(onClick = onJoin, enabled = room != RoomState.Joining) {
                                Text(
                                    if (room == RoomState.Joining) "Opening…" else "Invited to the stage? Enter the studio",
                                    color = RabbleColors.TextTertiary,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    } else if (!signedIn) {
                        Text(
                            "Listen without an account. You count toward the listener total but " +
                                "stay invisible; sign in with Bluesky to take the stage.",
                            color = RabbleColors.TextSecondary,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = onJoin, modifier = Modifier.weight(1f).height(48.dp)) { Text("Listen") }
                            OutlinedButton(onClick = onLogin, modifier = Modifier.weight(1f).height(48.dp)) { Text("Sign in") }
                        }
                    } else {
                        Text(
                            if (show.isLive) "The show is on air. Joining puts you in the audience." else "The host is off air. You can join and wait in the studio; audio starts when they go on air.",
                            color = RabbleColors.TextSecondary,
                        )
                        Button(onClick = onJoin, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("Join") }
                    }
                }
                RoomState.Joining -> Text("Connecting…", color = RabbleColors.TextSecondary)
                is RoomState.Connected -> {
                    val onStage = room.join.role != "audience"
                    val status = when {
                        room.join.anonymous -> "Listening anonymously"
                        room.join.role == "host" -> "You're hosting"
                        onStage -> "You're on stage"
                        else -> "You're in the audience"
                    }
                    Text(status, color = RabbleColors.Success, fontWeight = FontWeight.SemiBold)
                    if (!room.onAir) {
                        Text(
                            when {
                                room.join.role == "host" -> "Off air: only the stage can hear each other. Invite co-hosts from the web, name the show with Edit, then go on air to broadcast and record."
                                onStage -> "Off air: only the stage can hear each other right now."
                                else -> "Off air: you'll hear audio as soon as the host goes on air."
                            },
                            color = RabbleColors.TextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    room.notice?.let { Text(it, color = RabbleColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
                    if (room.join.role == "host") {
                        Button(
                            onClick = onToggleOnAir,
                            enabled = !room.stageBusy,
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (room.onAir) RabbleColors.SurfaceRaised else RabbleColors.Live,
                                contentColor = RabbleColors.Text,
                            ),
                        ) {
                            Text(
                                when {
                                    room.stageBusy -> "Working…"
                                    room.onAir -> "Go off air"
                                    else -> "Go on air"
                                },
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                    if (onStage) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = onToggleMic, modifier = Modifier.weight(1f).height(48.dp)) {
                                Text(if (room.micOn) "Mute mic" else "Unmute mic")
                            }
                            if (room.join.role == "speaker") {
                                OutlinedButton(onClick = onStepDown, enabled = !room.stageBusy, modifier = Modifier.weight(1f).height(48.dp)) {
                                    Text("Step down")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Host only: audience members asking to speak, each with an invite button. */
@Composable
private fun RaisedHandsPanel(room: RoomState.Connected, onInvite: (String) -> Unit) {
    val hands = room.members.filter { !it.onStage && it.handRaised }
    if (hands.isEmpty()) return
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("RAISED HANDS · ${hands.size}", style = MaterialTheme.typography.labelSmall, color = RabbleColors.Accent2Dark, fontWeight = FontWeight.SemiBold)
            hands.forEach { m ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Avatar(name = m.name, avatarUrl = m.avatarUrl, size = 36)
                    Text(
                        "✋ " + m.name,
                        color = RabbleColors.Text,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    if (m.identity in room.invited) {
                        Text("Invited", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelMedium)
                    } else {
                        Button(onClick = { onInvite(m.identity) }, modifier = Modifier.height(40.dp)) { Text("Invite") }
                    }
                }
            }
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun AudiencePanel(room: RoomState.Connected, avatarCentres: MutableMap<String, Offset>) {
    val audience = room.members.filter { !it.onStage }
    val listening = audience.size + room.anonymousListeners
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("LISTENING · $listening", style = MaterialTheme.typography.labelSmall, color = RabbleColors.TextSecondary, fontWeight = FontWeight.SemiBold)
            if (audience.isEmpty()) {
                Text(
                    if (room.anonymousListeners > 0) "${room.anonymousListeners} listening without an account." else "Nobody in the audience yet.",
                    color = RabbleColors.TextSecondary,
                )
            } else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    audience.forEach { m -> MemberTile(m, large = false, onAvatarCentre = { c -> avatarCentres[m.identity] = c }) }
                }
                if (room.anonymousListeners > 0) {
                    Text("+${room.anonymousListeners} listening without an account", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun MemberTile(member: RoomMember, large: Boolean, onAvatarCentre: (Offset) -> Unit) {
    val size = if (large) 64 else 44
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width((size + 16).dp)) {
        Box(
            contentAlignment = Alignment.BottomEnd,
            modifier = Modifier.onGloballyPositioned { coords ->
                val pos = coords.positionInRoot()
                onAvatarCentre(Offset(pos.x + coords.size.width / 2f, pos.y))
            },
        ) {
            Avatar(
                name = member.name,
                avatarUrl = member.avatarUrl,
                size = size,
                ring = if (member.speaking) RabbleColors.Success else null,
            )
            if (member.onStage && !member.micOn) {
                Box(
                    Modifier
                        .size(18.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(RabbleColors.Surface),
                    contentAlignment = Alignment.Center,
                ) { Text("🔇", fontSize = 10.sp) }
            }
            if (member.handRaised) {
                Box(
                    Modifier
                        .size(20.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(RabbleColors.Highlight)
                        .border(1.dp, RabbleColors.Border, RoundedCornerShape(10.dp)),
                    contentAlignment = Alignment.Center,
                ) { Text("✋", fontSize = 11.sp) }
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            if (member.isLocal) "You" else member.name,
            style = MaterialTheme.typography.labelSmall,
            color = RabbleColors.Text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
        if (member.isHost) {
            Text("Host", style = MaterialTheme.typography.labelSmall, color = RabbleColors.Accent)
        }
    }
}

/** Pinned to the bottom of the show: one tap to react, and an exit that asks first. */
@Composable
private fun ReactionBar(
    onReact: (String) -> Unit,
    onLeave: () -> Unit,
    /** null hides the hand button (anonymous listeners and the stage). */
    handRaised: Boolean? = null,
    onToggleHand: () -> Unit = {},
) {
    Surface(color = RabbleColors.Surface, tonalElevation = 3.dp) {
        Row(
            Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            REACTIONS.forEach { emoji ->
                Box(
                    Modifier
                        .size(52.dp)
                        .clip(CircleShape)
                        .background(RabbleColors.SurfaceRaised)
                        .clickable { onReact(emoji) },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(emoji, fontSize = 26.sp, color = RabbleColors.Text)
                }
            }
            if (handRaised != null) {
                Box(
                    Modifier
                        .size(52.dp)
                        .clip(CircleShape)
                        .background(if (handRaised) RabbleColors.Highlight else RabbleColors.SurfaceRaised)
                        .border(if (handRaised) 2.dp else 0.dp, if (handRaised) RabbleColors.Border else RabbleColors.SurfaceRaised, CircleShape)
                        .clickable(onClick = onToggleHand)
                        .semantics { contentDescription = if (handRaised) "Lower hand" else "Raise hand to speak" },
                    contentAlignment = Alignment.Center,
                ) {
                    Text("✋", fontSize = 26.sp)
                }
            }
            Box(
                Modifier
                    .size(52.dp)
                    .clip(CircleShape)
                    .background(RabbleColors.Live.copy(alpha = 0.18f))
                    .clickable(onClick = onLeave),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = "Leave the show", tint = RabbleColors.Live)
            }
        }
    }
}

/**
 * An emoji rising from the top of someone's avatar in the people panel and
 * fading out, like the web room. Positions are root px, converted back to
 * dp for the offset modifier.
 */
@Composable
private fun FloatingReaction(item: FloatingEmoji, overlayOrigin: Offset) {
    val progress = remember(item.id) { Animatable(0f) }
    LaunchedEffect(item.id) { progress.animateTo(1f, animationSpec = tween(REACTION_FLOAT_MS, easing = LinearEasing)) }
    val p = progress.value
    // Pop in over the first 8%, hold solid until 60%, then fade out.
    val alpha = when {
        p < 0.08f -> p / 0.08f
        p < 0.6f -> 1f
        else -> (1f - p) / 0.4f
    }
    val scale = when {
        p < 0.15f -> 1.35f - 0.35f * (p / 0.15f)
        else -> 1f - 0.05f * ((p - 0.15f) / 0.85f)
    }
    val drift = (item.jitter * p).dp
    val density = LocalDensity.current
    val chip: @Composable () -> Unit = {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier
                .alpha(alpha)
                .scale(scale)
                .clip(RoundedCornerShape(999.dp))
                .background(RabbleColors.SurfaceRaised)
                .border(1.dp, RabbleColors.TextTertiary, RoundedCornerShape(999.dp))
                .padding(horizontal = 8.dp, vertical = 4.dp),
        ) {
            Text(item.emoji, fontSize = 28.sp)
        }
    }
    // Rise from the sender's avatar when there is room above it; an avatar
    // at the top of the screen (the host's, usually) has none, so those
    // reactions rise from the bottom bar instead and stay visible.
    val origin = item.origin
    val yDp = origin?.let { with(density) { (it.y - overlayOrigin.y).toDp() } }
    if (origin != null && yDp != null && yDp >= 140.dp) {
        val xDp = with(density) { (origin.x - overlayOrigin.x).toDp() }
        val room = (yDp - 60.dp).coerceAtMost(220.dp)
        val rise = room * p
        Box(Modifier.offset(x = xDp - 70.dp + drift, y = yDp - 56.dp - rise)) { chip() }
    } else {
        val rise = (p * 260).dp
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
            Box(Modifier.offset(x = drift, y = (-16).dp - rise)) { chip() }
        }
    }
}

/**
 * Relay credentials from the join response replace the SFU's own ICE list so
 * devices off the homelab LAN can reach the room through Cloudflare TURN. The
 * Android SDK only honours user ICE servers when an rtcConfig is supplied.
 */
private fun connectOptionsFor(join: JoinResponse): ConnectOptions {
    if (join.iceServers.isEmpty()) return ConnectOptions()
    val servers = join.iceServers.map { s ->
        PeerConnection.IceServer.builder(s.urls).apply {
            s.username?.let { setUsername(it) }
            s.credential?.let { setPassword(it) }
        }.createIceServer()
    }
    return ConnectOptions(rtcConfig = PeerConnection.RTCConfiguration(servers))
}

@Composable
private fun ShowDetailsDialog(title: String, description: String, onSave: (String, String) -> Unit, onDismiss: () -> Unit) {
    var newTitle by remember { mutableStateOf(title) }
    var newDescription by remember { mutableStateOf(description) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = RabbleColors.Surface,
        title = { Text("Show details", color = RabbleColors.Text) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = newTitle,
                    onValueChange = { newTitle = it.take(200) },
                    label = { Text("Title") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = newDescription,
                    onValueChange = { newDescription = it.take(2000) },
                    label = { Text("What's the show about?") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Topics (stations) can be set from the web for now.", color = RabbleColors.TextTertiary, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            Button(onClick = { onSave(newTitle, newDescription) }, enabled = newTitle.isNotBlank()) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

private fun formatWhen(iso: String): String = runCatching {
    val t = java.time.OffsetDateTime.parse(iso)
    t.atZoneSameInstant(java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofPattern("EEE d MMM, HH:mm"))
}.getOrDefault(iso)

private fun formatClock(ms: Int): String {
    val total = ms / 1000
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

/**
 * Plays a finished show's recording with the platform MediaPlayer. The
 * audio URL redirects to a short-lived signed object URL; MediaPlayer
 * follows it and streams with range requests, so seeking works.
 */
/**
 * One glyph per mood so a guest's tile is recognizable at a glance; moods
 * without a listed icon (or no mood picked) fall back to MusicNote. Mirrors
 * MOOD_ICONS in src/components/MusicCard.tsx.
 */
private val MOOD_ICONS: Map<String, ImageVector> = mapOf(
    "lounge" to Icons.Filled.LocalBar,
    "upbeat" to Icons.Filled.AutoAwesome,
    "focus" to Icons.Filled.Psychology,
    "groove" to Icons.Filled.Album,
)

/**
 * Pre-show music: plays the mood's tracks locally while [active] (off air,
 * or on air with nobody publishing audio, as in the demo shows). Each phone
 * runs its own player; nothing goes into the room or the recording. Hosts
 * pick the mood here while off air.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun MusicTile(
    baseUrl: String,
    spaceId: String,
    moodId: String?,
    active: Boolean,
    canPick: Boolean,
    busy: Boolean,
    onPick: (String?) -> Unit,
) {
    val mood = Music.mood(moodId)
    val playlist = remember(moodId, spaceId) { mood?.let { Music.playlist(it, spaceId) } ?: emptyList() }
    var index by remember(moodId) { mutableStateOf(0) }
    val track = if (playlist.isEmpty()) null else playlist[index % playlist.size]
    val url = track?.let { Music.url(baseUrl, it) }
    val playing = active && url != null
    var error by remember { mutableStateOf<String?>(null) }
    val player = remember { MediaPlayer() }
    var preparedUrl by remember { mutableStateOf<String?>(null) }
    var menuOpen by remember { mutableStateOf(false) }

    DisposableEffect(Unit) {
        player.setAudioAttributes(
            AudioAttributes.Builder().setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).setUsage(AudioAttributes.USAGE_MEDIA).build()
        )
        onDispose { runCatching { player.release() } }
    }
    LaunchedEffect(playing, url) {
        if (!playing || url == null) {
            runCatching { if (player.isPlaying) player.pause() }
            return@LaunchedEffect
        }
        if (url == preparedUrl) {
            runCatching { player.start() }
            return@LaunchedEffect
        }
        runCatching {
            player.reset()
            preparedUrl = null
            player.setOnPreparedListener { mp ->
                preparedUrl = url
                mp.setVolume(0.35f, 0.35f)
                mp.start()
            }
            player.setOnCompletionListener { if (playlist.isNotEmpty()) index = (index + 1) % playlist.size }
            player.setOnErrorListener { _, what, extra ->
                error = "Could not play music ($what/$extra)."
                true
            }
            player.setDataSource(url)
            player.prepareAsync()
        }.onFailure { error = it.message }
    }

    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(80.dp)) {
        Box(contentAlignment = Alignment.BottomEnd) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(RabbleColors.Ink)
                    .then(if (canPick) Modifier.clickable { menuOpen = true } else Modifier)
                    .semantics { contentDescription = if (canPick) "Music actions" else "Music" },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    mood?.let { MOOD_ICONS[it.id] } ?: Icons.Filled.MusicNote,
                    contentDescription = null,
                    tint = RabbleColors.TextOnInk,
                )
            }
            if (!playing) {
                Box(
                    Modifier
                        .size(18.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(RabbleColors.Surface),
                    contentAlignment = Alignment.Center,
                ) { Text("🔇", fontSize = 10.sp) }
            }
            if (canPick) {
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    Text(
                        "Plays for everyone waiting in the room until you go on air. It is not recorded.",
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp).width(220.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = RabbleColors.TextTertiary,
                    )
                    Music.MOODS.forEach { m ->
                        DropdownMenuItem(
                            text = { Text(m.label) },
                            enabled = !busy,
                            trailingIcon = { if (m.id == mood?.id) Text("✓") },
                            onClick = { onPick(m.id); menuOpen = false },
                        )
                    }
                    if (mood != null) {
                        DropdownMenuItem(
                            text = { Text("Remove from stage", color = RabbleColors.Warning) },
                            enabled = !busy,
                            onClick = { onPick(null); menuOpen = false },
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            track?.guestName ?: "Music",
            style = MaterialTheme.typography.labelSmall,
            color = RabbleColors.Text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
        Text(
            mood?.label ?: "No music",
            style = MaterialTheme.typography.labelSmall,
            color = RabbleColors.TextSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
        error?.let {
            Text(it, color = RabbleColors.Live, style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun ReplayPanel(show: Show, replay: Replay, audioUrl: String) {
    val player = remember(audioUrl) { MediaPlayer() }
    var prepared by remember(audioUrl) { mutableStateOf(false) }
    var playing by remember(audioUrl) { mutableStateOf(false) }
    var durationMs by remember(audioUrl) { mutableStateOf((replay.durationSeconds ?: 0) * 1000) }
    var positionMs by remember(audioUrl) { mutableStateOf(0) }
    var error by remember(audioUrl) { mutableStateOf<String?>(null) }
    var loading by remember(audioUrl) { mutableStateOf(false) }

    DisposableEffect(audioUrl) {
        player.setAudioAttributes(
            AudioAttributes.Builder().setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).setUsage(AudioAttributes.USAGE_MEDIA).build()
        )
        player.setOnPreparedListener { mp ->
            prepared = true
            loading = false
            if (mp.duration > 0) durationMs = mp.duration
            mp.start()
            playing = true
        }
        player.setOnCompletionListener { playing = false; positionMs = durationMs }
        player.setOnErrorListener { _, what, extra ->
            loading = false
            error = "Could not play the recording ($what/$extra)."
            true
        }
        onDispose { runCatching { player.release() } }
    }

    LaunchedEffect(playing) {
        while (playing) {
            positionMs = runCatching { player.currentPosition }.getOrDefault(positionMs)
            delay(500)
        }
    }

    fun toggle() {
        error = null
        if (!prepared) {
            if (loading) return
            loading = true
            runCatching {
                player.reset()
                player.setDataSource(audioUrl)
                player.prepareAsync()
            }.onFailure { loading = false; error = it.message ?: "Could not open the recording." }
            return
        }
        if (playing) { player.pause(); playing = false } else { player.start(); playing = true }
    }

    Card {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Pill("Replay")
                Spacer(Modifier.width(8.dp))
                Text("This show is off air.", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            }
            Text("Listen to the recording of ${show.title}.", color = RabbleColors.Text)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = ::toggle, modifier = Modifier.size(56.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                    Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = if (playing) "Pause" else "Play")
                }
                Column(Modifier.weight(1f)) {
                    Slider(
                        value = if (durationMs > 0) positionMs.toFloat() / durationMs else 0f,
                        onValueChange = { f ->
                            if (prepared && durationMs > 0) {
                                positionMs = (f * durationMs).toInt()
                                player.seekTo(positionMs)
                            }
                        },
                        enabled = prepared && durationMs > 0,
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(formatClock(positionMs), color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
                        Text(if (loading) "Loading…" else formatClock(durationMs), color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            val meta = listOfNotNull(
                replay.startedAt.takeIf { it.isNotBlank() }?.let { "Recorded ${formatWhen(it)}" },
                replay.sizeBytes?.let { "%.1f MB".format(it / 1048576.0) },
            ).joinToString(" · ")
            if (meta.isNotEmpty()) Text(meta, color = RabbleColors.TextTertiary, style = MaterialTheme.typography.labelSmall)
            error?.let { Text(it, color = RabbleColors.Live, style = MaterialTheme.typography.bodySmall) }
        }
    }
}
