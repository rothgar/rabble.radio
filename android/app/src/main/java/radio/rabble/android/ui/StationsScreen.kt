package radio.rabble.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import radio.rabble.android.data.Me
import radio.rabble.android.data.RabbleApi
import radio.rabble.android.data.SessionStore
import radio.rabble.android.data.Station

sealed interface StationsState {
    data object Loading : StationsState
    data class Ready(val stations: List<Station>) : StationsState
    data class Failed(val message: String) : StationsState
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StationsScreen(
    api: RabbleApi,
    session: SessionStore,
    sessionVersion: Int,
    onOpenStation: (String) -> Unit,
    onLogin: () -> Unit,
    onLogout: () -> Unit,
) {
    var state by remember { mutableStateOf<StationsState>(StationsState.Loading) }
    var me by remember { mutableStateOf<Me?>(null) }
    var reload by remember { mutableStateOf(0) }

    LaunchedEffect(reload, sessionVersion) {
        state = StationsState.Loading
        state = try {
            StationsState.Ready(api.stations())
        } catch (e: Exception) {
            StationsState.Failed(e.message ?: "Could not load stations.")
        }
        me = if (session.hasSession()) runCatching { api.me() }.getOrNull() else null
    }

    Scaffold(
        containerColor = RabbleColors.Bg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = RabbleColors.Bg),
                title = { Text("Rabble Radio", fontWeight = FontWeight.SemiBold) },
                actions = {
                    val user = me
                    if (user != null) {
                        TextButton(onClick = onLogout) { Text("@${user.handle}") }
                    } else {
                        TextButton(onClick = onLogin) { Text("Sign in") }
                    }
                },
            )
        },
    ) { padding ->
        when (val s = state) {
            StationsState.Loading -> Loading()
            is StationsState.Failed -> ErrorPanel(s.message) { reload++ }
            is StationsState.Ready -> StationList(s.stations, padding, onOpenStation)
        }
    }
}

@Composable
private fun StationList(stations: List<Station>, padding: PaddingValues, onOpen: (String) -> Unit) {
    if (stations.isEmpty()) {
        Column(
            Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("No stations yet.", style = MaterialTheme.typography.titleMedium)
            Text(
                "Stations fill up as hosts tag their shows on the web.",
                color = RabbleColors.TextSecondary,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        return
    }
    LazyColumn(
        contentPadding = PaddingValues(
            start = 16.dp, end = 16.dp,
            top = padding.calculateTopPadding() + 8.dp,
            bottom = padding.calculateBottomPadding() + 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item {
            Text("Stations", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("On-air and upcoming shows by station.", color = RabbleColors.TextSecondary)
            Spacer(Modifier.height(4.dp))
        }
        items(stations, key = { it.tag }) { station ->
            Card(Modifier.clickable { onOpen(station.tag) }) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text(station.tag, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        val n = station.shows.size
                        Pill(if (n == 1) "1 show" else "$n shows")
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        HostRow(station.hosts)
                        Spacer(Modifier.width(8.dp))
                        if (station.liveCount > 0) LiveBadge()
                        Spacer(Modifier.weight(1f))
                        val h = station.hosts.size
                        Text(if (h == 1) "1 host" else "$h hosts", color = RabbleColors.TextTertiary, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}
