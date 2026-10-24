package mx.miwidget.bait.core

import org.json.JSONObject
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit

/**
 * Port 1:1 de `parseBaitResponse` (src/MiBaitWidget.js) para la respuesta de
 * `/api/core/q/dn/{phone}/get/consumption`. Suma BestEffort + Throttling y las ofertas
 * vigentes de Benefits; ignora SocialMedia, Minutes y Message en MB y en la vigencia.
 * Validado contra tests/fixtures/bait junto con la versión JS.
 */
object BaitParser {
    private val MONTHS_ES = listOf(
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    )

    fun parse(payload: JSONObject, now: LocalDateTime = LocalDateTime.now()): BaitUsage {
        val data = payload.optJSONArray("data")
        if (!truthy(payload.opt("success")) || data == null) {
            throw BaitException(
                payload.optString("message").ifEmpty { "Respuesta de Mi Bait sin datos de consumo" }
            )
        }

        val today = now.toLocalDate()
        val buckets = mutableListOf<BaitBucket>()
        var maxExpire: java.time.LocalDate? = null
        fun trackExpire(date: java.time.LocalDate?) {
            if (date != null && (maxExpire == null || date > maxExpire)) maxExpire = date
        }

        var isUnlimited = false
        for (i in 0 until data.length()) {
            val item = data.optJSONObject(i) ?: continue
            val type = item.optString("type")
            if (type == "BestEffort" || type == "Throttling") {
                val resume = item.optJSONObject("resume")
                val totalMB = number(resume?.opt("total"))
                val availableMB = number(resume?.opt("unused"))
                if (totalMB > 0 || availableMB > 0) {
                    trackExpire(parseIsoDate(resume?.optString("expire_date")))
                    buckets += BaitBucket(
                        id = type,
                        name = if (type == "BestEffort") "Velocidad normal" else "Velocidad reducida",
                        consumedMB = maxOf(0.0, totalMB - availableMB),
                        totalMB = totalMB,
                        availableMB = availableMB
                    )
                }
            } else if (type == "Benefits") {
                val offers = item.optJSONArray("offers_detail")
                if (offers != null) {
                    var promoTotal = 0.0
                    var promoAvail = 0.0
                    for (j in 0 until offers.length()) {
                        val offer = offers.optJSONObject(j)
                        val exp = parseIsoDate(offer?.optString("expire_date"))
                        if (exp == null || exp >= today) {
                            promoTotal += number(offer?.opt("total"))
                            promoAvail += number(offer?.opt("unused"))
                            trackExpire(exp)
                        }
                    }
                    if (promoTotal > 0 || promoAvail > 0) {
                        buckets += BaitBucket(
                            id = "Benefits",
                            name = "Beneficios",
                            consumedMB = maxOf(0.0, promoTotal - promoAvail),
                            totalMB = promoTotal,
                            availableMB = promoAvail
                        )
                    }
                }
            }
            if (item.optString("category") == "Data" && type != "Unkown" && type != "SocialMedia" &&
                truthy(item.opt("unlimited"))
            ) {
                isUnlimited = true
            }
        }

        if (buckets.isEmpty()) throw BaitException("Sin bolsas de datos activas en la línea Bait")

        val cutoff = maxExpire
        return BaitUsage(
            consumedMB = buckets.sumOf { it.consumedMB },
            totalMB = buckets.sumOf { it.totalMB },
            availableMB = buckets.sumOf { it.availableMB },
            daysLeft = if (cutoff != null) maxOf(0, ChronoUnit.DAYS.between(today, cutoff).toInt()) else 0,
            cutoffDate = if (cutoff != null) "${cutoff.dayOfMonth} de ${MONTHS_ES[cutoff.monthValue - 1]}" else "",
            cutoffISO = cutoff?.toString(),
            planName = if (isUnlimited) "Bait Ilimitado" else "Mi Bait",
            promo = buckets.any { it.id == "Benefits" },
            buckets = buckets,
            updatedAt = "%02d:%02d".format(now.hour, now.minute)
        )
    }

    /** Equivalente a `Number(x) || 0` de JS. */
    private fun number(value: Any?): Double {
        val n = when (value) {
            is Number -> value.toDouble()
            is String -> value.trim().toDoubleOrNull() ?: 0.0
            else -> 0.0
        }
        return if (n.isNaN()) 0.0 else n
    }

    /** Veracidad estilo JS para `success` / `unlimited`. */
    private fun truthy(value: Any?): Boolean = when (value) {
        null, JSONObject.NULL -> false
        is Boolean -> value
        is Number -> value.toDouble() != 0.0 && !value.toDouble().isNaN()
        is String -> value.isNotEmpty()
        else -> true
    }
}
