package mx.miwidget.bait.widget

import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.appWidgetBackground
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
import mx.miwidget.bait.core.ColorHarmony
import mx.miwidget.bait.core.DaysLevel
import mx.miwidget.bait.core.WidgetLabels
import mx.miwidget.bait.data.PhoneStore
import mx.miwidget.bait.data.UsageCache
import mx.miwidget.bait.work.RefreshWorker
import androidx.glance.color.ColorProvider as DayNightColorProvider

/** Widget Small de Mi Bait. Tocarlo fuerza una actualización; sin datos abre la app. */
class BaitWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val hasPhone = PhoneStore(context).get() != null
        val usage = if (hasPhone) UsageCache(context).load() else null
        val labels = usage?.let(WidgetLabels::from)
        val gauge = labels?.let(GaugeRenderer::gauge)
        val stats = labels?.let(GaugeRenderer::stats)
        val style = WidgetStyle.load(context)
        val semantic = SemanticColors.forStyle(context, style)
        provideContent {
            GlanceTheme {
                val palette = if (style == WidgetStyle.CLASSIC) Palette.classic(semantic) else Palette.materialYou(semantic)
                when {
                    !hasPhone -> ErrorContent(palette, "Toca aquí para configurar tu número Bait.")
                    labels == null || gauge == null || stats == null -> ErrorContent(
                        palette,
                        "No pudimos cargar tus datos. Abre Mi Bait Widget para revisar tu conexión o número."
                    )
                    else -> UsageContent(palette, labels, gauge, stats)
                }
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

/** Semáforo gastado / disponible / advertencia. En Material You se armoniza con el acento del fondo. */
private class SemanticColors(val spent: ColorProvider, val available: ColorProvider, val warn: ColorProvider) {
    companion object {
        fun forStyle(context: Context, style: WidgetStyle): SemanticColors {
            if (style == WidgetStyle.CLASSIC) {
                return SemanticColors(fixed(WidgetColors.SPENT), fixed(WidgetColors.AVAILABLE), fixed(WidgetColors.WARN))
            }
            val accent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getColor(android.R.color.system_accent1_500)
            } else {
                null
            }
            fun dayNight(day: Long, night: Long): ColorProvider {
                fun tone(argb: Long) = Color(accent?.let { ColorHarmony.harmonize(argb.toInt(), it) } ?: argb.toInt())
                return DayNightColorProvider(day = tone(day), night = tone(night))
            }
            return SemanticColors(
                spent = dayNight(0xFFC5221F, 0xFFFF6B5F),
                available = dayNight(0xFF188038, 0xFF5CD670),
                warn = dayNight(0xFFB06000, 0xFFFFD60A)
            )
        }
    }
}

private class Palette(
    val background: ColorProvider,
    val pill: ColorProvider,
    val pillText: ColorProvider,
    val title: ColorProvider,
    val subtitle: ColorProvider,
    val track: ColorProvider,
    val semantic: SemanticColors
) {
    companion object {
        fun classic(semantic: SemanticColors) = Palette(
            background = fixed(WidgetColors.BG),
            pill = fixed(WidgetColors.PILL),
            pillText = fixed(WidgetColors.WHITE),
            title = fixed(WidgetColors.WHITE),
            subtitle = fixed(WidgetColors.SUBTITLE),
            track = fixed(WidgetColors.TRACK),
            semantic = semantic
        )

        @Composable
        fun materialYou(semantic: SemanticColors) = Palette(
            background = GlanceTheme.colors.widgetBackground,
            pill = GlanceTheme.colors.secondaryContainer,
            pillText = GlanceTheme.colors.onSecondaryContainer,
            title = GlanceTheme.colors.onSurface,
            subtitle = GlanceTheme.colors.onSurfaceVariant,
            track = GlanceTheme.colors.surfaceVariant,
            semantic = semantic
        )
    }
}

private fun fixed(argb: Int) = ColorProvider(Color(argb))

private fun style(color: ColorProvider, size: TextUnit, weight: FontWeight = FontWeight.Normal, align: TextAlign = TextAlign.Start) =
    TextStyle(color = color, fontSize = size, fontWeight = weight, textAlign = align)

/** Fondo del widget con el radio de esquina del sistema (Android 12+). */
private fun GlanceModifier.widgetBackground(palette: Palette): GlanceModifier {
    val base = fillMaxSize().appWidgetBackground().background(palette.background)
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        base.cornerRadius(android.R.dimen.system_app_widget_background_radius)
    } else {
        base
    }
}

@Composable
private fun Layer(bitmap: Bitmap?, color: ColorProvider, description: String? = null) {
    if (bitmap == null) return
    Image(
        provider = ImageProvider(bitmap),
        contentDescription = description,
        modifier = GlanceModifier.fillMaxSize(),
        contentScale = ContentScale.Fit,
        colorFilter = ColorFilter.tint(color)
    )
}

@Composable
private fun UsageContent(palette: Palette, labels: WidgetLabels, gauge: GaugeLayers, stats: StatsLayers) {
    val daysColor = when (labels.daysLevel) {
        DaysLevel.ALERT -> palette.semantic.spent
        DaysLevel.WARN -> palette.semantic.warn
        DaysLevel.NORMAL -> palette.pillText
    }
    Column(
        modifier = GlanceModifier
            .widgetBackground(palette)
            .padding(start = 13.dp, top = 11.dp, end = 13.dp, bottom = 10.dp)
            .clickable(actionRunCallback<RefreshAction>())
    ) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(labels.brand, style = style(palette.title, 11.sp, FontWeight.Bold), maxLines = 1)
                if (labels.cutoff.isNotEmpty()) {
                    Text(labels.cutoff, style = style(palette.subtitle, 9.5.sp), maxLines = 1)
                }
            }
            Box(
                modifier = GlanceModifier
                    .background(palette.pill)
                    .cornerRadius(7.dp)
                    .padding(horizontal = 7.dp, vertical = 3.dp)
            ) {
                Text(labels.days, style = style(daysColor, 13.sp, FontWeight.Bold), maxLines = 1)
            }
        }
        Spacer(GlanceModifier.height(4.dp))
        Box(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
            Layer(gauge.track, palette.track, "${labels.main} ${labels.sub}")
            Layer(gauge.spent, palette.semantic.spent)
            Layer(gauge.available, palette.semantic.available)
            Layer(gauge.main, palette.title)
            Layer(gauge.sub, palette.subtitle)
        }
        Spacer(GlanceModifier.height(4.dp))
        Box(modifier = GlanceModifier.fillMaxWidth().height(14.dp)) {
            Layer(
                stats.spent, palette.semantic.spent,
                "Gastado ${labels.spent.removePrefix("● ")}, diario ${labels.pace.removePrefix("● ")}"
            )
            Layer(stats.pace, palette.semantic.available)
        }
        Spacer(GlanceModifier.height(3.dp))
        Text(labels.footer, style = style(palette.subtitle, 9.5.sp), maxLines = 1)
    }
}

@Composable
private fun ErrorContent(palette: Palette, message: String) {
    Column(
        modifier = GlanceModifier
            .widgetBackground(palette)
            .padding(12.dp)
            .clickable(actionStartActivity<MainActivity>()),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("⚠️", style = style(palette.title, 24.sp, align = TextAlign.Center))
        Spacer(GlanceModifier.height(8.dp))
        Text(message, style = style(palette.title, 12.sp, FontWeight.Medium, TextAlign.Center))
    }
}
