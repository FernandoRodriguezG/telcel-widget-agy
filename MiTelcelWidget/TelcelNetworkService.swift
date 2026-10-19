import Foundation

// MARK: - 1. Modelo de Datos de Consumo (Plan Base + Datos Promocionales + Vigencia)
public struct TelcelBucketUsage: Codable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let consumedMB: Double
    public let totalMB: Double
    public let availableMB: Double
}

public struct TelcelUsageEntry: Codable, Equatable, Sendable {
    public let date: Date
    public let consumedMB: Double
    public let totalMB: Double
    public let availableMB: Double
    public let daysLeft: Int
    public let cutoffDate: String
    public let planName: String
    public let buckets: [TelcelBucketUsage]
    public let updatedAtString: String
    public let isCached: Bool

    public var hasPromo: Bool {
        buckets.count > 1
    }

    public var remainingGB: Double {
        max(0, availableMB / 1000.0)
    }

    public var totalGB: Double {
        totalMB / 1000.0
    }

    public var usageRatio: Double {
        guard totalMB > 0 else { return 0 }
        return min(1.0, max(0.0, consumedMB / totalMB))
    }

    public var percentUsed: Int {
        max(1, Int((usageRatio * 100.0).rounded()))
    }

    public var consumedFormatted: String {
        if consumedMB < 1000 {
            return "\(Int(consumedMB.rounded())) MB consumidos"
        } else {
            return String(format: "%.2f GB consumidos", consumedMB / 1000.0)
        }
    }

    public var totalLabel: String {
        hasPromo
            ? String(format: "de %.1f GB (Plan+Promo)", totalGB)
            : String(format: "de %.1f GB", totalGB)
    }

    public var validityLabel: String {
        cutoffDate.isEmpty
            ? "Faltan \(daysLeft) días"
            : "Faltan \(daysLeft)d (\(cutoffDate))"
    }

    public static let sample = TelcelUsageEntry(
        date: .now,
        consumedMB: 9500,
        totalMB: 15000,
        availableMB: 5474,
        daysLeft: 9,
        cutoffDate: "28 de octubre",
        planName: "Telcel Libre 4",
        buckets: [
            TelcelBucketUsage(id: "0-0-0", name: "Datos de mi plan", consumedMB: 9500, totalMB: 10000, availableMB: 474),
            TelcelBucketUsage(id: "0-1-0", name: "PROMO 50% DE DATOS 24 MDP", consumedMB: 0, totalMB: 5000, availableMB: 5000)
        ],
        updatedAtString: "10:09",
        isCached: false
    )
}

