package mx.miwidget.bait.data

import android.content.Context
import mx.miwidget.bait.core.BaitUsage
import org.json.JSONObject
import java.time.LocalDate

/**
 * Último consumo obtenido. Si una actualización falla se conserva el dato anterior marcado
 * como caché (☁️) y `daysLeft` se recalcula siempre contra la fecha de hoy.
 */
class UsageCache(context: Context) {
    private val prefs = context.getSharedPreferences("bait_cache", Context.MODE_PRIVATE)

    fun save(usage: BaitUsage) {
        prefs.edit()
            .putString(KEY_USAGE, usage.copy(fromCache = false).toJson().toString())
            .putBoolean(KEY_STALE, false)
            .remove(KEY_ERROR)
            .apply()
    }

    fun markStale(error: String) {
        prefs.edit().putBoolean(KEY_STALE, true).putString(KEY_ERROR, error).apply()
    }

    fun load(today: LocalDate = LocalDate.now()): BaitUsage? {
        val raw = prefs.getString(KEY_USAGE, null) ?: return null
        return runCatching {
            BaitUsage.fromJson(JSONObject(raw)).asCached(today).copy(fromCache = prefs.getBoolean(KEY_STALE, false))
        }.getOrNull()
    }

    fun lastError(): String? = prefs.getString(KEY_ERROR, null)

    fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_USAGE = "usage"
        const val KEY_STALE = "stale"
        const val KEY_ERROR = "error"
    }
}
