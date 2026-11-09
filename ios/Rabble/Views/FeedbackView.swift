import SwiftUI

private let categories: [(String, String)] = [("problem", "Something's broken"), ("idea", "Suggestion"), ("other", "Other")]

/// Top-bar entry point: tap to open the report sheet.
struct FeedbackButton: View {
    let showId: String?
    @State private var open = false

    var body: some View {
        Button {
            open = true
        } label: {
            Image(systemName: "exclamationmark.bubble")
        }
        .accessibilityLabel("Report a problem")
        .sheet(isPresented: $open) { FeedbackSheet(showId: showId) }
    }
}

/// Problem report: a category, a message, and everything Diagnostics knows
/// (screen, room state, device, display, network, recent API errors).
struct FeedbackSheet: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss
    let showId: String?
    @State private var category = "problem"
    @State private var message = ""
    @State private var busy = false
    @State private var error: String?
    @State private var sent = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if sent {
                        Text("Your report was saved with the screen, room state and device details we captured. No audio is recorded.")
                            .foregroundStyle(RabbleColors.textSecondary)
                        Button("Done") { dismiss() }.buttonStyle(.borderedProminent).wideButton()
                    } else {
                        Text("What went wrong? We attach your screen, room state, device, display and network details so we can reproduce it.")
                            .font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textSecondary)
                        FlowLayout(spacing: 8) {
                            ForEach(categories, id: \.0) { value, label in
                                Button(label) { category = value }
                                    .buttonStyle(.bordered)
                                    .tint(category == value ? RabbleColors.accent : RabbleColors.textSecondary)
                                    .frame(minHeight: 44)
                            }
                        }
                        TextEditor(text: $message)
                            .frame(minHeight: 140)
                            .scrollContentBackground(.hidden)
                            .padding(8)
                            .background(RabbleColors.surfaceRaised)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay(alignment: .topLeading) {
                                if message.isEmpty {
                                    Text("What did you expect, and what happened instead?")
                                        .foregroundStyle(RabbleColors.textTertiary)
                                        .padding(16)
                                        .allowsHitTesting(false)
                                }
                            }
                        if let error {
                            Text(error).font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.live)
                        }
                        Button(busy ? "Sending…" : "Send report") { send() }
                            .buttonStyle(.borderedProminent)
                            .disabled(busy)
                            .wideButton()
                    }
                }
                .padding(16)
            }
            .background(RabbleColors.bg.ignoresSafeArea())
            .navigationTitle(sent ? "Thanks, got it" : "Report a problem")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if !sent {
                    ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                }
            }
        }
        .preferredColorScheme(.light)
    }

    private func send() {
        if busy { return }
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            error = "Tell us what happened first."
            return
        }
        busy = true
        error = nil
        Task {
            do {
                try await env.api.sendFeedback(
                    message: String(trimmed.prefix(4000)),
                    category: category,
                    showId: showId,
                    context: Diagnostics.collect(baseURL: env.baseURL)
                )
                sent = true
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
