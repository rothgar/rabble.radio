package radio.rabble.android

import android.app.Application
import android.os.Process
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import radio.rabble.android.data.Diagnostics
import radio.rabble.android.data.RabbleApi
import radio.rabble.android.data.SessionStore
import java.io.File

class RabbleApp : Application() {
    val baseUrl: String = BuildConfig.BASE_URL
    val session: SessionStore by lazy { SessionStore(baseUrl) }
    val api: RabbleApi by lazy { RabbleApi(baseUrl, session) }

    override fun onCreate() {
        super.onCreate()
        installCrashHandler()
        sendPendingCrashReport()
        Reminders.ensureChannel(this)
        Reminders.schedule(this)
    }

    private fun crashFile(): File = File(filesDir, "pending-crash.json")

    /**
     * The process is about to die, so the report is a plain synchronous file
     * write (no DB, no network) before handing off to the previous handler
     * so the crash still surfaces in logcat / Play Vitals as before.
     */
    private fun installCrashHandler() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            runCatching {
                val report = JSONObject()
                    .put("exceptionClass", throwable.javaClass.name)
                    .put("message", throwable.message ?: throwable.javaClass.name)
                    .put("stack", throwable.stackTraceToString())
                    .put("screen", Diagnostics.screen)
                crashFile().writeText(report.toString())
            }
            if (previous != null) {
                previous.uncaughtException(thread, throwable)
            } else {
                Process.killProcess(Process.myPid())
            }
        }
    }

    /**
     * Send a crash written on a prior run. All of this — including the
     * exists()/readText() check — runs off the main thread so a cold start
     * never blocks on disk. The file is deleted right after it's read, not
     * after the send attempt: if the app crashes again while the send is
     * still in flight, the new crash's write must land in a file this
     * coroutine no longer owns, or its own delete() would wipe out a report
     * it never read.
     */
    private fun sendPendingCrashReport() {
        CoroutineScope(Dispatchers.IO).launch {
            val file = crashFile()
            if (!file.exists()) return@launch
            val report = runCatching { JSONObject(file.readText()) }.getOrNull()
            file.delete()
            if (report == null) return@launch
            runCatching {
                api.reportCrash(
                    exceptionClass = report.optString("exceptionClass", "Unknown"),
                    message = report.optString("message", "crash"),
                    stack = report.optString("stack", ""),
                    screen = report.optString("screen", "launch"),
                )
            }
        }
    }
}
