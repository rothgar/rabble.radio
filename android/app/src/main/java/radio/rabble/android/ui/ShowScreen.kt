package radio.rabble.android.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import io.livekit.android.ConnectOptions
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import livekit.org.webrtc.PeerConnection
import kotlinx.coroutines.launch
import radio.rabble.android.RabbleApp
import radio.rabble.android.data.ApiException
import radio.rabble.android.data.JoinResponse
import radio.rabble.android.data.Show

sealed interface ShowState {
    data object Loading : ShowState
    data class Ready(val show: Show) : ShowState
    data class Failed(val message: String) : ShowState
}

sealed interface RoomState {
    data object Idle : RoomState
    data object Joining : RoomState
    data class Connected(val join: JoinResponse, val participants: Int, val micOn: Boolean) : RoomState
    data class Failed(val message: String) : RoomState
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShowScreen(app: RabbleApp, showId: String, sessionVersion: Int, onLogin: () -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<ShowState>(ShowState.Loading) }
    var reload by remember { mutableStateOf(0) }
    var room by remember { mutableStateOf<RoomState>(RoomState.Idle) }
    var signedIn by remember { mutableStateOf(false) }
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

    // Keep the participant count fresh while connected.
    LaunchedEffect(lkRoom) {
        lkRoom.events.collect { event ->
            when (event) {
                is RoomEvent.ParticipantConnected,
                is RoomEvent.ParticipantDisconnected,
                is RoomEvent.Connected -> {
                    val current = room
                    if (current is RoomState.Connected) {
                        room = current.copy(participants = lkRoom.remoteParticipants.size + 1)
                    }
                }
                is RoomEvent.Disconnected -> if (room is RoomState.Connected) room = RoomState.Idle
                else -> Unit
            }
        }
    }

    DisposableEffect(lkRoom) {
        onDispose {
            lkRoom.disconnect()
            lkRoom.release()
        }
    }

    fun connect(join: JoinResponse) {
        scope.launch {
            try {
                lkRoom.connect(join.wsUrl, join.token, connectOptionsFor(join))
                val isHost = join.role == "host"
                if (isHost) {
                    lkRoom.localParticipant.setMicrophoneEnabled(true)
                }
                room = RoomState.Connected(join, lkRoom.remoteParticipants.size + 1, micOn = isHost)
            } catch (e: Exception) {
                room = RoomState.Failed(e.message ?: "Could not connect to the room.")
            }
        }
    }

    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val current = room
        if (granted && current is RoomState.Connected && !current.micOn) {
            scope.launch {
                lkRoom.localParticipant.setMicrophoneEnabled(true)
                room = current.copy(micOn = true)
            }
        }
    }

    fun joinShow() {
        room = RoomState.Joining
        scope.launch {
            try {
                val join = app.api.join(showId)
                if (join.role == "host" &&
                    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
                ) {
                    micPermission.launch(Manifest.permission.RECORD_AUDIO)
                }
                connect(join)
            } catch (e: ApiException) {
                room = RoomState.Failed(e.message ?: e.code)
            } catch (e: Exception) {
                room = RoomState.Failed(e.message ?: "Join failed.")
            }
        }
    }

    fun leave() {
        lkRoom.disconnect()
        room = RoomState.Idle
    }

    fun toggleMic() {
        val current = room as? RoomState.Connected ?: return
        if (!current.micOn &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
        ) {
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        scope.launch {
            lkRoom.localParticipant.setMicrophoneEnabled(!current.micOn)
            room = current.copy(micOn = !current.micOn)
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
                title = { Text((state as? ShowState.Ready)?.show?.title ?: "Show", maxLines = 1) },
            )
        },
    ) { padding ->
        when (val s = state) {
            ShowState.Loading -> Loading()
            is ShowState.Failed -> ErrorPanel(s.message) { reload++ }
            is ShowState.Ready -> Column(
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                ShowHeader(s.show)
                RoomPanel(
                    show = s.show,
                    room = room,
                    signedIn = signedIn,
                    onJoin = ::joinShow,
                    onLeave = ::leave,
                    onToggleMic = ::toggleMic,
                    onLogin = onLogin,
                )
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun ShowHeader(show: Show) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (show.isLive) LiveBadge() else Pill(if (show.status == "active") "Off air" else show.status.replaceFirstChar { it.uppercase() })
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
private fun RoomPanel(
    show: Show,
    room: RoomState,
    signedIn: Boolean,
    onJoin: () -> Unit,
    onLeave: () -> Unit,
    onToggleMic: () -> Unit,
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
                    val role = if (room.join.anonymous) "anonymous listener" else room.join.role
                    Text("Connected as $role · ${room.participants} in the room", color = RabbleColors.Success)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (room.join.role != "audience") {
                            OutlinedButton(onClick = onToggleMic, modifier = Modifier.weight(1f).height(48.dp)) {
                                Text(if (room.micOn) "Mute mic" else "Unmute mic")
                            }
                        }
                        Button(onClick = onLeave, modifier = Modifier.weight(1f).height(48.dp)) { Text("Leave") }
                    }
                }
            }
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
