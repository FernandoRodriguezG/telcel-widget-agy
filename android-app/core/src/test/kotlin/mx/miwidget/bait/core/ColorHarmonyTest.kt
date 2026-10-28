package mx.miwidget.bait.core

import org.junit.Assert.assertEquals
import org.junit.Test

class ColorHarmonyTest {
    private fun hue(argb: Int) = ColorHarmony.toHsv(argb)[0]

    @Test
    fun hsvRoundTrip() {
        for (argb in listOf(0xFFFF453A.toInt(), 0xFF32D74B.toInt(), 0xFF2C2C2E.toInt(), 0xFF6750A4.toInt())) {
            assertEquals(Integer.toHexString(argb), argb, ColorHarmony.fromHsv(ColorHarmony.toHsv(argb)))
        }
    }

    @Test
    fun rotatesAtMost15DegreesTowardAccent() {
        val red = 0xFFFF453A.toInt() // ~3°
        val pinkAccent = 0xFFE91E63.toInt() // ~340°: girar hacia atrás, máximo 15°
        assertEquals(351.5f, hue(ColorHarmony.harmonize(red, pinkAccent)), 0.5f) // 3.4° - 23.7°/2

        val green = 0xFF32D74B.toInt() // ~129°
        val tealAccent = 0xFF00897B.toInt() // ~174°: la mitad serían 22°, se limita a 15°
        assertEquals(hue(green) + 15f, hue(ColorHarmony.harmonize(green, tealAccent)), 0.6f)
    }

    @Test
    fun keepsSaturationValueAndAlpha() {
        val red = 0x80FF453A.toInt()
        val result = ColorHarmony.harmonize(red, 0xFF3F51B5.toInt())
        val before = ColorHarmony.toHsv(red)
        val after = ColorHarmony.toHsv(result)
        assertEquals(before[1], after[1], 0.01f)
        assertEquals(before[2], after[2], 0.01f)
        assertEquals(0x80, result ushr 24)
    }

    @Test
    fun grayAccentLeavesColorUntouched() {
        val green = 0xFF32D74B.toInt()
        assertEquals(green, ColorHarmony.harmonize(green, 0xFF808080.toInt()))
    }

    @Test
    fun shortestHueDiffWrapsAround() {
        assertEquals(-20f, ColorHarmony.shortestHueDiff(10f, 350f), 0.001f)
        assertEquals(20f, ColorHarmony.shortestHueDiff(350f, 10f), 0.001f)
    }
}
