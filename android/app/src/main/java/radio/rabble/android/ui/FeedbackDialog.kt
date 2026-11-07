package radio.rabble.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Feedback
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import radio.rabble.android.data.Diagnostics
import radio.rabble.android.data.RabbleApi

private val CATEGORIES = listOf("problem" to "Something's broken", "idea" to "Suggestion", "other" to "Other")

/** Top-bar entry point: tap to open the report dialog. */
@Composable
fun FeedbackAction(api: RabbleApi, showId: String? = null) {
    var open by remember { mutableStateOf(false) }
    IconButton(onClick = { open = true }) {
        Icon(Icons.Outlined.Feedback, contentDescription = "Report a problem", tint = RabbleColors.TextSecondary)
    }
    if (open) FeedbackDialog(api = api, showId = showId, onDismiss = { open = false })
}

/**
 * Problem report: a category, a message, and everything [Diagnostics] knows
 * (screen, room state, device, display, network, recent API errors).
 */
@Composable
fun FeedbackDialog(api: RabbleApi, showId: String?, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var category by remember { mutableStateOf("problem") }
    var message by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var sent by remember { mutableStateOf(false) }

    fun send() {
        if (busy) return
        if (message.isBlank()) { error = "Tell us what happened first."; return }
        busy = true
        error = null
        scope.launch {
            try {
                api.sendFeedback(message.trim(), category, showId, Diagnostics.collect(context))
                sent = true
            } catch (e: Exception) {
                error = e.message ?: "Could not send your report."
            } finally {
                busy = false
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = RabbleColors.Surface,
        title = { Text(if (sent) "Thanks, got it" else "Report a problem", color = RabbleColors.Text) },
        text = {
            if (sent) {
                Text(
                    "Your report was saved with the screen, room state and device details we captured. No audio is recorded.",
                    color = RabbleColors.TextSecondary,
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "What went wrong? We attach your screen, room state, device, display and network details so we can reproduce it.",
                        color = RabbleColors.TextSecondary,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CATEGORIES.forEach { (value, label) ->
                            FilterChip(selected = category == value, onClick = { category = value }, label = { Text(label) })
                        }
                    }
                    OutlinedTextField(
                        value = message,
                        onValueChange = { message = it.take(4000) },
                        label = { Text("Details") },
                        placeholder = { Text("What did you expect, and what happened instead?") },
                        minLines = 4,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    error?.let { Text(it, color = RabbleColors.Live, style = MaterialTheme.typography.bodySmall) }
                }
            }
        },
        confirmButton = {
            if (sent) {
                Button(onClick = onDismiss) { Text("Done") }
            } else {
                Button(onClick = ::send, enabled = !busy) { Text(if (busy) "Sending…" else "Send report") }
            }
        },
        dismissButton = { if (!sent) TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
