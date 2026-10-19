import WidgetKit
import SwiftUI
import AppIntents

extension TelcelUsageEntry: TimelineEntry {}

// MARK: - 1. AppIntent para Recarga Interactiva desde el Widget (iOS 17+)
struct RefreshTelcelUsageIntent: AppIntent {
    static var title: LocalizedStringResource = "Actualizar Consumo Mi Telcel"

    func perform() async throws -> some IntentResult {
        WidgetCenter.shared.reloadTimelines(ofKind: "MiTelcelUsageWidget")
        return .result()
    }
}

// MARK: - 2. TimelineProvider
struct MiTelcelTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> TelcelUsageEntry {
        .sample
    }

    func getSnapshot(in context: Context, completion: @escaping (TelcelUsageEntry) -> Void) {
        completion(.sample)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TelcelUsageEntry>) -> Void) {
        Task {
            let entry = await TelcelNetworkService.shared.fetchUsage()
            let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: .now)!
            let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
            completion(timeline)
        }
    }
}

// MARK: - 3. Vista SwiftUI (Total Plan + Promo, Consumo y Fecha de Corte)
public struct MiTelcelWidgetView: View {
    public var entry: TelcelUsageEntry

    public init(entry: TelcelUsageEntry) {
        self.entry = entry
    }

    private let brandGreen = Color(red: 0.56, green: 0.82, blue: 0.31)
    private let warnYellow = Color(red: 0.99, green: 0.79, blue: 0.20)
    private let alertRed = Color(red: 0.85, green: 0.19, blue: 0.15)
    private let subtitleGray = Color(red: 0.60, green: 0.60, blue: 0.62)
    private let trackGray = Color(red: 0.23, green: 0.23, blue: 0.24)

    private var accentColor: Color {
        if entry.percentUsed >= 85 { return alertRed }
        if entry.percentUsed >= 65 { return warnYellow }
        return brandGreen
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Fila 1: Cabecera ("Mi Telcel" + "Faltan 9d (28 de octubre)")
            HStack(alignment: .firstTextBaseline) {
                Text("Mi Telcel")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(accentColor)
                Spacer()
                Text(entry.validityLabel)
                    .font(.system(size: 10, weight: .regular))
                    .foregroundStyle(subtitleGray)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }

            Spacer(minLength: 6)

            // Fila 2: Gigabytes Restantes Totales (Plan + Promo)
            Text(String(format: "%.2f GB", entry.remainingGB))
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(.white)
                .minimumScaleFactor(0.75)
                .lineLimit(1)

            Spacer(minLength: 3)

            // Fila 3: Subtítulo de Consumo y Cuota Total Combinada
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.consumedFormatted)
                Text(entry.totalLabel)
            }
            .font(.system(size: 11, weight: .regular))
            .foregroundStyle(subtitleGray)
            .lineLimit(1)
            .minimumScaleFactor(0.8)

            Spacer(minLength: 10)

            // Fila 4: Barra de Progreso Personalizada con Indicador Circular
            GeometryReader { geo in
                let height: CGFloat = 8
                let maxTravel = max(0, geo.size.width - height)
                let offset = maxTravel * entry.usageRatio

                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(trackGray)
                        .frame(height: height)

                    Capsule()
                        .fill(accentColor)
                        .frame(width: offset + height, height: height)
                }
            }
            .frame(height: 8)

            Spacer(minLength: 8)

            // Fila 5: Pie de Página con Botón Interactivo de Recarga
            Button(intent: RefreshTelcelUsageIntent()) {
                Text("\(entry.percentUsed)% usado • ⏱️ \(entry.updatedAtString)\(entry.isCached ? " ☁️" : "")")
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(subtitleGray)
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
        StaticConfiguration(kind: kind, provider: MiTelcelTimelineProvider()) { entry in
            MiTelcelWidgetView(entry: entry)
        }
        .configurationDisplayName("Mi Telcel Consumo")
        .description("Muestra los GB disponibles (Plan + Promo), consumo y fecha de corte de tu plan Telcel.")
        .supportedFamilies([.systemSmall])
    }
}
