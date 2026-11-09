package radio.rabble.android

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import radio.rabble.android.data.Diagnostics
import java.util.concurrent.TimeUnit

/**
 * "Notify me" delivery. The server keeps the reminders; this worker asks it
 * every 15 minutes (WorkManager's floor) for shows that just went on air and
 * posts a system notification for each. Tapping it opens the show.
 */
object Reminders {
    const val CHANNEL_ID = "reminders"
    const val EXTRA_SHOW_ID = "showId"
    private const val WORK_NAME = "reminder-poll"

    fun ensureChannel(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Show reminders", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Tells you when a show you asked about goes on air."
                }
            )
        }
    }

    /** Idempotent: schedules the periodic check if it is not already queued. */
    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<ReminderWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun notifyOnAir(context: Context, showId: String, title: String, hostName: String) {
        if (!canPost(context)) return
        ensureChannel(context)
        val open = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_SHOW_ID, showId)
        }
        val pending = PendingIntent.getActivity(
            context, showId.hashCode(), open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("$title is on air")
            .setContentText("$hostName just went live on Rabble Radio.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(showId.hashCode(), notification) }
    }
}

class ReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as? RabbleApp ?: return Result.success()
        if (!app.session.hasSession()) return Result.success()
        return try {
            app.api.dueReminders().forEach { Reminders.notifyOnAir(applicationContext, it.spaceId, it.title, it.hostName) }
            Result.success()
        } catch (e: Exception) {
            Diagnostics.event("reminder_poll_failed", e.message ?: e.javaClass.simpleName)
            Result.retry()
        }
    }
}
