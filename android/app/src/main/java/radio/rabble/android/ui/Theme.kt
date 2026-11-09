package radio.rabble.android.ui

import android.content.Context
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import radio.rabble.android.R

/**
 * Brand palette (docs/brand.md, mirrored from src/app/globals.css): cream paper,
 * Retro Teal ink, Rebel Red accent, Vintage Orange secondary, Mustard
 * highlight. The dark variant inverts paper and ink.
 */
data class RabblePalette(
    val bg: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val ink: Color,
    val inkMuted: Color,
    val text: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val textOnInk: Color,
    val accent: Color,
    val accentHover: Color,
    val accentMuted: Color,
    val accent2: Color,
    val accent2Dark: Color,
    val highlight: Color,
    val highlightMuted: Color,
    val border: Color,
    val divider: Color,
    val live: Color,
    val success: Color,
    val warning: Color,
    val error: Color,
    val isDark: Boolean,
)

val LightPalette = RabblePalette(
    bg = Color(0xFFF1FAEE),            // Cream White
    surface = Color(0xFFF8FCF5),
    surfaceRaised = Color(0xFFFFFEF9),
    ink = Color(0xFF073B4C),           // Retro Teal fill
    inkMuted = Color(0xFF073B4C).copy(alpha = 0.08f),
    text = Color(0xFF073B4C),
    textSecondary = Color(0xFF3D6472),
    textTertiary = Color(0xFF7A9AA4),
    textOnInk = Color(0xFFF1FAEE),
    accent = Color(0xFFE63946),        // Rebel Red
    accentHover = Color(0xFFCF2E3B),
    accentMuted = Color(0xFFE63946).copy(alpha = 0.12f),
    accent2 = Color(0xFFFF7F00),       // Vintage Orange
    accent2Dark = Color(0xFFAD5600),
    highlight = Color(0xFFF9C74F),     // Mustard Yellow
    highlightMuted = Color(0xFFF9C74F).copy(alpha = 0.35f),
    border = Color(0xFF073B4C),
    divider = Color(0xFF073B4C).copy(alpha = 0.18f),
    live = Color(0xFFE63946),
    success = Color(0xFF2A9D8F),
    warning = Color(0xFFF9C74F),
    error = Color(0xFFE63946),
    isDark = false,
)

val DarkPalette = RabblePalette(
    bg = Color(0xFF062B38),            // deep teal paper
    surface = Color(0xFF0B3A4A),
    surfaceRaised = Color(0xFF114757),
    ink = Color(0xFFF1FAEE),           // cream fill
    inkMuted = Color(0xFFF1FAEE).copy(alpha = 0.10f),
    text = Color(0xFFF1FAEE),
    textSecondary = Color(0xFFB9D1D8),
    textTertiary = Color(0xFF7FA3AE),
    textOnInk = Color(0xFF073B4C),
    accent = Color(0xFFE63946),
    accentHover = Color(0xFFF0515D),
    accentMuted = Color(0xFFE63946).copy(alpha = 0.18f),
    accent2 = Color(0xFFFF7F00),
    accent2Dark = Color(0xFFFFB266),
    highlight = Color(0xFFF9C74F),
    highlightMuted = Color(0xFFF9C74F).copy(alpha = 0.22f),
    border = Color(0xFFE9F4EC),
    divider = Color(0xFFF1FAEE).copy(alpha = 0.18f),
    live = Color(0xFFF0515D),
    success = Color(0xFF3DB9A9),
    warning = Color(0xFFF9C74F),
    error = Color(0xFFF0515D),
    isDark = true,
)

val LocalRabblePalette = compositionLocalOf { LightPalette }

/** Composable accessors for the active palette; call sites read `RabbleColors.X`. */
object RabbleColors {
    val Bg: Color @Composable get() = LocalRabblePalette.current.bg
    val Surface: Color @Composable get() = LocalRabblePalette.current.surface
    val SurfaceRaised: Color @Composable get() = LocalRabblePalette.current.surfaceRaised
    val Ink: Color @Composable get() = LocalRabblePalette.current.ink
    val InkMuted: Color @Composable get() = LocalRabblePalette.current.inkMuted
    val Text: Color @Composable get() = LocalRabblePalette.current.text
    val TextSecondary: Color @Composable get() = LocalRabblePalette.current.textSecondary
    val TextTertiary: Color @Composable get() = LocalRabblePalette.current.textTertiary
    val TextOnInk: Color @Composable get() = LocalRabblePalette.current.textOnInk
    val Accent: Color @Composable get() = LocalRabblePalette.current.accent
    val AccentHover: Color @Composable get() = LocalRabblePalette.current.accentHover
    val AccentMuted: Color @Composable get() = LocalRabblePalette.current.accentMuted
    val Accent2: Color @Composable get() = LocalRabblePalette.current.accent2
    val Accent2Dark: Color @Composable get() = LocalRabblePalette.current.accent2Dark
    val Highlight: Color @Composable get() = LocalRabblePalette.current.highlight
    val HighlightMuted: Color @Composable get() = LocalRabblePalette.current.highlightMuted
    val Border: Color @Composable get() = LocalRabblePalette.current.border
    val Divider: Color @Composable get() = LocalRabblePalette.current.divider
    val Live: Color @Composable get() = LocalRabblePalette.current.live
    val Success: Color @Composable get() = LocalRabblePalette.current.success
    val Warning: Color @Composable get() = LocalRabblePalette.current.warning
    val Error: Color @Composable get() = LocalRabblePalette.current.error
}

