package radio.rabble.android.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.material3.Button
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import io.livekit.android.ConnectOptions
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
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
)

data class FloatingEmoji(val id: Long, val emoji: String)

sealed interface RoomState {
    data object Idle : RoomState
    data object Joining : RoomState
    data class Connected(
        val join: JoinResponse,
        val members: List<RoomMember> = emptyList(),
        val anonymousListeners: Int = 0,
        val micOn: Boolean = false,
        val onAir: Boolean = false,
        val invitePending: Boolean = false,
        val stageBusy: Boolean = false,
        val notice: String? = null,
    ) : RoomState
    data class Failed(val message: String) : RoomState
}

private val REACTIONS = listOf("👍", "❤️", "😂", "🎉", "👏")
private const val STAGE_POLL_MS = 4000L

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShowScreen(app: RabbleApp, showId: String, sessionVersion: Int, onLogin: () -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<ShowState>(ShowState.Loading) }
    var reload by remember { mutableStateOf(0) }
    var room by remember { mutableStateOf<RoomState>(RoomState.Idle) }
    var signedIn by remember { mutableStateOf(false) }
    var profiles by remember { mutableStateOf<Map<String, UserSummary>>(emptyMap()) }
    var floating by remember { mutableStateOf<List<FloatingEmoji>>(emptyList()) }
    val lkRoom = remember { LiveKit.create(context.applicationContext) }

    LaunchedEffect(showId, reload, sessionVersion) {
        state = ShowState.Loading
        signedIn = app.session.hasSession()
        state = try {
            ShowState.Ready(app.api.show(showId))
        } catch (e: Exception) {
            ShowState.Failed(e.message ?: "Could not load this show.")
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
            )
        }.sortedWith(compareByDescending<RoomMember> { it.isHost }.thenByDescending { it.onStage }.thenBy { it.name })
        room = current.copy(members = members, anonymousListeners = anonymous)
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
                is RoomEvent.ParticipantPermissionsChanged -> refreshMembers()
                is RoomEvent.DataReceived -> {
                    val current = room as? RoomState.Connected ?: return@collect
                    val msg = runCatching { JSONObject(String(event.data)) }.getOrNull() ?: return@collect
                    when (msg.optString("type")) {
                        "stage_invite" ->
                            if (msg.optString("targetIdentity") == current.join.identity) {
                                room = current.copy(invitePending = true)
                            }
                        "on_air_changed" -> room = current.copy(onAir = msg.optBoolean("onAir", current.onAir))
                        "stage_removed" ->
                            if (msg.optString("identity") == current.join.identity) {
                                room = current.copy(notice = "The host moved you back to the audience.")
                            }
                    }
                }
                is RoomEvent.Disconnected -> if (room is RoomState.Connected) room = RoomState.Idle
                else -> Unit
            }
        }
    }

    // Poll the stage status while connected: invites and on-air changes reach
    // listeners this way even when data messages do not.
    LaunchedEffect(room is RoomState.Connected) {
        while (room is RoomState.Connected) {
            val current = room as RoomState.Connected
            if (!current.join.anonymous) {
                runCatching { app.api.stageStatus(showId) }.getOrNull()?.let { status ->
                    val latest = room as? RoomState.Connected ?: return@let
                    room = latest.copy(
                        onAir = status.onAir,
                        invitePending = latest.invitePending || (status.pendingInviteFrom != null && !status.onStage),
                    )
                }
            }
            delay(STAGE_POLL_MS)
        }
    }

    DisposableEffect(lkRoom) {
        onDispose {
            lkRoom.disconnect()
            lkRoom.release()
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

    /** accept = take the stage; leave = decline an invite or step down. Both reconnect with the new token. */
    fun stage(action: String) {
        val current = room as? RoomState.Connected ?: return
        room = current.copy(stageBusy = true, notice = null)
        scope.launch {
            try {
                val result = app.api.stageAction(showId, action)
                val token = result.token
                val wsUrl = result.wsUrl
                if (token != null && wsUrl != null) {
                    val role = result.role ?: if (action == "accept") "speaker" else "audience"
                    val goingOnStage = role != "audience"
                    if (goingOnStage && !hasMicPermission()) micPermission.launch(Manifest.permission.RECORD_AUDIO)
                    lkRoom.disconnect()
                    connectWith(current.join.copy(token = token, wsUrl = wsUrl, role = role), enableMic = goingOnStage)
                    (room as? RoomState.Connected)?.let {
                        room = it.copy(
                            invitePending = false,
                            stageBusy = false,
                            notice = if (goingOnStage) "You're on stage." else null,
                        )
                    }
                } else {
                    (room as? RoomState.Connected)?.let { room = it.copy(invitePending = false, stageBusy = false) }
                }
            } catch (e: Exception) {
                (room as? RoomState.Connected)?.let {
                    room = it.copy(stageBusy = false, invitePending = false, notice = e.message ?: "Stage action failed.")
                }
            }
        }
    }

    fun react(emoji: String) {
        val id = System.nanoTime()
        floating = floating + FloatingEmoji(id, emoji)
        scope.launch {
            runCatching { app.api.react(showId) }
            delay(1400)
            floating = floating.filterNot { it.id == id }
        }
    }

    Scaffold(
        containerColor = RabbleColors.Bg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = RabbleColors.Bg),
                navigationIcon = {
                    IconButton(onClick = { leave(); onBack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                title = { Text((state as? ShowState.Ready)?.show?.title ?: "Show", maxLines = 1, overflow = TextOverflow.Ellipsis) },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (val s = state) {
                ShowState.Loading -> Loading()
                is ShowState.Failed -> ErrorPanel(s.message) { reload++ }
                is ShowState.Ready -> Column(
                    Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    val connected = room as? RoomState.Connected
                    ShowHeader(s.show, onAir = connected?.onAir ?: s.show.isLive)
                    if (connected != null && connected.invitePending) {
                        InviteBanner(
                            hostName = s.show.host.displayName ?: "@${s.show.host.handle}",
                            busy = connected.stageBusy,
                            onAccept = { stage("accept") },
                            onDecline = { stage("leave") },
                        )
                    }
                    RoomPanel(
                        show = s.show,
                        room = room,
                        signedIn = signedIn,
                        onJoin = ::joinShow,
                        onLeave = ::leave,
                        onToggleMic = ::toggleMic,
                        onStepDown = { stage("leave") },
                        onLogin = onLogin,
                    )
                    if (connected != null) {
                        PeoplePanel(connected)
                        ReactionBar(onReact = ::react)
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
            floating.forEach { FloatingReaction(it) }
        }
    }
}

@Composable
private fun ShowHeader(show: Show, onAir: Boolean) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (onAir) LiveBadge() else Pill(if (show.status == "active" || show.status == "live") "Off air" else show.status.replaceFirstChar { it.uppercase() })
                Spacer(Modifier.weight(1f))
                Text("${show.listenerCount} listening", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
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
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { show.tags.forEach { Pill(it) } }
        }
    }
}

@Composable
private fun InviteBanner(hostName: String, busy: Boolean, onAccept: () -> Unit, onDecline: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(RabbleColors.Accent.copy(alpha = 0.18f))
            .padding(16.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("$hostName invited you on stage", fontWeight = FontWeight.SemiBold, color = RabbleColors.Text)
            Text("Accepting turns your microphone on so the room can hear you.", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onAccept, enabled = !busy, modifier = Modifier.weight(1f).height(48.dp)) {
                    Text(if (busy) "Joining…" else "Take the stage")
                }
                OutlinedButton(onClick = onDecline, enabled = !busy, modifier = Modifier.weight(1f).height(48.dp)) { Text("Not now") }
            }
        }
    }
}

@Composable
private fun RoomPanel(
    show: Show,
    room: RoomState,
    signedIn: Boolean,
    onJoin: () -> Unit,
    onLeave: () -> Unit,
    onToggleMic: () -> Unit,
    onStepDown: () -> Unit,
    onLogin: () -> Unit,
) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when (room) {
                RoomState.Idle, is RoomState.Failed -> {
                    if (room is RoomState.Failed) {
                        Text(room.message, color = RabbleColors.Live)
                    }
                    if (!signedIn) {
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
                            if (onStage) "Off air: only the stage can hear each other right now."
                            else "Off air: you'll hear audio as soon as the host goes on air.",
                            color = RabbleColors.TextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    room.notice?.let { Text(it, color = RabbleColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (onStage) {
                            OutlinedButton(onClick = onToggleMic, modifier = Modifier.weight(1f).height(48.dp)) {
                                Text(if (room.micOn) "Mute mic" else "Unmute mic")
                            }
                        }
                        if (room.join.role == "speaker") {
                            OutlinedButton(onClick = onStepDown, enabled = !room.stageBusy, modifier = Modifier.weight(1f).height(48.dp)) {
                                Text("Step down")
                            }
                        }
                        Button(onClick = onLeave, modifier = Modifier.weight(1f).height(48.dp)) { Text("Leave") }
                    }
                }
            }
        }
    }
}

