package radio.rabble.android.ui

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
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
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import radio.rabble.android.BuildConfig
import radio.rabble.android.data.Diagnostics
import radio.rabble.android.data.JoinedShow
import radio.rabble.android.data.Me
import radio.rabble.android.data.MyShows
import radio.rabble.android.data.RabbleApi
import radio.rabble.android.data.Show

sealed interface MeState {
    data object Loading : MeState
    data class Ready(val me: Me, val shows: MyShows) : MeState
    data class Failed(val message: String) : MeState
}

/**
 * The account screen behind the username in the home top bar. Mirrors /me
 * on the web: profile, start a show, every show the user hosts (each with
 * its shareable landing-page URL and a "new session" action), the shows
 * they joined, and sign out at the bottom.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeScreen(
    api: RabbleApi,
    sessionVersion: Int,
    onOpenShow: (String) -> Unit,
    onStartedShow: (String) -> Unit,
    onLogout: () -> Unit,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var state by remember { mutableStateOf<MeState>(MeState.Loading) }
    var reload by remember { mutableStateOf(0) }
    var startingId by remember { mutableStateOf<String?>(null) }
    var startError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { Diagnostics.screen = "me" }
    LaunchedEffect(reload, sessionVersion) {
        state = MeState.Loading
        state = try {
            val me = async { api.me() }
            val shows = async { api.myShows() }
            val profile = me.await() ?: throw IllegalStateException("Not signed in.")
            MeState.Ready(profile, shows.await())
        } catch (e: Exception) {
            MeState.Failed(e.message ?: "Could not load your shows.")
        }
    }

    /** Reopen [showId] (or the default show when null) and jump into it. */
    fun start(showId: String?) {
        if (startingId != null) return
        startingId = showId ?: ""
        startError = null
        scope.launch {
            try {
                val show = api.startShow(showId)
                onStartedShow(show.id)
            } catch (e: Exception) {
                startError = e.message ?: "Could not start a session."
            } finally {
                startingId = null
            }
        }
    }

    fun share(show: Show) {
        val url = show.shareableUrl.ifEmpty { api.absolute("/show/${show.id}") }
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, show.title)
            putExtra(Intent.EXTRA_TEXT, "${show.title} on Rabble Radio\n$url")
        }
        context.startActivity(Intent.createChooser(send, "Share show"))
    }

    Scaffold(
        containerColor = RabbleColors.Bg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = RabbleColors.Bg),
                title = { Text("My shows", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
                actions = {
                    FeedbackAction(api)
                    TextButton(onClick = onLogout) { Text("Log out", color = RabbleColors.Live) }
                },
            )
        },
    ) { padding ->
        when (val s = state) {
            MeState.Loading -> Loading()
            is MeState.Failed -> ErrorPanel(s.message) { reload++ }
            is MeState.Ready -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.TopCenter) {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 320.dp),
                    modifier = Modifier.fillMaxSize().widthIn(max = ContentMaxWidth),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        ProfileHeader(
                            me = s.me,
                            starting = startingId == "",
                            error = startError,
                            onStart = { start(null) },
                        )
                    }
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text(
                            "SHOWS YOU HOST · ${s.shows.hosted.size}",
                            style = MaterialTheme.typography.labelSmall,
                            color = RabbleColors.TextSecondary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    if (s.shows.hosted.isEmpty()) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Card {
                                Text(
                                    "You haven't hosted a show yet. Start one and it gets its own page you can share.",
                                    color = RabbleColors.TextSecondary,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                    items(s.shows.hosted, key = { "hosted-" + it.id }) { show ->
                        HostedShowCard(
                            show = show,
                            starting = startingId == show.id,
                            onOpen = { onOpenShow(show.id) },
                            onStart = { start(show.id) },
                            onShare = { share(show) },
                        )
                    }
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text(
                            "SHOWS YOU JOINED · ${s.shows.joined.size}",
                            style = MaterialTheme.typography.labelSmall,
                            color = RabbleColors.TextSecondary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    if (s.shows.joined.isEmpty()) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Card {
                                Text(
                                    "Shows you listen to or speak on will show up here.",
                                    color = RabbleColors.TextSecondary,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                    items(s.shows.joined, key = { "joined-" + it.sessionId }) { joined ->
                        JoinedShowCard(joined) { onOpenShow(joined.showId) }
                    }
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                            Text("Log out", color = RabbleColors.Live)
                        }
                    }
                    if (BuildConfig.DEBUG) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            OutlinedButton(
                                onClick = { throw RuntimeException("Debug: forced crash from Me screen") },
                                modifier = Modifier.fillMaxWidth().height(44.dp),
                            ) {
                                Text("Debug: force a crash", color = RabbleColors.TextTertiary)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileHeader(me: Me, starting: Boolean, error: String?, onStart: () -> Unit) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(me.displayName ?: me.handle, me.avatarUrl, 48)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        me.displayName?.takeIf { it.isNotBlank() } ?: "@${me.handle}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                    )
                    Text("@${me.handle}", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                }
            }
            Text(
                "Start a show to open your studio. Sessions land in your default show unless you start one from a different show below.",
                color = RabbleColors.TextSecondary,
                style = MaterialTheme.typography.bodySmall,
            )
            Button(onClick = onStart, enabled = !starting, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text(if (starting) "Starting…" else "Start a show")
            }
            error?.let { Text(it, color = RabbleColors.Live, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

/** One hosted show: status, lifetime numbers, share link, new session. */
@Composable
private fun HostedShowCard(show: Show, starting: Boolean, onOpen: () -> Unit, onStart: () -> Unit, onShare: () -> Unit) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(show.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2)
                    Text(
                        "${show.sessionCount} ${if (show.sessionCount == 1) "session" else "sessions"} · " +
                            "${show.totalListeners} ${if (show.totalListeners == 1) "listener" else "listeners"} · " +
                            "${show.likeCount} ${if (show.likeCount == 1) "like" else "likes"}",
                        color = RabbleColors.TextSecondary,
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
                Spacer(Modifier.width(8.dp))
                when {
                    show.isLive -> LiveBadge()
                    show.status == "scheduled" -> Pill("Scheduled")
                    show.replay != null -> Pill("Replay")
                    show.status == "active" -> Pill("Off air")
                    else -> Pill("Ended")
                }
            }
            if (show.tags.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { show.tags.forEach { Pill(it) } }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    show.shareableUrl.ifEmpty { "/show/${show.id}" },
                    color = RabbleColors.Accent,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onShare) { Icon(Icons.Default.Share, contentDescription = "Share show link", tint = RabbleColors.Accent) }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (show.isLive) {
                    Button(onClick = onOpen, modifier = Modifier.weight(1f).height(44.dp)) { Text("Back to the room") }
                } else {
                    Button(onClick = onStart, enabled = !starting, modifier = Modifier.weight(1f).height(44.dp)) {
                        Text(if (starting) "Starting…" else "Start a session")
                    }
                    OutlinedButton(onClick = onOpen, modifier = Modifier.weight(1f).height(44.dp)) { Text("Show page") }
                }
            }
        }
    }
}

@Composable
private fun JoinedShowCard(joined: JoinedShow, onOpen: () -> Unit) {
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            HostAvatar(joined.host)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(joined.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text(
                    "@${joined.host.handle} · " + (if (joined.role == "audience") "listened" else "on stage"),
                    color = RabbleColors.TextTertiary,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                )
            }
            if (joined.isLive) LiveBadge()
            Spacer(Modifier.width(8.dp))
            TextButton(onClick = onOpen) { Text("Open") }
        }
    }
}
