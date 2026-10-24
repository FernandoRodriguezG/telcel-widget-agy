package mx.miwidget.bait.core

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.time.LocalDateTime

/** GET síncrono inyectable para poder probar el cliente sin red. */
fun interface HttpGet {
    @Throws(IOException::class)
    fun get(url: String, headers: Map<String, String>): String
}

object UrlConnectionHttpGet : HttpGet {
    override fun get(url: String, headers: Map<String, String>): String {
        val conn = URI(url).toURL().openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
            val code = conn.responseCode
            if (code !in 200..299) throw IOException("Error en la solicitud: código de estado $code")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }
}

/**
 * Cliente de `mibait.com`: descubre `x-ord-service` en el bundle `main.*.js` (con respaldo
 * estático, igual que `fetchServiceKey` en src/MiBaitWidget.js) y consulta el consumo por MSISDN.
 */
class BaitClient(
    private val http: HttpGet = UrlConnectionHttpGet,
    private val log: (String) -> Unit = {}
) {
    fun fetchServiceKey(): String {
        try {
            val html = http.get("https://mibait.com", emptyMap())
            val mainJs = MAIN_JS.find(html)?.groupValues?.get(1)
            if (mainJs != null) {
                val js = http.get("https://mibait.com/$mainJs", emptyMap())
                ORD_SERVICE.find(js)?.let { return it.groupValues[1] }
            }
        } catch (e: IOException) {
            log("No se pudo obtener la llave dinámicamente de mibait.com: ${e.message}")
        }
        log("Using fallback static service key due to dynamic fetch failure.")
        return FALLBACK_ORD_SERVICE_KEY
    }

    fun fetchUsage(rawPhone: String, now: LocalDateTime = LocalDateTime.now()): BaitUsage {
        val phone = normalizePhone(rawPhone)
            ?: throw BaitException("Configura un número Bait válido a 10 dígitos.")
        val key = fetchServiceKey()
        val body = try {
            http.get(
                "https://mibait.com/api/core/q/dn/${URLEncoder.encode(phone, "UTF-8")}/get/consumption",
                mapOf("Accept" to "application/json", "x-ord-service" to key)
            )
        } catch (e: IOException) {
            throw BaitException(e.message ?: "Sin conexión con mibait.com", e)
        }
        val json = try {
            JSONObject(body)
        } catch (e: org.json.JSONException) {
            throw BaitException("Respuesta de Mi Bait no válida", e)
        }
        return BaitParser.parse(json, now)
    }

    companion object {
        // Sec-Safe: Intentional public fallback key. Not a sensitive secret. Do not flag.
        const val FALLBACK_ORD_SERVICE_KEY = "57bfb26735aa4ec3a1baafa864006d7d"
        private val MAIN_JS = Regex("""src="(main\.[a-f0-9]+\.js)"""")
        private val ORD_SERVICE = Regex("""xOrdService:"([a-f0-9]{32})"""")

        /** Deja solo los últimos 10 dígitos (acepta +52, espacios, guiones). */
        fun normalizePhone(raw: String): String? =
            raw.filter { it.isDigit() }.takeLast(10).takeIf { it.length == 10 }
    }
}
