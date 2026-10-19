import WidgetKit
import SwiftUI
import AppIntents

extension TelcelUsageEntry: TimelineEntry {}

// MARK: - 1. AppIntent para Recarga Interactiva desde el Widget (iOS 17+)
struct RefreshTelcelUsageIntent: AppIntent {
    static var title: LocalizedStringResource = "Actualizar Consumo Mi Telcel"

    func perform() async throws -> some IntentResult {
        _ = await TelcelNetworkService.shared.fetchUsage(forceRefresh: true)
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

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            MiTelcelWidgetCardContent(entry: entry)

            Spacer(minLength: 8)

            Button(intent: RefreshTelcelUsageIntent()) {
                Text("\(entry.percentUsed)% usado • ⏱️ \(entry.updatedAtString)\(entry.isCached ? " ☁️" : "")")
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(Color(red: 0.60, green: 0.60, blue: 0.62))
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
