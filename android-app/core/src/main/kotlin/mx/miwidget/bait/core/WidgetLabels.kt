package mx.miwidget.bait.core

import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

enum class DaysLevel { ALERT, WARN, NORMAL }

/** Textos del widget Small, equivalentes a `createWidget` de src/MiBaitWidget.js. */
data class WidgetLabels(
    val brand: String,
    val cutoff: String,
    val days: String,
    val daysLevel: DaysLevel,
    /** Proporción gastada 0..1, o null cuando `totalMB == 0` (solo riel gris). */
    val spentRatio: Float?,
    val main: String,
    val sub: String,
    val spent: String,
    val pace: String,
    val footer: String
) {
    companion object {
        fun from(data: BaitUsage): WidgetLabels {
            val remainingMB = max(0.0, data.availableMB)
            val ratio = if (data.totalMB > 0) min(1.0, max(0.0, data.consumedMB / data.totalMB)) else 0.0
            val dailyMB = remainingMB / max(1, data.daysLeft)
            val pace = if (dailyMB >= 1024) "${fmt(dailyMB / 1024, 2)} GB/d" else "${jsRound(dailyMB)} MB/d"
            val spent = if (data.consumedMB < 1024) "${jsRound(data.consumedMB)} MB" else "${fmt(data.consumedMB / 1024, 2)} GB"
            val shortCutoff = data.cutoffDate.replace(SHORT_MONTH, " $1")
            val cache = if (data.fromCache) " ☁️" else ""
            return WidgetLabels(
                brand = "Mi Bait",
                cutoff = if (shortCutoff.isNotEmpty()) "Vigencia $shortCutoff" else "",
                days = "${data.daysLeft} ${if (data.daysLeft == 1) "día" else "días"}",
                daysLevel = when {
                    data.daysLeft <= 2 -> DaysLevel.ALERT
                    data.daysLeft <= 5 -> DaysLevel.WARN
                    else -> DaysLevel.NORMAL
                },
                spentRatio = if (data.totalMB > 0) ratio.toFloat() else null,
                main = "${fmt(remainingMB / 1024, 2)} GB",
                sub = "libres de ${fmt(data.totalMB / 1024, 1)} GB",
                spent = "● $spent (${jsRound(ratio * 100)}%)",
                pace = "● $pace",
                footer = "${if (data.promo) "Plan+Bono" else data.planName} • ⏱ ${data.updatedAt}$cache"
            )
        }

        private val SHORT_MONTH = Regex("""\s+de\s+([a-záéíóú]{3})[a-záéíóú]*""", RegexOption.IGNORE_CASE)

        private fun fmt(value: Double, decimals: Int) = String.format(Locale.US, "%.${decimals}f", value)

        /** `Math.round` de JS (mitades hacia +∞). */
        private fun jsRound(value: Double) = kotlin.math.floor(value + 0.5).roundToInt()
    }
}
