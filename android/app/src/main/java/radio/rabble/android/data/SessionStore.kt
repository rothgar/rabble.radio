package radio.rabble.android.data

import android.webkit.CookieManager

/**
 * The web app authenticates with an iron-session cookie set during the
 * Bluesky OAuth flow. Login happens in a WebView, so the cookie lives in the
 * WebView CookieManager; this helper exposes it to OkHttp.
 */
class SessionStore(private val baseUrl: String) {
    private val manager: CookieManager get() = CookieManager.getInstance()

    fun cookieHeader(): String? = manager.getCookie(baseUrl)?.takeIf { it.isNotBlank() }

    fun hasSession(): Boolean = cookieHeader()?.contains(SESSION_COOKIE) == true

    fun clear() {
        manager.removeAllCookies(null)
        manager.flush()
    }

    companion object {
        const val SESSION_COOKIE = "bs_spaces_session"
    }
}
