package radio.rabble.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import kotlinx.coroutines.launch
import radio.rabble.android.data.AdminOverviewResponse
import radio.rabble.android.data.AdminUser
import radio.rabble.android.data.Diagnostics
import radio.rabble.android.data.RabbleApi

sealed interface AdminState {
    data object Loading : AdminState
    data class Ready(val data: AdminOverviewResponse) : AdminState
    data class Failed(val message: String) : AdminState
}

/**
 * Platform overview and user moderation, behind the "Admin" button on My
 * shows for ADMIN_DIDS accounts only. Mirrors /admin on the web: overview
 * counts plus ban/unban/kick for each user (GET+POST /api/admin/...).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminScreen(api: RabbleApi, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<AdminState>(AdminState.Loading) }
    var reload by remember { mutableStateOf(0) }
    var pendingDid by remember { mutableStateOf<String?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var confirmBanDid by remember { mutableStateOf<String?>(null) }
    var banReason by remember { mutableStateOf("") }

    LaunchedEffect(Unit) { Diagnostics.screen = "admin" }
    LaunchedEffect(reload) {
        state = try {
            AdminState.Ready(api.adminOverview())
        } catch (e: Exception) {
            AdminState.Failed(e.message ?: "Could not load the admin overview.")
        }
    }

    fun act(did: String, action: String, reason: String? = null) {
        if (pendingDid != null) return
        pendingDid = did
        actionError = null
        scope.launch {
            try {
                api.adminAction(did, action, reason)
                reload++
            } catch (e: Exception) {
                actionError = e.message ?: "Could not complete that action."
            } finally {
                pendingDid = null
            }
        }
    }

    Scaffold(
        containerColor = RabbleColors.Bg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = RabbleColors.Bg),
                title = { Text("Admin", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
                actions = { FeedbackAction(api) },
            )
        },
    ) { padding ->
        when (val s = state) {
            AdminState.Loading -> Loading()
            is AdminState.Failed -> ErrorPanel(s.message) { reload++ }
            is AdminState.Ready -> AdminContent(
                data = s.data,
                padding = padding,
                pendingDid = pendingDid,
                actionError = actionError,
                onKick = { did -> act(did, "kick") },
                onUnban = { did -> act(did, "unban") },
                onRequestBan = { did -> banReason = ""; confirmBanDid = did },
            )
        }
    }

    confirmBanDid?.let { did ->
        AlertDialog(
            onDismissRequest = { confirmBanDid = null },
            title = { Text("Ban this account from the platform?") },
            text = {
                OutlinedTextField(
                    value = banReason,
                    onValueChange = { banReason = it },
                    label = { Text("Reason (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmBanDid = null
                    act(did, "ban", banReason.trim().ifBlank { null })
                }) { Text("Ban", color = RabbleColors.Live) }
            },
            dismissButton = { TextButton(onClick = { confirmBanDid = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun AdminContent(
    data: AdminOverviewResponse,
    padding: PaddingValues,
    pendingDid: String?,
    actionError: String?,
    onKick: (String) -> Unit,
    onUnban: (String) -> Unit,
    onRequestBan: (String) -> Unit,
) {
    Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.TopCenter) {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 150.dp),
            modifier = Modifier.fillMaxSize().widthIn(max = ContentMaxWidth),
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    "Running build ${data.overview.buildId ?: "unknown"}.",
                    color = RabbleColors.TextSecondary,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            item { OverviewStat("Users", data.overview.totalUsers) }
            item { OverviewStat("Banned", data.overview.bannedUsers) }
            item { OverviewStat("Shows", data.overview.totalShows) }
            item { OverviewStat("Live now", data.overview.liveNow) }
            item { OverviewStat("Live shows run", data.overview.totalSessions) }
            item(span = { GridItemSpan(maxLineSpan) }) {
                SectionLabel("USERS · ${data.users.size}")
            }
            if (data.users.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Card { Text("No users yet.", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.bodySmall) }
                }
            }
            if (actionError != null) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Text(actionError, color = RabbleColors.Live, style = MaterialTheme.typography.bodySmall)
                }
            }
            items(data.users, key = { it.did }, span = { GridItemSpan(maxLineSpan) }) { row ->
                AdminUserRow(
                    row = row,
                    pending = pendingDid == row.did,
                    onKick = { onKick(row.did) },
                    onUnban = { onUnban(row.did) },
                    onRequestBan = { onRequestBan(row.did) },
                )
            }
        }
    }
}

@Composable
private fun OverviewStat(label: String, value: Int) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
            Text(value.toString(), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
        }
    }
}

@Composable
private fun AdminUserRow(
    row: AdminUser,
    pending: Boolean,
    onKick: () -> Unit,
    onUnban: () -> Unit,
    onRequestBan: () -> Unit,
) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (row.handle.isNotEmpty()) "@${row.handle}" else row.did,
                        fontWeight = FontWeight.SemiBold,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (row.bannedAt != null) {
                        Spacer(Modifier.width(8.dp))
                        Pill("banned")
                    }
                }
                Text(row.did, color = RabbleColors.TextTertiary, style = MaterialTheme.typography.labelSmall)
                if (row.bannedAt != null && row.banReason != null) {
                    Text("reason: ${row.banReason}", color = RabbleColors.TextSecondary, style = MaterialTheme.typography.labelSmall)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onKick, enabled = !pending, modifier = Modifier.weight(1f).height(44.dp)) {
                    Text(if (pending) "…" else "Kick")
                }
                if (row.bannedAt != null) {
                    OutlinedButton(onClick = onUnban, enabled = !pending, modifier = Modifier.weight(1f).height(44.dp)) {
                        Text(if (pending) "…" else "Unban")
                    }
                } else {
                    OutlinedButton(onClick = onRequestBan, enabled = !pending, modifier = Modifier.weight(1f).height(44.dp)) {
                        Text(if (pending) "…" else "Ban", color = RabbleColors.Live)
                    }
                }
            }
        }
    }
}
