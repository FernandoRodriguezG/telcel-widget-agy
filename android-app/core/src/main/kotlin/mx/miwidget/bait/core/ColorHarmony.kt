package mx.miwidget.bait.core

import kotlin.math.abs
import kotlin.math.min

/**
 * Armoniza un color semántico (rojo gastado / verde disponible) con el acento de Material You:
 * gira su tono hacia el del acento como máximo 15° (la mitad de la diferencia), conservando
 * saturación y brillo para que el semáforo se siga leyendo igual. Colores en ARGB.
 */
object ColorHarmony {
    private const val MAX_ROTATION = 15f

    fun harmonize(designArgb: Int, sourceArgb: Int): Int {
        val design = toHsv(designArgb)
        val source = toHsv(sourceArgb)
        // Un acento gris no tiene tono: no hay hacia dónde girar
        if (source[1] < 0.05f || source[2] < 0.05f) return designArgb
        val diff = shortestHueDiff(design[0], source[0])
        val rotation = min(abs(diff) * 0.5f, MAX_ROTATION) * if (diff >= 0) 1 else -1
        design[0] = ((design[0] + rotation) % 360f + 360f) % 360f
        return fromHsv(design, designArgb ushr 24)
    }

    /** Diferencia de tono con signo de [from] a [to], en (-180, 180]. */
    internal fun shortestHueDiff(from: Float, to: Float): Float {
        val d = ((to - from) % 360f + 360f) % 360f
        return if (d > 180f) d - 360f else d
    }

    internal fun toHsv(argb: Int): FloatArray {
        val r = (argb shr 16 and 0xFF) / 255f
        val g = (argb shr 8 and 0xFF) / 255f
        val b = (argb and 0xFF) / 255f
        val max = maxOf(r, g, b)
        val delta = max - minOf(r, g, b)
        val hue = when {
            delta == 0f -> 0f
            max == r -> 60f * (((g - b) / delta) % 6f)
            max == g -> 60f * ((b - r) / delta + 2f)
            else -> 60f * ((r - g) / delta + 4f)
        }
        return floatArrayOf((hue + 360f) % 360f, if (max == 0f) 0f else delta / max, max)
    }

    internal fun fromHsv(hsv: FloatArray, alpha: Int = 0xFF): Int {
        val (h, s, v) = Triple(hsv[0], hsv[1], hsv[2])
        val c = v * s
        val x = c * (1 - abs((h / 60f) % 2f - 1))
        val m = v - c
        val (r, g, b) = when ((h / 60f).toInt()) {
            0 -> Triple(c, x, 0f)
            1 -> Triple(x, c, 0f)
            2 -> Triple(0f, c, x)
            3 -> Triple(0f, x, c)
            4 -> Triple(x, 0f, c)
            else -> Triple(c, 0f, x)
        }
        fun channel(value: Float) = Math.round((value + m) * 255f).coerceIn(0, 255)
        return (alpha shl 24) or (channel(r) shl 16) or (channel(g) shl 8) or channel(b)
    }
}
