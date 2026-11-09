package radio.rabble.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import radio.rabble.android.Tags
import radio.rabble.android.data.Diagnostics
import radio.rabble.android.data.Me
import radio.rabble.android.data.RabbleApi
import radio.rabble.android.data.SessionStore
import radio.rabble.android.data.Show
import radio.rabble.android.data.Station

sealed interface HomeState {
    data object Loading : HomeState
    data class Ready(val shows: List<Show>) : HomeState
    data class Failed(val message: String) : HomeState
}

/**
 * The landing screen: every visible show (on air first), the "Start a show"
 * call to action for signed-in users, and the stations to browse by topic.
 * Mirrors /stations on the web.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    api: RabbleApi,
    session: SessionStore,
    sessionVersion: Int,
    onOpenShow: (String) -> Unit,
    onOpenStation: (String) -> Unit,
    onStartedShow: (String) -> Unit,
    onLogin: () -> Unit,
    onOpenMe: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<HomeState>(HomeState.Loading) }
    var me by remember { mutableStateOf<Me?>(null) }
    var reload by remember { mutableStateOf(0) }
    var starting by remember { mutableStateOf(false) }
    var startError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { Diagnostics.screen = "home" }
    LaunchedEffect(reload, sessionVersion) {
        // Keep the current list on screen while it refreshes (after sign-in,
        // say); only the very first load shows the spinner.
        if (state !is HomeState.Ready) state = HomeState.Loading
        // Profile and listing are independent requests; fetch them together.
        val meDeferred = async { if (session.hasSession()) runCatching { api.me() }.getOrNull() else null }
        state = try {
            HomeState.Ready(api.listShows())
        } catch (e: Exception) {
            if (state is HomeState.Ready) state else HomeState.Failed(e.message ?: "Could not load shows.")
        }
        me = meDeferred.await()
    }

    fun startShow() {
        if (starting) return
        starting = true
        startError = null
        scope.launch {
            try {
                val show = api.startShow()
                onStartedShow(show.id)
            } catch (e: Exception) {
                startError = e.message ?: "Could not start a show."
            } finally {
                starting = false
            }
        }
    }

    Scaffold(
        containerColor = RabbleColors.Bg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = RabbleColors.Bg),
                title = { Text("rabble radio", style = MaterialTheme.typography.headlineSmall) },
                actions = {
                    FeedbackAction(api)
                    val user = me
                    if (user != null) {
                        TextButton(onClick = onOpenMe) {
                            Avatar(user.displayName ?: user.handle, user.avatarUrl, 24)
                            Spacer(Modifier.width(8.dp))
                            Text("@${user.handle}")
                        }
                    } else {
                        TextButton(onClick = onLogin) { Text("Sign in") }
                    }
                },
            )
        },
    ) { padding ->
        when (val s = state) {
            HomeState.Loading -> Loading()
            is HomeState.Failed -> ErrorPanel(s.message) { reload++ }
            is HomeState.Ready -> HomeContent(
                shows = s.shows,
                signedIn = me != null,
                starting = starting,
                startError = startError,
                padding = padding,
                onOpenShow = onOpenShow,
                onOpenStation = onOpenStation,
                onStartShow = ::startShow,
                onLogin = onLogin,
            )
        }
    }
}

@Composable
private fun HomeContent(
    shows: List<Show>,
    signedIn: Boolean,
    starting: Boolean,
    startError: String?,
    padding: PaddingValues,
    onOpenShow: (String) -> Unit,
    onOpenStation: (String) -> Unit,
    onStartShow: () -> Unit,
    onLogin: () -> Unit,
) {
    val forYou = shows.filter { it.forYou }.sortedWith(compareByDescending<Show> { it.isLive }.thenByDescending { it.listenerCount })
    val onAir = shows.filter { it.isLive }.sortedByDescending { it.listenerCount * 3 + it.speakerCount * 5 + it.reactionCount }
    val offAir = shows.filterNot { it.isLive }.sortedByDescending { it.totalListeners * 3 + it.likeCount * 4 + it.reactionCount }
    val stations = Tags.CATEGORIES.mapNotNull { tag ->
        val inStation = shows.filter { Tags.primaryTagOf(it.tags) == tag }
        if (inStation.isEmpty()) null else Station(tag, inStation)
    }

    val wide = isWideScreen()
    val gutter = if (wide) 24.dp else 16.dp
    // One column on the cover screen, two (or more) once unfolded; headers span the row.
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 320.dp),
        contentPadding = PaddingValues(
            start = gutter, end = gutter,
            top = padding.calculateTopPadding() + 8.dp,
            bottom = padding.calculateBottomPadding() + 24.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize().widthIn(max = ContentMaxWidth),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column {
                Text("Shows", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("On-air and upcoming shows from Bluesky hosts.", color = RabbleColors.TextSecondary)
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            StartShowCard(signedIn, starting, startError, onStartShow, onLogin)
        }
        if (shows.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("No shows yet.", style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (signedIn) "Start one and invite people to the stage." else "Sign in with Bluesky to start the first one.",
                        color = RabbleColors.TextSecondary,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }
        if (forYou.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column {
                    SectionLabel("FOR YOU")
                    Text("Hosts you follow on Bluesky, and rooms your follows are in.", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                }
            }
            items(forYou, key = { "fy-" + it.id }) { ShowCard(it, onOpenShow) }
        }
        if (onAir.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) { SectionLabel("ON AIR NOW") }
            items(onAir, key = { "live-" + it.id }) { ShowCard(it, onOpenShow) }
        }
        if (offAir.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) { SectionLabel(if (onAir.isEmpty()) "POPULAR SHOWS" else "POPULAR · OFF AIR & UPCOMING") }
            items(offAir, key = { it.id }) { ShowCard(it, onOpenShow) }
        }
        if (stations.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column {
                    Spacer(Modifier.height(8.dp))
                    SectionLabel("STATIONS")
                    Text("Browse shows by topic.", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.bodySmall)
                }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    stations.forEach { station -> StationChip(station) { onOpenStation(station.tag) } }
                }
            }
        }
    }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, style = MaterialTheme.typography.labelSmall, color = RabbleColors.TextSecondary, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun StartShowCard(signedIn: Boolean, starting: Boolean, error: String?, onStart: () -> Unit, onLogin: () -> Unit) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Go live from your phone", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                if (signedIn) "Open a studio, invite people to the stage, then press On air when you're ready. You can name the show once you're in."
                else "Sign in with Bluesky to host a show. Listening never needs an account.",
                color = RabbleColors.TextSecondary,
                style = MaterialTheme.typography.bodySmall,
            )
            if (signedIn) {
                Button(onClick = onStart, enabled = !starting, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                    Text(if (starting) "Starting…" else "Start a show")
                }
            } else {
                OutlinedButton(onClick = onLogin, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("Sign in to start a show") }
            }
            error?.let { Text(it, color = RabbleColors.Live, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun StationChip(station: Station, onClick: () -> Unit) {
    Row(
        Modifier
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Pill("${station.tag} · ${station.shows.size}" + if (station.liveCount > 0) " · on air" else "")
    }
}
