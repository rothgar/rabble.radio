package radio.rabble.android.ui

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Message
import android.webkit.CookieManager
import android.webkit.WebChromeClient
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
                    settings.setSupportMultipleWindows(true)
                    CookieManager.getInstance().setAcceptCookie(true)
                    // The login page's "create an account" links are target="_blank". Without
                    // a WebChromeClient, WebView has nowhere to open them and treats them as a
                    // same-view navigation, stranding the OAuth flow. Route them to a throwaway
                    // WebView whose only job is to hand the URL to an external app.
                    //
                    // javaScriptCanOpenWindowsAutomatically is left at its default (false) and
                    // isUserGesture is checked below so a script running on a page loaded in
                    // this flow (e.g. a PDS or authorization-server page reached mid-OAuth)
                    // can't pop an unprompted external browser window itself; only an actual
                    // tap on a target="_blank" link reaches openExternally.
                    webChromeClient = object : WebChromeClient() {
                        override fun onCreateWindow(
                            view: WebView,
                            isDialog: Boolean,
                            isUserGesture: Boolean,
                            resultMsg: Message,
                        ): Boolean {
                            if (!isUserGesture) return false
                            val popup = WebView(context)
                            popup.webViewClient = object : WebViewClient() {
                                override fun shouldOverrideUrlLoading(
                                    popupView: WebView,
                                    request: WebResourceRequest,
                                ): Boolean {
                                    openExternally(context, request.url)
                                    popupView.post { popupView.destroy() }
                                    return true
                                }
                            }
                            (resultMsg.obj as WebView.WebViewTransport).webView = popup
                            resultMsg.sendToTarget()
                            return true
                        }
                    }
                    webViewClient = object : WebViewClient() {
                        private var done = false

                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = false

                        /** The callback's redirect has set the cookie: leave without rendering the landing page. */
                        private fun finishIfSignedIn(url: String?) {
                            if (done) return
                            CookieManager.getInstance().flush()
                            if (url != null && url.startsWith(baseUrl) && !url.contains("/login") &&
                                !url.contains("/api/auth/") && session.hasSession()
                            ) {
                                done = true
                                onDone()
                            }
                        }

                        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                            finishIfSignedIn(url)
                        }

                        override fun onPageFinished(view: WebView, url: String?) {
                            finishIfSignedIn(url)
                        }
                    }
                    loadUrl("$baseUrl/login")
                }
            },
        )
    }
}

private fun openExternally(context: Context, url: Uri) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, url))
    } catch (e: ActivityNotFoundException) {
        // No app can handle it (no browser installed); nothing more to do.
    }
}
