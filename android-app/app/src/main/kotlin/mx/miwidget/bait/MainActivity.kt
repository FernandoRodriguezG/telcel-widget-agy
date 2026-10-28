package mx.miwidget.bait

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.selection.selectable
import androidx.compose.ui.Alignment
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.miwidget.bait.core.BaitClient
import mx.miwidget.bait.core.BaitUsage
import mx.miwidget.bait.core.WidgetLabels
import mx.miwidget.bait.data.PhoneStore
import mx.miwidget.bait.data.UsageCache
import mx.miwidget.bait.widget.BaitWidget
import mx.miwidget.bait.widget.BaitWidgetReceiver
import mx.miwidget.bait.widget.WidgetStyle
import mx.miwidget.bait.work.RefreshWorker

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Íconos de la barra de estado legibles en modo claro y oscuro
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = appColorScheme()) {
                Surface(modifier = Modifier.fillMaxSize()) { SetupScreen() }
            }
        }
    }
}

@Composable
private fun SetupScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val phoneStore = remember { PhoneStore(context) }
    val cache = remember { UsageCache(context) }

    var savedPhone by remember { mutableStateOf(phoneStore.get()) }
    var usage by remember { mutableStateOf(cache.load()) }
    var input by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf(cache.lastError()?.let { "Última actualización fallida: $it" }) }

    // Valida el número contra /get/consumption antes de guardarlo (como validateBaitPhone en iOS)
    fun fetch(phone: String, persist: Boolean) {
        scope.launch {
            busy = true
            message = null
            try {
                val result = withContext(Dispatchers.IO) { BaitClient().fetchUsage(phone) }
                if (persist) {
                    phoneStore.save(phone)
                    savedPhone = phone
                    input = ""
                }
                cache.save(result)
                RefreshWorker.schedule(context)
                usage = cache.load()
                message = "Listo. El widget se actualiza cada hora o al tocarlo."
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (!persist) cache.markStale(e.message ?: "Error")
                usage = cache.load()
                message = e.message
            } finally {
                BaitWidget().updateAll(context)
                busy = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Mi Bait Widget", style = MaterialTheme.typography.headlineMedium)

        val phone = savedPhone
        if (phone == null) {
            Text(
                "Para mostrar tu consumo en vivo, escribe tu número Bait a 10 dígitos. " +
                    "Se guarda cifrado solo en este teléfono; no se necesita contraseña.",
                style = MaterialTheme.typography.bodyMedium
            )
            OutlinedTextField(
                value = input,
                onValueChange = { value -> input = value.filter { it.isDigit() || it in "+ -" }.take(16) },
                label = { Text("Número Bait") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth()
            )
            Button(
                enabled = !busy,
                onClick = {
                    val normalized = BaitClient.normalizePhone(input)
                    if (normalized == null) message = "Escribe un número Bait válido a 10 dígitos." else fetch(normalized, persist = true)
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text(if (busy) "Validando…" else "Validar y guardar") }
        } else {
            Text("Línea •••• ${phone.takeLast(4)}", style = MaterialTheme.typography.titleMedium)
            usage?.let { UsageCard(it) }
            Button(enabled = !busy, onClick = { fetch(phone, persist = false) }, modifier = Modifier.fillMaxWidth()) {
                Text(if (busy) "Actualizando…" else "Actualizar ahora")
            }
            val widgetManager = remember { AppWidgetManager.getInstance(context) }
            if (widgetManager.isRequestPinAppWidgetSupported) {
                OutlinedButton(
                    onClick = {
                        widgetManager.requestPinAppWidget(ComponentName(context, BaitWidgetReceiver::class.java), null, null)
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Agregar widget a la pantalla de inicio") }
            }
            TextButton(
                enabled = !busy,
                onClick = {
                    phoneStore.clear()
                    cache.clear()
                    RefreshWorker.cancel(context)
                    savedPhone = null
                    usage = null
                    message = "Número borrado."
                    scope.launch { BaitWidget().updateAll(context) }
                }
            ) { Text("Cambiar o borrar número") }
        }

        message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary) }

        var widgetStyle by remember { mutableStateOf(WidgetStyle.load(context)) }
        Text("Estilo del widget", style = MaterialTheme.typography.titleSmall)
        WidgetStyle.entries.forEach { option ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .selectable(selected = widgetStyle == option) {
                        widgetStyle = option
                        WidgetStyle.save(context, option)
                        scope.launch { BaitWidget().updateAll(context) }
                    }
            ) {
                RadioButton(selected = widgetStyle == option, onClick = null)
                Text(
                    when (option) {
                        WidgetStyle.MATERIAL_YOU -> "Material You: colores de tu fondo de pantalla"
                        WidgetStyle.CLASSIC -> "Clásico: negro, como en iOS"
                    },
                    modifier = Modifier.padding(start = 8.dp)
                )
            }
        }

        Text(
            "También puedes agregarlo manualmente: mantén presionado un espacio vacío de tu pantalla de inicio › " +
                "Widgets › Mi Bait Widget.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        val version = remember { context.packageManager.getPackageInfo(context.packageName, 0).versionName }
        Text("Versión $version", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun UsageCard(usage: BaitUsage) {
    val labels = WidgetLabels.from(usage)
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(labels.main, style = MaterialTheme.typography.displaySmall)
            Text(labels.sub, style = MaterialTheme.typography.bodyMedium)
            Text("${labels.days}${if (labels.cutoff.isNotEmpty()) " • ${labels.cutoff}" else ""}")
            Text("Gastado ${labels.spent.removePrefix("● ")} • Diario ${labels.pace.removePrefix("● ")}")
            Text(labels.footer, style = MaterialTheme.typography.bodySmall)
            // Desglose por bolsa para comparar contra la app oficial de Bait
            Text("Desglose", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
            usage.buckets.forEach { bucket ->
                Text(
                    "${bucket.name}: ${mb(bucket.availableMB)} libres de ${mb(bucket.totalMB)} (usados ${mb(bucket.consumedMB)})",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

private fun mb(value: Double) = String.format(java.util.Locale.US, "%.0f MB", value)

/** Colores dinámicos de Material You en Android 12+; paleta base en versiones anteriores. */
@Composable
private fun appColorScheme(): ColorScheme {
    val dark = isSystemInDarkTheme()
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val context = LocalContext.current
        if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    } else {
        if (dark) darkColorScheme() else lightColorScheme()
    }
}
