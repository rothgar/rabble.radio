package radio.rabble.android.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import radio.rabble.android.BuildConfig
import java.time.Instant
import java.util.ArrayDeque
import java.util.Locale

/**
 * State and environment capture for the feedback button. Screens report
 * where the user is and what the room looks like; the API client records
 * failed requests; [collect] adds device, OS, display (including whether
 * the Fold is open), network and permission details at send time.
 */
object Diagnostics {
    private const val MAX_EVENTS = 30

    @Volatile var screen: String = "launch"
    @Volatile var roomSnapshot: JSONObject? = null
    private val events = ArrayDeque<JSONObject>()

    /** Note something worth seeing in a report: API failures, room drops, permission denials. */
    fun event(kind: String, message: String, extra: JSONObject? = null) {
        val o = JSONObject()
            .put("at", Instant.now().toString())
            .put("kind", kind)
            .put("message", message.take(500))
        if (extra != null) o.put("extra", extra)
        synchronized(events) {
            events.addLast(o)
            while (events.size > MAX_EVENTS) events.removeFirst()
        }
    }

    fun setRoom(
        showId: String,
        role: String,
        connected: Boolean,
        onAir: Boolean,
        micOn: Boolean,
        members: Int,
        anonymousListeners: Int,
        invitePending: Boolean,
    ) {
        roomSnapshot = JSONObject()
            .put("showId", showId)
            .put("role", role)
            .put("connected", connected)
            .put("onAir", onAir)
            .put("micOn", micOn)
            .put("members", members)
            .put("anonymousListeners", anonymousListeners)
            .put("invitePending", invitePending)
            .put("updatedAt", Instant.now().toString())
    }

    fun clearRoom() {
        roomSnapshot = null
    }

    fun collect(context: Context): JSONObject {
        val res = context.resources
        val dm = res.displayMetrics
        val cfg = res.configuration
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val caps = cm?.activeNetwork?.let { cm.getNetworkCapabilities(it) }
        val network = when {
            caps == null -> "none"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "vpn"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "other"
        }
        val micGranted = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val snapshot = synchronized(events) { JSONArray(events.toList()) }
        return JSONObject()
            .put("capturedAt", Instant.now().toString())
            .put("screen", screen)
            .put("app", JSONObject()
                .put("versionName", BuildConfig.VERSION_NAME)
                .put("versionCode", BuildConfig.VERSION_CODE)
                .put("buildType", BuildConfig.BUILD_TYPE)
                .put("baseUrl", BuildConfig.BASE_URL))
            .put("device", JSONObject()
                .put("manufacturer", Build.MANUFACTURER)
                .put("model", Build.MODEL)
                .put("device", Build.DEVICE)
                .put("androidVersion", Build.VERSION.RELEASE)
                .put("sdkInt", Build.VERSION.SDK_INT)
                .put("locale", Locale.getDefault().toLanguageTag()))
            .put("display", JSONObject()
                .put("widthPx", dm.widthPixels)
                .put("heightPx", dm.heightPixels)
                .put("densityDpi", dm.densityDpi)
                .put("screenWidthDp", cfg.screenWidthDp)
                .put("screenHeightDp", cfg.screenHeightDp)
                .put("smallestScreenWidthDp", cfg.smallestScreenWidthDp)
                .put("orientation", if (cfg.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE) "landscape" else "portrait")
                .put("fontScale", cfg.fontScale.toDouble()))
            .put("network", JSONObject()
                .put("type", network)
                .put("validated", caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ?: false)
                .put("metered", cm?.isActiveNetworkMetered ?: false))
            .put("permissions", JSONObject().put("microphone", micGranted))
            .put("room", roomSnapshot ?: JSONObject.NULL)
            .put("recentEvents", snapshot)
    }
}
