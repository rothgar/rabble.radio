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
import radio.rabble.android.ui.LoginScreen
import radio.rabble.android.ui.RabbleTheme
import radio.rabble.android.ui.ShowScreen
import radio.rabble.android.ui.StationScreen
import radio.rabble.android.ui.StationsScreen
import java.net.URLDecoder
import java.net.URLEncoder

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as RabbleApp
        setContent {
            RabbleTheme { RabbleNav(app) }
        }
    }
}

object Routes {
    const val STATIONS = "stations"
    const val STATION = "station/{tag}"
    const val SHOW = "show/{id}"
    const val LOGIN = "login"
    fun station(tag: String) = "station/" + URLEncoder.encode(tag, "UTF-8")
    fun show(id: String) = "show/$id"
}

@Composable
fun RabbleNav(app: RabbleApp) {
    val nav = rememberNavController()
    // Bumped after login/logout so screens re-check the session.
    var sessionVersion by remember { mutableStateOf(0) }

    NavHost(navController = nav, startDestination = Routes.STATIONS) {
        composable(Routes.STATIONS) {
            StationsScreen(
                api = app.api,
                session = app.session,
                sessionVersion = sessionVersion,
                onOpenStation = { nav.navigate(Routes.station(it)) },
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
        composable(Routes.SHOW) { entry ->
            val id = entry.arguments?.getString("id") ?: ""
            ShowScreen(
                app = app,
                showId = id,
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