// MARK: - 2. Cliente de Red Autónomo (SSO + JWT + Wave B2F Home Flow)
public actor TelcelNetworkService {
    public static let shared = TelcelNetworkService()

    // Configura aquí tu número a 10 dígitos y contraseña de Mi Telcel
    private let phone = "5512345678"
    private let password = "TU_PASSWORD"
    private let mtlBasic = "bXRwc2VydmljZXM6NyQ4N3JmRnN3ZSQyMV8="
    private let ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
    private let cacheFileName = "telcel_widget_cache.json"

    public func fetchUsage() async -> TelcelUsageEntry {
        var ssoToken: String?
        let session = URLSession(configuration: .ephemeral)
        defer {
            if let token = ssoToken {
                Task { await Self.revokeSSOToken(token, session: session) }
            }
        }

        do {
            // 1. Login SSO en wbl.telcel-id.com:8443/login
            var loginReq = URLRequest(url: URL(string: "https://wbl.telcel-id.com:8443/login")!)
            loginReq.httpMethod = "POST"
            loginReq.setValue("https://wbl.telcel-id.com:8443", forHTTPHeaderField: "Origin")
            loginReq.setValue("https://wbl.telcel-id.com:8443/login?sitedomain=https://www.mitelcel.com&CCode=52&Type=MSISDN&Invocation=iFrame", forHTTPHeaderField: "Referer")
            loginReq.setValue("application/x-www-form-urlencoded; charset=UTF-8", forHTTPHeaderField: "Content-Type")
            loginReq.setValue("XMLHttpRequest", forHTTPHeaderField: "X-Requested-With")
            loginReq.setValue(ua, forHTTPHeaderField: "User-Agent")

            let passClean = password.filter { !$0.isWhitespace }
            let passB64 = Data(passClean.utf8).base64EncodedString()
            var comps = URLComponents()
            comps.queryItems = [
                URLQueryItem(name: "username", value: phone),
                URLQueryItem(name: "telcel-pass", value: password),
                URLQueryItem(name: "sitedomain", value: "https://www.mitelcel.com"),
                URLQueryItem(name: "CCode", value: "52"),
                URLQueryItem(name: "Type", value: "MSISDN"),
                URLQueryItem(name: "Invocation", value: "iFrame"),
                URLQueryItem(name: "MSISDN", value: phone),
                URLQueryItem(name: "Source", value: ""),
                URLQueryItem(name: "pB64", value: passB64),
                URLQueryItem(name: "url", value: "https://wbl.telcel-id.com:8443")
            ]
            loginReq.httpBody = comps.percentEncodedQuery?.data(using: .utf8)

            let (loginData, _) = try await session.data(for: loginReq)
            guard let loginObj = try JSONSerialization.jsonObject(with: loginData) as? [String: Any],
                  let token = loginObj["token"] as? String else {
                throw URLError(.userAuthenticationRequired)
            }
            ssoToken = token

            // 2. Intercambio de Token SSO -> B2F JWT
            var tokenComps = URLComponents(string: "https://mi-telcel.smapps.mx/security/1.0.0/v2/token")!
            tokenComps.queryItems = [
                URLQueryItem(name: "user", value: phone),
                URLQueryItem(name: "token", value: token)
            ]
            var tokenReq = URLRequest(url: tokenComps.url!)
            tokenReq.setValue("Basic \(mtlBasic)", forHTTPHeaderField: "Authorization")
            tokenReq.setValue("token:mit|token:b2f", forHTTPHeaderField: "scope")
            tokenReq.setValue("application/json", forHTTPHeaderField: "Accept")
            tokenReq.setValue("0.14", forHTTPHeaderField: "App-Version")
            tokenReq.setValue("38", forHTTPHeaderField: "Code-Version")
            tokenReq.setValue("DSK", forHTTPHeaderField: "Device-Id")
            tokenReq.setValue("1", forHTTPHeaderField: "tipoRequest")
            tokenReq.setValue("WEB", forHTTPHeaderField: "Os")
            tokenReq.setValue("13", forHTTPHeaderField: "Os-Version")
            tokenReq.setValue("web-browser", forHTTPHeaderField: "X-Channel")
            tokenReq.setValue("ktor-client", forHTTPHeaderField: "User-Agent")

            let (tokenData, _) = try await session.data(for: tokenReq)
            guard let tokenRoot = try JSONSerialization.jsonObject(with: tokenData) as? [String: Any],
                  let tokenResp = tokenRoot["tokenResponse"] as? [String: Any],
                  let tokens = tokenResp["tokens"] as? [[String: Any]],
                  let b2fToken = tokens.first(where: { ($0["id"] as? String) == "token:b2f" })?["access_token"] as? String else {
                throw URLError(.cannotParseResponse)
            }

            // 3. Consulta de Home Flow (Wave B2F: Plan Base + Datos Promocionales + Fecha de Corte)
            let homeURL = URL(string: "https://api.journeys.telcel.wavebybemobi.com/api/components/flow/home?externalCode=52\(phone)")!
            var homeReq = URLRequest(url: homeURL)
            homeReq.setValue("Bearer \(b2fToken)", forHTTPHeaderField: "Authorization")
            homeReq.setValue("application/json", forHTTPHeaderField: "Accept")
            homeReq.setValue("false", forHTTPHeaderField: "X-Is-iPad")
            homeReq.setValue("WEB", forHTTPHeaderField: "x-wave-sdk")
            homeReq.setValue("Desktop", forHTTPHeaderField: "x-wave-device")
            homeReq.setValue("browser", forHTTPHeaderField: "x-wave-device-type")
            homeReq.setValue("macos-web", forHTTPHeaderField: "x-wave-os")
            homeReq.setValue("10.15.7", forHTTPHeaderField: "x-wave-os-version")
            homeReq.setValue(ua, forHTTPHeaderField: "User-Agent")

            let (homeData, _) = try await session.data(for: homeReq)
            let entry = try Self.parseHomeFlowJSON(homeData)
            saveCache(entry)
            return entry
        } catch {
            return loadCache() ?? .sample
        }
    }

    private static func revokeSSOToken(_ token: String, session: URLSession) async {
        guard let url = URL(string: "https://dev.smapps.mx:9000/sso/revoke") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var comps = URLComponents()
        comps.queryItems = [
            URLQueryItem(name: "token", value: token),
            URLQueryItem(name: "token_type", value: "revoke")
        ]
        req.httpBody = comps.percentEncodedQuery?.data(using: .utf8)
        _ = try? await session.data(for: req)
    }

    public static func parseHomeFlowJSON(_ data: Data, now: Date = .now) throws -> TelcelUsageEntry {
        let root = try JSONSerialization.jsonObject(with: data)
        var byId: [String: [String: Any]] = [:]
        var suffixes: [String] = []

        func walk(_ node: Any) {
            if let dict = node as? [String: Any] {
                if let id = dict["id"] as? String, let cfg = dict["config"] as? [String: Any] {
                    byId[id] = cfg
                    if id.hasPrefix("tabs-plans-v2-plan-name-") {
                        let sfx = String(id.dropFirst("tabs-plans-v2-plan-name-".count))
                        if !sfx.isEmpty, sfx.allSatisfy({ $0.isNumber || $0 == "-" }), !suffixes.contains(sfx) {
                            suffixes.append(sfx)
                        }
                    }
                }
                for val in dict.values { walk(val) }
            } else if let arr = node as? [Any] {
                for item in arr { walk(item) }
            }
        }
        walk(root)
        suffixes.sort()

        func toMB(_ val: Any?, unit: Any?) -> Double? {
            guard let raw = val else { return nil }
            let num: Double? = (raw as? Double) ?? (raw as? Int).map(Double.init) ?? (raw as? String).flatMap(Double.init)
            guard let n = num else { return nil }
            let u = ((unit as? String) ?? "MB").uppercased()
            if u == "GB" { return n * 1000.0 }
            if u == "KB" { return n / 1024.0 }
            return n
        }

        var consumedMB = 0.0
        var totalMB = 0.0
        var availableMB = 0.0
        var buckets: [TelcelBucketUsage] = []

        for sfx in (suffixes.isEmpty ? ["0-0-0"] : suffixes) {
            let name = (byId["tabs-plans-v2-plan-name-\(sfx)"]?["value"] as? String) ?? sfx
            let chartArr = byId["tabs-plans-v2-usage-chart-\(sfx)"]?["data"] as? [[String: Any]]
            let chartUsedKB = chartArr?.first(where: { ($0["key"] as? String) == "used" })?["value"] as? Double ?? 0
            let chartAvailKB = chartArr?.first(where: { ($0["key"] as? String) == "available" })?["value"] as? Double ?? 0

            let bUsed = toMB(byId["tabs-plans-v2-used-data-value-\(sfx)"]?["value"],
                             unit: byId["tabs-plans-v2-used-data-unit-\(sfx)"]?["value"]) ?? (chartUsedKB / 1024.0).rounded()
            let bTotal = toMB(byId["tabs-plans-v2-total-data-value-\(sfx)"]?["value"],
                              unit: byId["tabs-plans-v2-total-data-unit-\(sfx)"]?["value"]) ?? ((chartUsedKB + chartAvailKB) / 1024.0).rounded()
            let bAvail = toMB(byId["tabs-plans-v2-available-data-value-\(sfx)"]?["value"],
                              unit: byId["tabs-plans-v2-available-data-unit-\(sfx)"]?["value"]) ?? max(0, bTotal - bUsed)

            if bTotal > 0 || bAvail > 0 {
                consumedMB += bUsed
                totalMB += bTotal
                availableMB += bAvail
                buckets.append(TelcelBucketUsage(
                    id: sfx,
                    name: name,
                    consumedMB: bUsed,
                    totalMB: bTotal,
                    availableMB: bAvail
                ))
            }
        }

        let segments = (byId["tabs-plans-v2-limited-cutoff-message-0-0-0"]?["segments"] as? [[String: Any]]) ?? []
        let cutoffMsg = segments.compactMap { $0["text"] as? String }.joined()
        let daysLeft = cutoffMsg.split(whereSeparator: { !$0.isNumber }).first.flatMap { Int($0) } ?? 28
        let cutoffDate = (byId["plan-details-row-template-col-2-0-0"]?["value"] as? String) ?? ""
        let planName = (byId["text-plan-name"]?["value"] as? String)
            ?? (byId["plan-details-name"]?["value"] as? String)
            ?? "Mi Telcel"

        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"

        return TelcelUsageEntry(
            date: now,
            consumedMB: consumedMB,
            totalMB: totalMB,
            availableMB: availableMB,
            daysLeft: daysLeft,
            cutoffDate: cutoffDate,
            planName: planName,
            buckets: buckets,
            updatedAtString: formatter.string(from: now),
            isCached: false
        )
    }

    private var cacheURL: URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent(cacheFileName)
    }

    private func saveCache(_ entry: TelcelUsageEntry) {
        guard let url = cacheURL, let data = try? JSONEncoder().encode(entry) else { return }
        try? data.write(to: url)
    }

    private func loadCache() -> TelcelUsageEntry? {
        guard let url = cacheURL,
              let data = try? Data(contentsOf: url),
              let cached = try? JSONDecoder().decode(TelcelUsageEntry.self, from: data) else {
            return nil
        }
        return TelcelUsageEntry(
            date: .now,
            consumedMB: cached.consumedMB,
            totalMB: cached.totalMB,
            availableMB: cached.availableMB,
            daysLeft: cached.daysLeft,
            cutoffDate: cached.cutoffDate,
            planName: cached.planName,
            buckets: cached.buckets,
            updatedAtString: cached.updatedAtString,
            isCached: true
        )
    }
}