@Composable
private fun PeoplePanel(room: RoomState.Connected) {
    val stage = room.members.filter { it.onStage }
    val audience = room.members.filter { !it.onStage }
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("ON STAGE", style = MaterialTheme.typography.labelSmall, color = RabbleColors.TextSecondary, fontWeight = FontWeight.SemiBold)
            if (stage.isEmpty()) {
                Text("No one on stage yet.", color = RabbleColors.TextSecondary)
            } else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    stage.forEach { MemberTile(it, large = true) }
                }
            }
            val listening = audience.size + room.anonymousListeners
            Text("LISTENING · $listening", style = MaterialTheme.typography.labelSmall, color = RabbleColors.TextSecondary, fontWeight = FontWeight.SemiBold)
            if (audience.isEmpty()) {
                Text(
                    if (room.anonymousListeners > 0) "${room.anonymousListeners} listening without an account." else "Nobody in the audience yet.",
                    color = RabbleColors.TextSecondary,
                )
            } else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    audience.forEach { MemberTile(it, large = false) }
                }
                if (room.anonymousListeners > 0) {
                    Text("+${room.anonymousListeners} listening without an account", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun MemberTile(member: RoomMember, large: Boolean) {
    val size = if (large) 64 else 44
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width((size + 16).dp)) {
        Box(contentAlignment = Alignment.BottomEnd) {
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

@Composable
private fun ReactionBar(onReact: (String) -> Unit) {
    Card {
        Row(horizontalArrangement = Arrangement.SpaceEvenly, modifier = Modifier.fillMaxWidth()) {
            REACTIONS.forEach { emoji ->
                TextButton(onClick = { onReact(emoji) }, modifier = Modifier.height(48.dp)) {
                    Text(emoji, fontSize = 24.sp)
                }
            }
        }
    }
}

/** An emoji that drifts up from the bottom of the screen and fades out. */
@Composable
private fun FloatingReaction(item: FloatingEmoji) {
    var started by remember(item.id) { mutableStateOf(false) }
    LaunchedEffect(item.id) { started = true }
    val progress by animateFloatAsState(if (started) 1f else 0f, animationSpec = tween(1300), label = "reaction")
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        Text(
            item.emoji,
            fontSize = 36.sp,
            modifier = Modifier
                .offset(x = (((item.id / 7) % 120) - 60).toInt().dp, y = (-80 - progress * 320).dp)
                .alpha(1f - progress),
        )
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
