package radio.rabble.android.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import radio.rabble.android.R

/**
 * Mirrors the brand tokens in src/app/globals.css (see docs/brand.md):
 * cream paper, Retro Teal ink, Rebel Red accent, Vintage Orange secondary,
 * Mustard highlight. Light theme only.
 */
object RabbleColors {
    val Bg = Color(0xFFF1FAEE)            // Cream White
    val Surface = Color(0xFFF8FCF5)
    val SurfaceRaised = Color(0xFFFFFEF9)
    val Ink = Color(0xFF073B4C)           // Retro Teal fill
    val InkMuted = Ink.copy(alpha = 0.08f)
    val Text = Ink
    val TextSecondary = Color(0xFF3D6472)
    val TextTertiary = Color(0xFF7A9AA4)
    val TextOnInk = Bg
    val Accent = Color(0xFFE63946)        // Rebel Red
    val AccentHover = Color(0xFFCF2E3B)
    val AccentMuted = Accent.copy(alpha = 0.12f)
    val Accent2 = Color(0xFFFF7F00)       // Vintage Orange
    val Accent2Dark = Color(0xFFAD5600)
    val Highlight = Color(0xFFF9C74F)     // Mustard Yellow
    val HighlightMuted = Highlight.copy(alpha = 0.35f)
    val Border = Ink
    val Divider = Ink.copy(alpha = 0.18f)
    val Live = Accent
    val Success = Color(0xFF2A9D8F)
    val Warning = Highlight
    val Error = Accent
}

/** Fraunces Black (soft optical axis) stands in for Cooper Black; Inter is the body face. */
object RabbleFonts {
    val Display = FontFamily(Font(R.font.fraunces_black, FontWeight.Black))
    val Sans = FontFamily(
        Font(R.font.inter_regular, FontWeight.Normal),
        Font(R.font.inter_medium, FontWeight.Medium),
        Font(R.font.inter_semibold, FontWeight.SemiBold),
        Font(R.font.inter_bold, FontWeight.Bold),
    )
}

private val defaults = Typography()
private fun TextStyle.sans() = copy(fontFamily = RabbleFonts.Sans)
private fun TextStyle.display() =
    copy(fontFamily = RabbleFonts.Display, fontWeight = FontWeight.Black, letterSpacing = (-0.01).em)

/** Display and headline styles carry the brand serif; titles, body and labels are Inter. */
private val typography = Typography(
    displayLarge = defaults.displayLarge.display(),
    displayMedium = defaults.displayMedium.display(),
    displaySmall = defaults.displaySmall.display(),
    headlineLarge = defaults.headlineLarge.display(),
    headlineMedium = defaults.headlineMedium.display(),
    headlineSmall = defaults.headlineSmall.display(),
    titleLarge = defaults.titleLarge.sans(),
    titleMedium = defaults.titleMedium.sans(),
    titleSmall = defaults.titleSmall.sans(),
    bodyLarge = defaults.bodyLarge.sans(),
    bodyMedium = defaults.bodyMedium.sans(),
    bodySmall = defaults.bodySmall.sans(),
    labelLarge = defaults.labelLarge.sans(),
    labelMedium = defaults.labelMedium.sans(),
    labelSmall = defaults.labelSmall.sans(),
)

private val scheme = lightColorScheme(
    primary = RabbleColors.Accent,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFAD0D4),
    onPrimaryContainer = Color(0xFFA32731),
    secondary = RabbleColors.Accent2,
    onSecondary = RabbleColors.Ink,
    secondaryContainer = Color(0xFFFFD9B0),
    onSecondaryContainer = Color(0xFF803F00),
    tertiary = RabbleColors.Highlight,
    onTertiary = RabbleColors.Ink,
    tertiaryContainer = Color(0xFFFDE7A8),
    onTertiaryContainer = RabbleColors.Ink,
    background = RabbleColors.Bg,
    onBackground = RabbleColors.Text,
    surface = RabbleColors.Surface,
    onSurface = RabbleColors.Text,
    surfaceVariant = RabbleColors.SurfaceRaised,
    onSurfaceVariant = RabbleColors.TextSecondary,
    surfaceContainer = RabbleColors.Surface,
    surfaceContainerHigh = RabbleColors.SurfaceRaised,
    surfaceContainerHighest = RabbleColors.SurfaceRaised,
    outline = RabbleColors.Border,
    outlineVariant = Color(0xFFC7D6DA),
    error = RabbleColors.Error,
    onError = Color.White,
    errorContainer = Color(0xFFFDECEE),
    onErrorContainer = Color(0xFFA32731),
)

@Composable
fun RabbleTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, typography = typography, content = content)
}
