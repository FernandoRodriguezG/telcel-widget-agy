import SwiftUI
import WidgetKit

@main
struct MiTelcelApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @State private var phone: String
    @State private var password: String
    @State private var entry: TelcelUsageEntry = .sample
    @State private var isLoading = false

    init() {
        let creds = TelcelNetworkService.loadCredentials()
        _phone = State(initialValue: creds.phone)
        _password = State(initialValue: creds.password)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    VStack(alignment: .leading, spacing: 0) {
                        MiTelcelWidgetCardContent(entry: entry)
                        Spacer(minLength: 8)
                        Text(entry.footerText)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .padding(16)
                    .frame(width: 170, height: 170)
                    .background(Color(red: 0.07, green: 0.07, blue: 0.07))
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .shadow(radius: 8)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Cuenta Mi Telcel")
                            .font(.headline)
                        TextField("Número a 10 dígitos", text: $phone)
                            .keyboardType(.numberPad)
                            .textFieldStyle(.roundedBorder)
                        SecureField("Contraseña Mi Telcel", text: $password)
                            .textFieldStyle(.roundedBorder)
                    }
                    .padding(.horizontal)

                    // Desglose de Bolsas (Plan Base + Datos Promocionales)
                    VStack(alignment: .leading, spacing: 12) {
                        Text("\(entry.planName) • Corte: \(entry.cutoffDate.isEmpty ? "N/A" : entry.cutoffDate)")
                            .font(.headline)

                        ForEach(entry.buckets, id: \.id) { bucket in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(bucket.name)
                                        .font(.subheadline.bold())
                                    Spacer()
                                    Text(String(format: "%.2f GB disp.", bucket.availableMB / 1000.0))
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                                Text(String(format: "Usados: %.2f GB de %.1f GB", bucket.consumedMB / 1000.0, bucket.totalMB / 1000.0))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(12)
                            .background(Color.white.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                    .padding(.horizontal)

                    Button {
                        Task {
                            isLoading = true
                            entry = await TelcelNetworkService.shared.fetchUsage(
                                forceRefresh: true,
                                overridePhone: phone,
                                overridePassword: password
                            )
                            phone = TelcelNetworkService.loadCredentials().phone
                            WidgetCenter.shared.reloadAllTimelines()
                            isLoading = false
                        }
                    } label: {
                        Label(isLoading ? "Actualizando..." : "Actualizar Consumo Ahora", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 0.56, green: 0.82, blue: 0.31))
                    .disabled(isLoading)
                    .padding(.horizontal)
                }
                .padding(.vertical, 24)
            }
            .navigationTitle("Mi Telcel Widget")
        }
        .preferredColorScheme(.dark)
    }
}
