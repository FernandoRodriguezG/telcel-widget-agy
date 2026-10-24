package mx.miwidget.bait.core

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Error de negocio o de red mostrado al usuario tal cual. */
class BaitException(message: String, cause: Throwable? = null) : Exception(message, cause)

data class BaitBucket(
    val id: String,
    val name: String,
    val consumedMB: Double,
    val totalMB: Double,
    val availableMB: Double
)

/**
 * Consumo normalizado de una línea Bait. Mismas llaves que el resultado de
 * `parseBaitResponse` en src/MiBaitWidget.js (1 GB = 1024 MB).
 */
data class BaitUsage(
    val consumedMB: Double,
    val totalMB: Double,
    val availableMB: Double,
    val daysLeft: Int,
    val cutoffDate: String,
    val cutoffISO: String?,
    val planName: String,
    val promo: Boolean,
    val buckets: List<BaitBucket>,
    val updatedAt: String,
    val fromCache: Boolean = false
) {
    /** Recalcula `daysLeft` contra [today] a partir de `cutoffISO`, igual que `loadCache` en iOS. */
    fun asCached(today: LocalDate): BaitUsage {
        val cutoff = parseIsoDate(cutoffISO)
        val days = if (cutoff != null) maxOf(0, ChronoUnit.DAYS.between(today, cutoff).toInt()) else daysLeft
        return copy(daysLeft = days, fromCache = true)
    }

    fun toJson(): JSONObject = JSONObject()
        .put("consumedMB", consumedMB)
        .put("totalMB", totalMB)
        .put("availableMB", availableMB)
        .put("daysLeft", daysLeft)
        .put("cutoffDate", cutoffDate)
        .put("cutoffISO", cutoffISO ?: JSONObject.NULL)
        .put("planName", planName)
        .put("promo", promo)
        .put("buckets", JSONArray().apply {
            buckets.forEach {
                put(
                    JSONObject()
                        .put("id", it.id)
                        .put("name", it.name)
                        .put("consumedMB", it.consumedMB)
                        .put("totalMB", it.totalMB)
                        .put("availableMB", it.availableMB)
                )
            }
        })
        .put("updatedAt", updatedAt)
        .put("fromCache", fromCache)

    companion object {
        fun fromJson(json: JSONObject): BaitUsage {
            val bucketsJson = json.optJSONArray("buckets") ?: JSONArray()
            val buckets = (0 until bucketsJson.length()).map { i ->
                val b = bucketsJson.getJSONObject(i)
                BaitBucket(
                    id = b.optString("id"),
                    name = b.optString("name"),
                    consumedMB = b.optDouble("consumedMB", 0.0),
                    totalMB = b.optDouble("totalMB", 0.0),
                    availableMB = b.optDouble("availableMB", 0.0)
                )
            }
            return BaitUsage(
                consumedMB = json.optDouble("consumedMB", 0.0),
                totalMB = json.optDouble("totalMB", 0.0),
                availableMB = json.optDouble("availableMB", 0.0),
                daysLeft = json.optInt("daysLeft", 0),
                cutoffDate = json.optString("cutoffDate", ""),
                cutoffISO = if (json.isNull("cutoffISO")) null else json.optString("cutoffISO"),
                planName = json.optString("planName", "Mi Bait"),
                promo = json.optBoolean("promo", false),
                buckets = buckets,
                updatedAt = json.optString("updatedAt", ""),
                fromCache = json.optBoolean("fromCache", false)
            )
        }
    }
}

private val ISO_DATE = Regex("""^(\d{4})-(\d{2})-(\d{2})$""")

/** Acepta `YYYY-MM-DD` o `YYYY-MM-DDTHH:mm:ss...` y toma solo la fecha (como `parseExpire` en JS). */
internal fun parseIsoDate(value: String?): LocalDate? {
    val m = ISO_DATE.find(value.orEmpty().substringBefore('T')) ?: return null
    return runCatching {
        LocalDate.of(m.groupValues[1].toInt(), m.groupValues[2].toInt(), m.groupValues[3].toInt())
    }.getOrNull()
}
