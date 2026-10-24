package mx.miwidget.bait.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import mx.miwidget.bait.core.WidgetLabels
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min

/**
 * Dibuja el medidor semicircular igual que `drawSemicircleGauge` de Scriptable:
 * riel gris, gastado en rojo a la izquierda y disponible en verde a la derecha.
 */
object GaugeRenderer {
    private const val WIDTH = 360
    private const val HEIGHT = 182
    private const val CX = WIDTH / 2f
    private const val CY = 152f
    private const val RADIUS = 124f
    private const val THICKNESS = 24f
    private const val STATS_HEIGHT = 34

    fun render(labels: WidgetLabels): Bitmap {
        val bitmap = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val oval = RectF(CX - RADIUS, CY - RADIUS, CX + RADIUS, CY + RADIUS)
        val arcPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = THICKNESS
            strokeCap = Paint.Cap.ROUND
        }

        fun arc(start: Double, end: Double, color: Int) {
            if (end - start <= 0.005) return
            arcPaint.color = color
            canvas.drawArc(oval, Math.toDegrees(start).toFloat(), Math.toDegrees(end - start).toFloat(), false, arcPaint)
        }

        arc(PI, 2 * PI, WidgetColors.TRACK)
        labels.spentRatio?.let { ratio ->
            val clamped = ratio.toDouble().coerceIn(0.0, 1.0)
            val split = PI + clamped * PI
            val gap = if (clamped > 0.04 && clamped < 0.96) 0.11 else 0.0
            if (clamped > 0.005) arc(PI, max(PI + 0.01, split - gap), WidgetColors.SPENT)
            if (clamped < 0.995) arc(min(2 * PI - 0.01, split + gap), 2 * PI, WidgetColors.AVAILABLE)
        }

        centeredText(canvas, labels.main, 50f, Typeface.DEFAULT_BOLD, WidgetColors.WHITE, top = 68f, height = 58f)
        centeredText(
            canvas, labels.sub, 22f, Typeface.create(Typeface.DEFAULT, Typeface.NORMAL), WidgetColors.SUBTITLE,
            top = 126f, height = 30f
        )
        return bitmap
    }

    /**
     * Fila "● gastado" (rojo, izquierda) / "● presupuesto diario" (verde, derecha) como imagen:
     * se escala al ancho del widget en vez de truncarse, igual que `minimumScaleFactor` en iOS.
     */
    fun renderStats(labels: WidgetLabels): Bitmap {
        val bitmap = Bitmap.createBitmap(WIDTH, STATS_HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val medium = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        val left = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = WidgetColors.SPENT
            typeface = medium
            textSize = 26f
        }
        val right = Paint(left).apply {
            color = WidgetColors.AVAILABLE
            textAlign = Paint.Align.RIGHT
        }
        val minGap = 12f
        while (left.measureText(labels.spent) + right.measureText(labels.pace) + minGap > WIDTH && left.textSize > 12f) {
            left.textSize -= 1f
            right.textSize = left.textSize
        }
        val baseline = STATS_HEIGHT / 2f - (left.ascent() + left.descent()) / 2
        canvas.drawText(labels.spent, 0f, baseline, left)
        canvas.drawText(labels.pace, WIDTH.toFloat(), baseline, right)
        return bitmap
    }

    private fun centeredText(canvas: Canvas, text: String, size: Float, typeface: Typeface, color: Int, top: Float, height: Float) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            this.typeface = typeface
            textAlign = Paint.Align.CENTER
            textSize = size
        }
        val maxWidth = WIDTH - 60f
        while (paint.measureText(text) > maxWidth && paint.textSize > 10f) paint.textSize -= 1f
        val baseline = top + height / 2 - (paint.ascent() + paint.descent()) / 2
        canvas.drawText(text, CX, baseline, paint)
    }
}
