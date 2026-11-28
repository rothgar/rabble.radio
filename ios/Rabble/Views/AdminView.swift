import SwiftUI

/// Platform overview and user moderation, behind the "Admin" button on My
/// shows for ADMIN_DIDS accounts only. Mirrors /admin on the web: overview
/// counts plus ban/unban/kick for each user (GET+POST /api/admin/...).
struct AdminView: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var data: AdminOverviewResponse?
    @State private var error: String?
    @State private var pendingDid: String?
    @State private var actionError: String?
    @State private var banTarget: AdminUserRow?
    @State private var banReason = ""

    var body: some View {
        Group {
            if let data {
                content(data)
            } else if let error {
                ErrorPanel(message: error) { await load() }
            } else {
                Loading()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RabbleColors.bg.ignoresSafeArea())
        .navigationTitle("Admin")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) { FeedbackButton(showId: nil) }
        }
        .alert(
            "Ban this account from the platform?",
            isPresented: Binding(get: { banTarget != nil }, set: { if !$0 { banTarget = nil } })
        ) {
            TextField("Reason (optional)", text: $banReason)
            Button("Cancel", role: .cancel) { banTarget = nil }
            Button("Ban", role: .destructive) {
                let reason = banReason.trimmingCharacters(in: .whitespaces)
                if let did = banTarget?.did { act(did: did, action: "ban", reason: reason.isEmpty ? nil : reason) }
                banTarget = nil
            }
        }
        .task { await load() }
        .onAppear { Diagnostics.screen = "admin" }
    }

    private func load() async {
        do {
            data = try await env.api.adminOverview()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func act(did: String, action: String, reason: String? = nil) {
        if pendingDid != nil { return }
        pendingDid = did
        actionError = nil
        Task {
            do {
                try await env.api.adminAction(did: did, action: action, reason: reason)
                await load()
            } catch {
                actionError = error.localizedDescription
            }
            pendingDid = nil
        }
    }

    @ViewBuilder
    private func content(_ data: AdminOverviewResponse) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text("Running build \(data.overview.buildId ?? "unknown").")
                    .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary)
                overviewGrid(data.overview)
                SectionLabel(text: "USERS · \(data.users.count)")
                if data.users.isEmpty {
                    Text("No users yet.")
                        .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary).card()
                }
                if let actionError {
                    Text(actionError).font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.live)
                }
                ForEach(data.users) { row in userRow(row) }
            }
            .frame(maxWidth: contentMaxWidth)
            .padding(16)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
    }

    private func overviewGrid(_ overview: AdminOverview) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 12)], spacing: 12) {
            stat("Users", overview.totalUsers)
            stat("Banned", overview.bannedUsers)
            stat("Shows", overview.totalShows)
            stat("Live now", overview.liveNow)
            stat("Live shows run", overview.totalSessions)
        }
    }

    private func stat(_ label: String, _ value: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary)
            Text("\(value)").font(RabbleFont.style(.title2, .bold))
        }
        .card()
    }

    private func userRow(_ row: AdminUserRow) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(row.handle.isEmpty ? row.did : "@\(row.handle)").font(RabbleFont.style(.body, .semibold))
                    if row.bannedAt != nil { Pill(text: "banned") }
                }
                Text(row.did).font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textTertiary)
                if row.bannedAt != nil, let reason = row.banReason {
                    Text("reason: \(reason)").font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary)
                }
            }
            HStack(spacing: 8) {
                Button(pendingDid == row.did ? "…" : "Kick") { act(did: row.did, action: "kick") }
                    .buttonStyle(.bordered).disabled(pendingDid != nil).wideButton(height: 44)
                if row.bannedAt != nil {
                    Button(pendingDid == row.did ? "…" : "Unban") { act(did: row.did, action: "unban") }
                        .buttonStyle(.bordered).disabled(pendingDid != nil).wideButton(height: 44)
                } else {
                    Button(pendingDid == row.did ? "…" : "Ban") { banReason = ""; banTarget = row }
                        .buttonStyle(.bordered)
                        .foregroundStyle(RabbleColors.live)
                        .disabled(pendingDid != nil)
                        .wideButton(height: 44)
                }
            }
        }
        .card()
    }
}