/** User's appearance choice: follow the system, or force light / dark. Stored in the "rabble" prefs. */
object ThemePreference {
    const val SYSTEM = "system"
    const val LIGHT = "light"
    const val DARK = "dark"
    private const val KEY = "theme"

    val current = mutableStateOf(SYSTEM)

    fun load(context: Context) {
        current.value = context.getSharedPreferences("rabble", Context.MODE_PRIVATE).getString(KEY, SYSTEM) ?: SYSTEM
    }

    fun set(context: Context, value: String) {
        current.value = value
        context.getSharedPreferences("rabble", Context.MODE_PRIVATE).edit().putString(KEY, value).apply()
    }

    /** system -> light -> dark -> system */
    fun next(value: String): String = when (value) {
        SYSTEM -> LIGHT
        LIGHT -> DARK
        else -> SYSTEM
    }

    fun label(value: String): String = when (value) {
        LIGHT -> "Light"
        DARK -> "Dark"
        else -> "System"
    }
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

private val lightScheme = lightColorScheme(
    primary = LightPalette.accent,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFAD0D4),
    onPrimaryContainer = Color(0xFFA32731),
    secondary = LightPalette.accent2,
    onSecondary = LightPalette.ink,
    secondaryContainer = Color(0xFFFFD9B0),
    onSecondaryContainer = Color(0xFF803F00),
    tertiary = LightPalette.highlight,
    onTertiary = LightPalette.ink,
    tertiaryContainer = Color(0xFFFDE7A8),
    onTertiaryContainer = LightPalette.ink,
    background = LightPalette.bg,
    onBackground = LightPalette.text,
    surface = LightPalette.surface,
    onSurface = LightPalette.text,
    surfaceVariant = LightPalette.surfaceRaised,
    onSurfaceVariant = LightPalette.textSecondary,
    surfaceContainer = LightPalette.surface,
    surfaceContainerHigh = LightPalette.surfaceRaised,
    surfaceContainerHighest = LightPalette.surfaceRaised,
    outline = LightPalette.border,
    outlineVariant = Color(0xFFC7D6DA),
    error = LightPalette.error,
    onError = Color.White,
    errorContainer = Color(0xFFFDECEE),
    onErrorContainer = Color(0xFFA32731),
)

private val darkScheme = darkColorScheme(
    primary = DarkPalette.accent,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF7A1D25),
    onPrimaryContainer = Color(0xFFFAD0D4),
    secondary = DarkPalette.accent2,
    onSecondary = DarkPalette.textOnInk,
    secondaryContainer = Color(0xFF803F00),
    onSecondaryContainer = Color(0xFFFFD9B0),
    tertiary = DarkPalette.highlight,
    onTertiary = DarkPalette.textOnInk,
    tertiaryContainer = Color(0xFF5C4300),
    onTertiaryContainer = Color(0xFFFDE7A8),
    background = DarkPalette.bg,
    onBackground = DarkPalette.text,
    surface = DarkPalette.surface,
    onSurface = DarkPalette.text,
    surfaceVariant = DarkPalette.surfaceRaised,
    onSurfaceVariant = DarkPalette.textSecondary,
    surfaceContainer = DarkPalette.surface,
    surfaceContainerHigh = DarkPalette.surfaceRaised,
    surfaceContainerHighest = DarkPalette.surfaceRaised,
    outline = DarkPalette.border,
    outlineVariant = Color(0xFF2E5A69),
    error = DarkPalette.error,
    onError = Color.White,
    errorContainer = Color(0xFF4F1218),
    onErrorContainer = Color(0xFFFAD0D4),
)

/** Resolve the preference to a palette; `pref` defaults to the stored choice. */
@Composable
fun rabblePalette(pref: String = ThemePreference.current.value): RabblePalette {
    val dark = when (pref) {
        ThemePreference.DARK -> true
        ThemePreference.LIGHT -> false
        else -> isSystemInDarkTheme()
    }
    return if (dark) DarkPalette else LightPalette
}

@Composable
fun RabbleTheme(content: @Composable () -> Unit) {
    val palette = rabblePalette()
    val scheme: ColorScheme = if (palette.isDark) darkScheme else lightScheme
    CompositionLocalProvider(LocalRabblePalette provides palette) {
        MaterialTheme(colorScheme = scheme, typography = typography, content = content)
    }
}
