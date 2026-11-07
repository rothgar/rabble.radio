package radio.rabble.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import radio.rabble.android.ui.HomeScreen
import radio.rabble.android.ui.LoginScreen
import radio.rabble.android.ui.RabbleTheme
import radio.rabble.android.ui.ShowScreen
import radio.rabble.android.ui.StationScreen
import java.net.URLDecoder
import java.net.URLEncoder

class MainActivity : ComponentActivity() {
    /** Show id from a tapped reminder notification; consumed by RabbleNav. */
    private val pendingShowId = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        pendingShowId.value = intent?.getStringExtra(Reminders.EXTRA_SHOW_ID)
        val app = application as RabbleApp
        setContent {
            RabbleTheme { RabbleNav(app, pendingShowId) }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        pendingShowId.value = intent.getStringExtra(Reminders.EXTRA_SHOW_ID)
    }
}

object Routes {
    const val HOME = "home"
    const val STATION = "station/{tag}"
    const val SHOW = "show/{id}?autoJoin={autoJoin}"
    const val LOGIN = "login"
    fun station(tag: String) = "station/" + URLEncoder.encode(tag, "UTF-8")
    fun show(id: String, autoJoin: Boolean = false) = "show/$id?autoJoin=$autoJoin"
}

@Composable
fun RabbleNav(app: RabbleApp, pendingShowId: androidx.compose.runtime.MutableState<String?>) {
    val nav = rememberNavController()
    // Bumped after login/logout so screens re-check the session.
    var sessionVersion by remember { mutableStateOf(0) }

    // A reminder notification was tapped: jump to that show.
    val wanted = pendingShowId.value
    androidx.compose.runtime.LaunchedEffect(wanted) {
        if (wanted != null) {
            pendingShowId.value = null
            nav.navigate(Routes.show(wanted))
        }
    }

    NavHost(navController = nav, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(
                api = app.api,
                session = app.session,
                sessionVersion = sessionVersion,
                onOpenShow = { nav.navigate(Routes.show(it)) },
                onOpenStation = { nav.navigate(Routes.station(it)) },
                onStartedShow = { nav.navigate(Routes.show(it, autoJoin = true)) },
                onLogin = { nav.navigate(Routes.LOGIN) },
                onLogout = { app.session.clear(); sessionVersion++ },
            )
        }
        composable(Routes.STATION) { entry ->
            val tag = URLDecoder.decode(entry.arguments?.getString("tag") ?: "", "UTF-8")
            StationScreen(
                api = app.api,
                tag = tag,
                onOpenShow = { nav.navigate(Routes.show(it)) },
                onBack = { nav.popBackStack() },
            )
        }
        composable(
            Routes.SHOW,
            arguments = listOf(navArgument("autoJoin") { defaultValue = "false" }),
        ) { entry ->
            val id = entry.arguments?.getString("id") ?: ""
            val autoJoin = entry.arguments?.getString("autoJoin") == "true"
            ShowScreen(
                app = app,
                showId = id,
                autoJoin = autoJoin,
                sessionVersion = sessionVersion,
                onLogin = { nav.navigate(Routes.LOGIN) },
                onBack = { nav.popBackStack() },
            )
        }
        composable(Routes.LOGIN) {
            LoginScreen(
                baseUrl = app.baseUrl,
                session = app.session,
                onDone = { sessionVersion++; nav.popBackStack() },
            )
        }
    }
}
