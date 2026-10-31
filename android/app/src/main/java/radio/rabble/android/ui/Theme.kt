package radio.rabble.android.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Mirrors the design tokens in src/app/globals.css. */
object RabbleColors {
    val Bg = Color(0xFF161826)
    val Surface = Color(0xFF232532)
    val SurfaceRaised = Color(0xFF2C2F43)
    val Text = Color(0xFFE9E9ED)
    val TextSecondary = Color(0xFF9397AB)
    val TextTertiary = Color(0xFF595D6C)
    val Accent = Color(0xFF9184D9)
    val AccentHover = Color(0xFFA396E0)
    val Accent900 = Color(0xFF2B2741)
    val Live = Color(0xFFF87171)
    val Success = Color(0xFF34D399)
}

private val scheme = darkColorScheme(
    primary = RabbleColors.Accent,
    onPrimary = Color.White,
    secondary = RabbleColors.AccentHover,
    background = RabbleColors.Bg,
    onBackground = RabbleColors.Text,
    surface = RabbleColors.Surface,
    onSurface = RabbleColors.Text,
    surfaceVariant = RabbleColors.SurfaceRaised,
    onSurfaceVariant = RabbleColors.TextSecondary,
    error = RabbleColors.Live,
)

@Composable
fun RabbleTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, content = content)
}
