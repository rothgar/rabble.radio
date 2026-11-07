package radio.rabble.android.ui

import android.annotation.SuppressLint
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import radio.rabble.android.data.SessionStore

/**
 * Signs in through the web app's Bluesky OAuth flow inside a WebView. The
 * session cookie the callback sets is shared with the API client through
 * the WebView CookieManager, so once the flow lands back on the site we are
 * authenticated and can pop back.
 */
@OptIn(ExperimentalMaterial3Api::class)
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun LoginScreen(baseUrl: String, session: SessionStore, onDone: () -> Unit) {
    androidx.compose.runtime.LaunchedEffect(Unit) { radio.rabble.android.data.Diagnostics.screen = "login" }
    Scaffold(
        containerColor = RabbleColors.Bg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = RabbleColors.Bg),
                title = { Text("Sign in with Bluesky") },
                navigationIcon = {
                    IconButton(onClick = onDone) { Icon(Icons.Default.Close, contentDescription = "Close") }
                },
            )
        },
    ) { padding ->
        AndroidView(
            modifier = Modifier.fillMaxSize().padding(padding),
            factory = { context ->
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = false

                        override fun onPageFinished(view: WebView, url: String?) {
                            // The OAuth callback redirects to /stations on the app's
                            // origin once the cookie is set; that is our cue to leave.
                            CookieManager.getInstance().flush()
                            if (url != null && url.startsWith(baseUrl) && !url.contains("/login") &&
                                !url.contains("/api/auth/") && session.hasSession()
                            ) {
                                onDone()
                            }
                        }
                    }
                    loadUrl("$baseUrl/login")
                }
            },
        )
    }
}
