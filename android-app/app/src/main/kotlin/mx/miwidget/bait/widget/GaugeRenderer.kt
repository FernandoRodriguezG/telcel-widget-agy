package mx.miwidget.bait.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import mx.miwidget.bait.core.WidgetLabels
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min

/** Capas del medidor, todas del mismo tamaño para apilarse alineadas. `null` = capa vacía. */
class GaugeLayers(val track: Bitmap, val spent: Bitmap?, val available: Bitmap?, val main: Bitmap, val sub: Bitmap)

/** Capas de la fila "● gastado" (izquierda) / "● presupuesto diario" (derecha). */
class StatsLayers(val spent: Bitmap, val pace: Bitmap)

/**
 * Dibuja el medidor semicircular de `drawSemicircleGauge` (Scriptable) como máscaras blancas:
 * el widget tiñe cada capa con `ColorFilter.tint`, así los colores (fijos en el estilo Clásico o
 * dinámicos en Material You) se resuelven en el launcher y siguen al modo claro/oscuro sin redibujar.
 */
object GaugeRenderer {
    private const val WIDTH = 360
    private const val HEIGHT = 182
    private const val CX = WIDTH / 2f
    private const val CY = 152f
    private const val RADIUS = 124f
    private const val THICKNESS = 24f
    private const val STATS_HEIGHT = 34

    fun gauge(labels: WidgetLabels): GaugeLayers {
        val oval = RectF(CX - RADIUS, CY - RADIUS, CX + RADIUS, CY + RADIUS)
        val arcPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = THICKNESS
            strokeCap = Paint.Cap.ROUND
        }

        fun arc(start: Double, end: Double): Bitmap? {
            if (end - start <= 0.005) return null
            return layer(HEIGHT) {
                drawArc(oval, Math.toDegrees(start).toFloat(), Math.toDegrees(end - start).toFloat(), false, arcPaint)
            }
        }

        var spent: Bitmap? = null
        var available: Bitmap? = null
        labels.spentRatio?.let { ratio ->
            val clamped = ratio.toDouble().coerceIn(0.0, 1.0)
            val split = PI + clamped * PI
            val gap = if (clamped > 0.04 && clamped < 0.96) 0.11 else 0.0
            if (clamped > 0.005) spent = arc(PI, max(PI + 0.01, split - gap))
            if (clamped < 0.995) available = arc(min(2 * PI - 0.01, split + gap), 2 * PI)
        }

        return GaugeLayers(
            track = arc(PI, 2 * PI)!!,
            spent = spent,
            available = available,
            main = layer(HEIGHT) { centeredText(labels.main, 50f, Typeface.DEFAULT_BOLD, top = 68f, height = 58f) },
            sub = layer(HEIGHT) { centeredText(labels.sub, 22f, Typeface.DEFAULT, top = 126f, height = 30f) }
        )
    }

    /** Se escala al ancho del widget en vez de truncarse, igual que `minimumScaleFactor` en iOS. */
    fun stats(labels: WidgetLabels): StatsLayers {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            textSize = 26f
        }
        val minGap = 12f
        while (paint.measureText(labels.spent) + paint.measureText(labels.pace) + minGap > WIDTH && paint.textSize > 12f) {
            paint.textSize -= 1f
        }
        val baseline = STATS_HEIGHT / 2f - (paint.ascent() + paint.descent()) / 2
        return StatsLayers(
            spent = layer(STATS_HEIGHT) { drawText(labels.spent, 0f, baseline, paint) },
            pace = layer(STATS_HEIGHT) {
                drawText(labels.pace, WIDTH - paint.measureText(labels.pace), baseline, paint)
            }
        )
    }

    private inline fun layer(height: Int, draw: Canvas.() -> Unit): Bitmap =
        Bitmap.createBitmap(WIDTH, height, Bitmap.Config.ARGB_8888).also { Canvas(it).draw() }

    private fun Canvas.centeredText(text: String, size: Float, typeface: Typeface, top: Float, height: Float) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            this.typeface = typeface
            textAlign = Paint.Align.CENTER
            textSize = size
        }
        val maxWidth = WIDTH - 60f
        while (paint.measureText(text) > maxWidth && paint.textSize > 10f) paint.textSize -= 1f
        val baseline = top + height / 2 - (paint.ascent() + paint.descent()) / 2
        drawText(text, CX, baseline, paint)
    }
}
