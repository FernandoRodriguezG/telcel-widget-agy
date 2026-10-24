package mx.miwidget.bait.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

class WidgetLabelsTest {
    private fun expected(name: String) = BaitUsage.fromJson(
        JSONObject(File(System.getProperty("baitFixturesDir"), name).readText()).getJSONObject("expected")
    )

    @Test
    fun labelsMatchScriptableWidget() {
        val labels = WidgetLabels.from(expected("plan_mas_bono.json"))
        assertEquals("Mi Bait", labels.brand)
        assertEquals("Vigencia 1 nov", labels.cutoff)
        assertEquals("12 días", labels.days)
        assertEquals(DaysLevel.NORMAL, labels.daysLevel)
        assertEquals("11.00 GB", labels.main)
        assertEquals("libres de 15.0 GB", labels.sub)
        assertEquals("● 4.00 GB (27%)", labels.spent)
        assertEquals("● 939 MB/d", labels.pace)
        assertEquals("Plan+Bono • ⏱ 10:09", labels.footer)
    }

    @Test
    fun cacheAndTrafficLightStates() {
        val data = expected("ilimitado_fair_use.json").copy(fromCache = true)
        val labels = WidgetLabels.from(data)
        assertEquals("0 días", labels.days)
        assertEquals(DaysLevel.ALERT, labels.daysLevel)
        assertEquals("● 5.00 GB/d", labels.pace)
        assertEquals("Bait Ilimitado • ⏱ 07:05 ☁️", labels.footer)
        assertEquals(DaysLevel.WARN, WidgetLabels.from(data.copy(daysLeft = 5)).daysLevel)
        assertEquals("1 día", WidgetLabels.from(data.copy(daysLeft = 1)).days)
    }

    @Test
    fun emptyPlanShowsOnlyTrack() {
        val data = expected("sin_vigencia.json").copy(totalMB = 0.0, consumedMB = 0.0, availableMB = 0.0)
        val labels = WidgetLabels.from(data)
        assertNull(labels.spentRatio)
        assertEquals("", labels.cutoff)
        assertEquals("● 0 MB (0%)", labels.spent)
    }
}
