package radio.rabble.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import radio.rabble.android.data.PublicHost
import radio.rabble.android.data.Show

@Composable
fun Loading() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = RabbleColors.Accent)
    }
}

@Composable
fun ErrorPanel(message: String, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Something went wrong", style = MaterialTheme.typography.titleMedium)
        Text(
            message,
            color = RabbleColors.TextSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
        )
        Button(onClick = onRetry) { Text("Retry") }
    }
}

/** Round avatar: the Bluesky picture when there is one, initials otherwise. */
@Composable
fun Avatar(name: String, avatarUrl: String?, size: Int = 36, ring: androidx.compose.ui.graphics.Color? = null) {
    val initials = name.trim().removePrefix("@").take(2).uppercase()
    var base = Modifier
        .size(size.dp)
        .clip(CircleShape)
        .background(RabbleColors.SurfaceRaised)
    if (ring != null) base = base.border(2.dp, ring, CircleShape)
    Box(base, contentAlignment = Alignment.Center) {
        if (avatarUrl != null) {
            AsyncImage(
                model = avatarUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(initials, style = MaterialTheme.typography.labelSmall, color = RabbleColors.Text)
        }
    }
}

@Composable
fun HostAvatar(host: PublicHost, size: Int = 36) {
    Avatar(host.displayName ?: host.handle, host.avatarUrl, size)
}

@Composable
fun LiveBadge() {
    Box(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(RabbleColors.Live.copy(alpha = 0.15f))
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text("ON AIR", color = RabbleColors.Live, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
fun Pill(text: String) {
    Box(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(RabbleColors.SurfaceRaised)
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(text, color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
fun Card(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(RabbleColors.Surface)
            .padding(16.dp)
    ) { content() }
}

@Composable
fun HostRow(hosts: List<PublicHost>) {
    Row(horizontalArrangement = Arrangement.spacedBy((-8).dp), verticalAlignment = Alignment.CenterVertically) {
        hosts.take(3).forEach { HostAvatar(it, 28) }
    }
}

/** One show in a list: host avatar, title, on-air badge, counts and tags. */
@Composable
fun ShowCard(show: Show, onOpen: (String) -> Unit) {
    Card(Modifier.clickable { onOpen(show.id) }) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                HostAvatar(show.host)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(show.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Text("@${show.host.handle}", color = RabbleColors.TextTertiary, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                }
                if (show.isLive) LiveBadge() else if (show.status == "scheduled") Pill("Scheduled")
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("${show.listenerCount} listening", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
                Text("${show.speakerCount} on stage", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
                Text("${show.reactionCount} reactions", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
            }
            if (show.tags.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { show.tags.forEach { Pill(it) } }
            }
        }
    }
}
