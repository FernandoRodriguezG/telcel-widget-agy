import WidgetKit
import SwiftUI
import AppIntents

extension TelcelUsageEntry: TimelineEntry {}

// MARK: - 1. AppIntents para Configuración y Recarga Interactiva desde el Widget (iOS 17+)
struct TelcelWidgetConfigIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Cuenta Mi Telcel"
    static var description = IntentDescription("Opcional: configura tus credenciales directamente en el widget si usas cuenta gratuita sin App Groups.")

    @Parameter(title: "Número (10 dígitos)", default: "")
    var phone: String

    @Parameter(title: "Contraseña Mi Telcel", default: "")
    var password: String
}

struct RefreshTelcelUsageIntent: AppIntent {
    static var title: LocalizedStringResource = "Actualizar Consumo Mi Telcel"

    func perform() async throws -> some IntentResult {
        _ = await TelcelNetworkService.shared.fetchUsage(forceRefresh: true)
        WidgetCenter.shared.reloadTimelines(ofKind: "MiTelcelUsageWidget")
        return .result()
    }
}

// MARK: - 2. TimelineProvider
struct MiTelcelTimelineProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> TelcelUsageEntry {
        .sample
    }

    func snapshot(for configuration: TelcelWidgetConfigIntent, in context: Context) async -> TelcelUsageEntry {
        .sample
    }

    func timeline(for configuration: TelcelWidgetConfigIntent, in context: Context) async -> Timeline<TelcelUsageEntry> {
        let entry = await TelcelNetworkService.shared.fetchUsage(
            overridePhone: configuration.phone,
            overridePassword: configuration.password
        )
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: .now)!
        return Timeline(entries: [entry], policy: .after(nextUpdate))
    }
}

// MARK: - 3. Vista SwiftUI (Total Plan + Promo, Consumo y Fecha de Corte)
public struct MiTelcelWidgetView: View {
    public var entry: TelcelUsageEntry

    public init(entry: TelcelUsageEntry) {
        self.entry = entry
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            MiTelcelWidgetCardContent(entry: entry)

            Spacer(minLength: 8)

            Button(intent: RefreshTelcelUsageIntent()) {
                Text(entry.footerText)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(Color(red: 0.60, green: 0.60, blue: 0.62))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .buttonStyle(.plain)
        }
        .containerBackground(Color(red: 0.07, green: 0.07, blue: 0.07), for: .widget)
    }
}

// MARK: - 4. Configuración Principal del Widget
@main
struct MiTelcelUsageWidget: Widget {
    let kind: String = "MiTelcelUsageWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: TelcelWidgetConfigIntent.self, provider: MiTelcelTimelineProvider()) { entry in
            MiTelcelWidgetView(entry: entry)
        }
        .configurationDisplayName("Mi Telcel Consumo")
        .description("Muestra los GB disponibles (Plan + Promo), consumo y fecha de corte de tu plan Telcel.")
        .supportedFamilies([.systemSmall])
    }
}
