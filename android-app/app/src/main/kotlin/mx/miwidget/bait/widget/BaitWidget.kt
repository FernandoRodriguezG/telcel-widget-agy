package mx.miwidget.bait.widget

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import mx.miwidget.bait.MainActivity
import mx.miwidget.bait.core.DaysLevel
import mx.miwidget.bait.core.WidgetLabels
import mx.miwidget.bait.data.PhoneStore
import mx.miwidget.bait.data.UsageCache
import mx.miwidget.bait.work.RefreshWorker

/** Widget Small de Mi Bait. Tocarlo fuerza una actualización; sin datos abre la app. */
class BaitWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val hasPhone = PhoneStore(context).get() != null
        val usage = if (hasPhone) UsageCache(context).load() else null
        val labels = usage?.let(WidgetLabels::from)
        val gauge = labels?.let(GaugeRenderer::render)
        val stats = labels?.let(GaugeRenderer::renderStats)
        provideContent {
            when {
                !hasPhone -> ErrorContent("Toca aquí para configurar tu número Bait.")
                labels == null || gauge == null || stats == null ->
                    ErrorContent("No pudimos cargar tus datos. Abre Mi Bait Widget para revisar tu conexión o número.")
                else -> UsageContent(labels, gauge, stats)
            }
        }
    }
}

class BaitWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = BaitWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        RefreshWorker.schedule(context)
    }
}

class RefreshAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        RefreshWorker.refreshNow(context)
    }
}

private fun style(color: Int, size: TextUnit, weight: FontWeight = FontWeight.Normal, align: TextAlign = TextAlign.Start) =
    TextStyle(color = ColorProvider(Color(color)), fontSize = size, fontWeight = weight, textAlign = align)

@Composable
private fun UsageContent(labels: WidgetLabels, gauge: Bitmap, stats: Bitmap) {
    val daysColor = when (labels.daysLevel) {
        DaysLevel.ALERT -> WidgetColors.SPENT
        DaysLevel.WARN -> WidgetColors.WARN
        DaysLevel.NORMAL -> WidgetColors.WHITE
    }
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Color(WidgetColors.BG))
            .padding(start = 13.dp, top = 11.dp, end = 13.dp, bottom = 10.dp)
            .clickable(actionRunCallback<RefreshAction>())
    ) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(labels.brand, style = style(WidgetColors.WHITE, 11.sp, FontWeight.Bold), maxLines = 1)
                if (labels.cutoff.isNotEmpty()) {
                    Text(labels.cutoff, style = style(WidgetColors.SUBTITLE, 9.5.sp), maxLines = 1)
                }
            }
            Box(
                modifier = GlanceModifier
                    .background(Color(WidgetColors.PILL))
                    .cornerRadius(7.dp)
                    .padding(horizontal = 7.dp, vertical = 3.dp)
            ) {
                Text(labels.days, style = style(daysColor, 13.sp, FontWeight.Bold), maxLines = 1)
            }
        }
        Spacer(GlanceModifier.height(4.dp))
        Image(
            provider = ImageProvider(gauge),
            contentDescription = "${labels.main} ${labels.sub}",
            modifier = GlanceModifier.fillMaxWidth().defaultWeight(),
            contentScale = ContentScale.Fit
        )
        Spacer(GlanceModifier.height(4.dp))
        Image(
            provider = ImageProvider(stats),
            contentDescription = "Gastado ${labels.spent.removePrefix("● ")}, diario ${labels.pace.removePrefix("● ")}",
            modifier = GlanceModifier.fillMaxWidth().height(14.dp),
            contentScale = ContentScale.Fit
        )
        Spacer(GlanceModifier.height(3.dp))
        Text(labels.footer, style = style(WidgetColors.SUBTITLE, 9.5.sp), maxLines = 1)
    }
}

@Composable
private fun ErrorContent(message: String) {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Color(WidgetColors.BG))
            .padding(12.dp)
            .clickable(actionStartActivity<MainActivity>()),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("⚠️", style = style(WidgetColors.WHITE, 24.sp, align = TextAlign.Center))
        Spacer(GlanceModifier.height(8.dp))
        Text(message, style = style(WidgetColors.WHITE, 12.sp, FontWeight.Medium, TextAlign.Center))
    }
}
