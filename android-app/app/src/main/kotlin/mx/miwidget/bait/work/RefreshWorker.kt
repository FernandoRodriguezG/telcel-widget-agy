package mx.miwidget.bait.work

import android.content.Context
import android.util.Log
import androidx.glance.appwidget.updateAll
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.miwidget.bait.core.BaitClient
import mx.miwidget.bait.data.PhoneStore
import mx.miwidget.bait.data.UsageCache
import mx.miwidget.bait.widget.BaitWidget
import java.util.concurrent.TimeUnit

/** Consulta mibait.com, guarda el resultado y redibuja todos los widgets. */
class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val phone = PhoneStore(applicationContext).get()
        if (phone != null) {
            val cache = UsageCache(applicationContext)
            try {
                val usage = withContext(Dispatchers.IO) {
                    BaitClient(log = { Log.w(TAG, it) }).fetchUsage(phone)
                }
                cache.save(usage)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Actualización fallida", e)
                cache.markStale(e.message ?: "Error desconocido")
            }
        }
        BaitWidget().updateAll(applicationContext)
        return Result.success()
    }

    companion object {
        private const val TAG = "MiBaitRefresh"
        private const val PERIODIC_WORK = "bait_refresh_periodic"
        private const val NOW_WORK = "bait_refresh_now"

        // mibait.com aplica límites por IP: una consulta por hora basta para el widget
        private const val REFRESH_HOURS = 1L

        private val networkConstraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        fun schedule(context: Context) {
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK,
                ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<RefreshWorker>(REFRESH_HOURS, TimeUnit.HOURS)
                    .setConstraints(networkConstraints)
                    .build()
            )
        }

        fun refreshNow(context: Context) {
            WorkManager.getInstance(context).enqueueUniqueWork(
                NOW_WORK,
                ExistingWorkPolicy.REPLACE,
                OneTimeWorkRequestBuilder<RefreshWorker>().setConstraints(networkConstraints).build()
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK)
        }
    }
}
