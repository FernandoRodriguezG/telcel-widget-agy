package mx.miwidget.bait.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.File
import java.io.IOException
import java.time.LocalDateTime

class BaitClientTest {
    private val payload = org.json.JSONObject(
        File(System.getProperty("baitFixturesDir"), "plan_mas_bono.json").readText()
    ).getJSONObject("payload").toString()

    @Test
    fun usesKeyDiscoveredInMainBundle() {
        val seen = mutableListOf<Pair<String, Map<String, String>>>()
        val http = HttpGet { url, headers ->
            seen += url to headers
            when {
                url == "https://mibait.com" -> """<script src="main.abc123.js" type="module"></script>"""
                url == "https://mibait.com/main.abc123.js" -> """x={xOrdService:"0123456789abcdef0123456789abcdef"}"""
                else -> payload
            }
        }
        val usage = BaitClient(http).fetchUsage("+52 55 1234 5678", LocalDateTime.parse("2026-10-20T10:09"))
        assertEquals(11264.0, usage.availableMB, 0.0)
        val (url, headers) = seen.last()
        assertEquals("https://mibait.com/api/core/q/dn/5512345678/get/consumption", url)
        assertEquals("0123456789abcdef0123456789abcdef", headers["x-ord-service"])
    }

    @Test
    fun fallsBackToStaticKeyWhenDiscoveryFails() {
        val logs = mutableListOf<String>()
        val http = HttpGet { url, _ -> if (url.contains("/api/")) payload else throw IOException("offline") }
        assertEquals(BaitClient.FALLBACK_ORD_SERVICE_KEY, BaitClient(http) { logs += it }.fetchServiceKey())
        assertEquals(2, logs.size)
    }

    @Test
    fun networkAndInputErrorsBecomeBaitException() {
        val offline = BaitClient(HttpGet { _, _ -> throw IOException("Error en la solicitud: código de estado 503") })
        val e = assertThrows(BaitException::class.java) { offline.fetchUsage("5512345678") }
        assertEquals("Error en la solicitud: código de estado 503", e.message)
        assertThrows(BaitException::class.java) { offline.fetchUsage("12345") }
        assertThrows(BaitException::class.java) {
            BaitClient(HttpGet { _, _ -> "<html>" }).fetchUsage("5512345678")
        }
    }

    @Test
    fun normalizesPhone() {
        assertEquals("5512345678", BaitClient.normalizePhone("55-1234-5678"))
        assertEquals("5512345678", BaitClient.normalizePhone("+52 1 55 1234 5678"))
        assertNull(BaitClient.normalizePhone("123"))
    }
}
