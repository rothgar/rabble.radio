import SwiftUI

/// Mirrors the design tokens in src/app/globals.css.
enum RabbleColors {
    static let bg = Color(red: 0x16 / 255, green: 0x18 / 255, blue: 0x26 / 255)
    static let surface = Color(red: 0x23 / 255, green: 0x25 / 255, blue: 0x32 / 255)
    static let surfaceRaised = Color(red: 0x2C / 255, green: 0x2F / 255, blue: 0x43 / 255)
    static let text = Color(red: 0xE9 / 255, green: 0xE9 / 255, blue: 0xED / 255)
    static let textSecondary = Color(red: 0x93 / 255, green: 0x97 / 255, blue: 0xAB / 255)
    static let textTertiary = Color(red: 0x59 / 255, green: 0x5D / 255, blue: 0x6C / 255)
    static let accent = Color(red: 0x91 / 255, green: 0x84 / 255, blue: 0xD9 / 255)
    static let accentHover = Color(red: 0xA3 / 255, green: 0x96 / 255, blue: 0xE0 / 255)
    static let accent900 = Color(red: 0x2B / 255, green: 0x27 / 255, blue: 0x41 / 255)
    static let live = Color(red: 0xF8 / 255, green: 0x71 / 255, blue: 0x71 / 255)
    static let success = Color(red: 0x34 / 255, green: 0xD3 / 255, blue: 0x99 / 255)
}

/// Mirror of src/lib/tags.ts: canonical categories and the primary-tag rule.
enum Tags {
    static let categories: [String] = [
        "Autos & Vehicles", "Comedy", "Education", "Entertainment",
        "Film & Animation", "Gaming", "Howto & Style", "Music",
        "News & Politics", "Nonprofits & Activism", "People & Blogs",
        "Pets & Animals", "Science & Technology", "Sports", "Travel & Events",
    ]

    static func primaryTag(of tags: [String]) -> String? {
        tags.filter { categories.contains($0) }
            .min { categories.firstIndex(of: $0)! < categories.firstIndex(of: $1)! }
    }
}

/// Widest a column of cards should grow before it reads as stretched.
let contentMaxWidth: CGFloat = 1040

struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RabbleColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

extension View {
    func card() -> some View { modifier(CardStyle()) }

    /// A full-width button that meets the 44pt touch target.
    func wideButton(height: CGFloat = 48) -> some View {
        frame(maxWidth: .infinity, minHeight: height)
    }
}

struct Pill: View {
    let text: String
    var color: Color = RabbleColors.textSecondary
    var background: Color = RabbleColors.surfaceRaised

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(background)
            .clipShape(Capsule())
            .lineLimit(1)
    }
}

struct LiveBadge: View {
    var body: some View {
        Pill(text: "ON AIR", color: RabbleColors.live, background: RabbleColors.live.opacity(0.15))
    }
}

struct SectionLabel: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(RabbleColors.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Round avatar: the Bluesky picture when there is one, initials otherwise.
struct Avatar: View {
    let name: String
    let avatarUrl: String?
    var size: CGFloat = 36
    var ring: Color?

    private var initials: String {
        var n = name.trimmingCharacters(in: .whitespaces)
        if n.hasPrefix("@") { n.removeFirst() }
        return String(n.prefix(2)).uppercased()
    }

    var body: some View {
        ZStack {
            Circle().fill(RabbleColors.surfaceRaised)
            if let avatarUrl, let url = URL(string: avatarUrl) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Text(initials).font(.system(size: size * 0.33, weight: .semibold)).foregroundStyle(RabbleColors.text)
                    }
                }
            } else {
                Text(initials).font(.system(size: size * 0.33, weight: .semibold)).foregroundStyle(RabbleColors.text)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay {
            if let ring { Circle().strokeBorder(ring, lineWidth: 2) }
        }
    }
}

struct HostAvatar: View {
    let host: PublicHost
    var size: CGFloat = 36

    var body: some View {
        Avatar(name: host.label, avatarUrl: host.avatarUrl, size: size)
    }
}

struct Loading: View {
    var body: some View {
        ProgressView().tint(RabbleColors.accent).frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct ErrorPanel: View {
    let message: String
    let retry: () async -> Void

    var body: some View {
        VStack(spacing: 8) {
            Text("Something went wrong").font(.title3.weight(.semibold))
            Text(message)
                .foregroundStyle(RabbleColors.textSecondary)
                .multilineTextAlignment(.center)
            Button("Retry") { Task { await retry() } }
                .buttonStyle(.borderedProminent)
                .frame(minHeight: 44)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Lays out children left to right, wrapping onto new rows.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// One show in a list: host avatar, title, on-air badge, counts and tags.
struct ShowCard: View {
    let show: Show

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                HostAvatar(host: show.host)
                VStack(alignment: .leading, spacing: 2) {
                    Text(show.title).font(.headline).lineLimit(1).foregroundStyle(RabbleColors.text)
                    Text("@\(show.host.handle)").font(.caption).foregroundStyle(RabbleColors.textTertiary).lineLimit(1)
                }
                Spacer(minLength: 8)
                if show.isLive {
                    LiveBadge()
                } else if show.replay != nil {
                    Pill(text: "Replay")
                } else if show.status == "scheduled" {
                    Pill(text: show.reminded ? "Scheduled · 🔔" : "Scheduled")
                } else {
                    Pill(text: show.reminded ? "Off air · 🔔" : "Off air")
                }
            }
            if show.forYou {
                HStack(spacing: 6) {
                    if !show.followedInRoom.isEmpty {
                        HStack(spacing: -6) {
                            ForEach(show.followedInRoom.prefix(3)) { HostAvatar(host: $0, size: 20) }
                        }
                    }
                    Text(forYouLine).font(.caption).foregroundStyle(RabbleColors.accent).lineLimit(1)
                }
            }
            HStack(spacing: 12) {
                Text("\(show.listenerCount) listening")
                Text("\(show.speakerCount) on stage")
                Text("\(show.reactionCount) reactions")
            }
            .font(.caption)
            .foregroundStyle(RabbleColors.textSecondary)
            if !show.tags.isEmpty {
                FlowLayout(spacing: 6) { ForEach(show.tags, id: \.self) { Pill(text: $0) } }
            }
        }
        .card()
    }

    private var forYouLine: String {
        if let first = show.followedInRoom.first {
            if show.followedInRoom.count == 1 { return "\(first.label) is in the room" }
            return "\(first.label) and \(show.followedInRoom.count - 1) more you follow are here"
        }
        return "You follow the host"
    }
}

func formatWhen(_ iso: String) -> String {
    let parser = ISO8601DateFormatter()
    parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = ISO8601DateFormatter()
    guard let date = parser.date(from: iso) ?? plain.date(from: iso) else { return iso }
    let f = DateFormatter()
    f.dateFormat = "EEE d MMM, HH:mm"
    return f.string(from: date)
}

func formatClock(_ seconds: Double) -> String {
    let total = max(0, Int(seconds.rounded(.down)))
    let h = total / 3600
    let m = (total % 3600) / 60
    let s = total % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
}
