package radio.rabble.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import radio.rabble.android.data.RabbleApi
import radio.rabble.android.data.Show

sealed interface StationState {
    data object Loading : StationState
    data class Ready(val shows: List<Show>) : StationState
    data class Failed(val message: String) : StationState
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StationScreen(api: RabbleApi, tag: String, onOpenShow: (String) -> Unit, onBack: () -> Unit) {
    var state by remember { mutableStateOf<StationState>(StationState.Loading) }
    var reload by remember { mutableStateOf(0) }

    LaunchedEffect(tag, reload) {
        state = StationState.Loading
        state = try {
            StationState.Ready(api.showsForStation(tag))
        } catch (e: Exception) {
            StationState.Failed(e.message ?: "Could not load this station.")
        }
    }

    Scaffold(
        containerColor = RabbleColors.Bg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = RabbleColors.Bg),
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                title = { Text(tag, fontWeight = FontWeight.SemiBold) },
            )
        },
    ) { padding ->
        when (val s = state) {
            StationState.Loading -> Loading()
            is StationState.Failed -> ErrorPanel(s.message) { reload++ }
            is StationState.Ready -> ShowList(s.shows, tag, padding, onOpenShow)
        }
    }
}

@Composable
private fun ShowList(shows: List<Show>, tag: String, padding: PaddingValues, onOpen: (String) -> Unit) {
    if (shows.isEmpty()) {
        Column(
            Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("No shows in this station yet.", style = MaterialTheme.typography.titleMedium)
            Text("When a host tags a show with $tag, it will appear here.", color = RabbleColors.TextSecondary, modifier = Modifier.padding(top = 8.dp))
        }
        return
    }
    val gutter = if (isWideScreen()) 24.dp else 16.dp
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 320.dp),
            contentPadding = PaddingValues(
                start = gutter, end = gutter,
                top = padding.calculateTopPadding() + 8.dp,
                bottom = padding.calculateBottomPadding() + 16.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.fillMaxSize().widthIn(max = ContentMaxWidth),
        ) {
            items(shows, key = { it.id }) { show -> ShowCard(show, onOpen) }
        }
    }
}
