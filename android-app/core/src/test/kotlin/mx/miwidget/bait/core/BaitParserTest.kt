package mx.miwidget.bait.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime

class BaitParserTest {
    private val fixturesDir = File(
        System.getProperty("baitFixturesDir") ?: error("Falta la propiedad baitFixturesDir")
    )

    private fun fixtures() = fixturesDir.listFiles { f -> f.extension == "json" }!!.sortedBy { it.name }
        .also { assertTrue("No hay fixtures en $fixturesDir", it.isNotEmpty()) }

    @Test
    fun parserMatchesSharedFixtures() {
        for (file in fixtures()) {
            val fx = JSONObject(file.readText())
            val now = LocalDateTime.parse(fx.getString("now"))
            val payload = fx.getJSONObject("payload")
            if (fx.has("expectedError")) {
                try {
                    BaitParser.parse(payload, now)
                    fail("${file.name}: se esperaba error")
                } catch (e: BaitException) {
                    assertEquals(file.name, fx.getString("expectedError"), e.message)
                }
                continue
            }
            val expected = BaitUsage.fromJson(fx.getJSONObject("expected"))
            assertEquals(file.name, expected, BaitParser.parse(payload, now))
        }
    }

    @Test
    fun cacheRoundTripRecalculatesDaysLeft() {
        val fx = JSONObject(File(fixturesDir, "plan_mas_bono.json").readText())
        val usage = BaitParser.parse(fx.getJSONObject("payload"), LocalDateTime.parse(fx.getString("now")))
        val restored = BaitUsage.fromJson(JSONObject(usage.toJson().toString()))
        assertEquals(usage, restored)

        val later = restored.asCached(LocalDate.of(2026, 10, 28))
        assertEquals(4, later.daysLeft)
        assertTrue(later.fromCache)
        assertEquals(0, restored.asCached(LocalDate.of(2026, 11, 5)).daysLeft)
    }
}
