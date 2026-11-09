import SwiftUI

/// Mirrors the brand tokens in src/app/globals.css (docs/brand.md): cream
/// paper, Retro Teal ink, Rebel Red accent, Vintage Orange secondary, Mustard
/// highlight. Light theme only.
enum RabbleColors {
    static let bg = Color(hex: 0xF1FAEE)            // Cream White
    static let surface = Color(hex: 0xF8FCF5)
    static let surfaceRaised = Color(hex: 0xFFFEF9)
    static let ink = Color(hex: 0x073B4C)           // Retro Teal fill
    static let inkMuted = Color(hex: 0x073B4C).opacity(0.08)
    static let text = Color(hex: 0x073B4C)
    static let textSecondary = Color(hex: 0x3D6472)
    static let textTertiary = Color(hex: 0x7A9AA4)
    static let textOnInk = Color(hex: 0xF1FAEE)
    static let accent = Color(hex: 0xE63946)        // Rebel Red
    static let accentHover = Color(hex: 0xCF2E3B)
    static let accentMuted = Color(hex: 0xE63946).opacity(0.12)
    static let accent2 = Color(hex: 0xFF7F00)       // Vintage Orange
    static let accent2Dark = Color(hex: 0xAD5600)
    static let highlight = Color(hex: 0xF9C74F)     // Mustard Yellow
    static let highlightMuted = Color(hex: 0xF9C74F).opacity(0.35)
    static let border = Color(hex: 0x073B4C)
    static let divider = Color(hex: 0x073B4C).opacity(0.18)
    static let live = Color(hex: 0xE63946)
    static let success = Color(hex: 0x2A9D8F)
    static let warning = Color(hex: 0xF9C74F)
    static let error = Color(hex: 0xE63946)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255)
    }
}

/// Fraunces Black (soft optical axis) stands in for Cooper Black on the
/// wordmark and large titles; Inter is the body face. Both are bundled in
/// Rabble/Fonts and listed under UIAppFonts.
enum RabbleFont {
    static func display(_ size: CGFloat, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom("Fraunces72ptSoft-Black", size: size, relativeTo: style)
    }

    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(interName(weight), size: size, relativeTo: style)
    }

    /// Brand equivalent of the system text styles: large titles in the display
    /// face, everything else in Inter at the system sizes.
    static func style(_ style: Font.TextStyle, _ weight: Font.Weight = .regular) -> Font {
        switch style {
        case .largeTitle: return display(34, relativeTo: .largeTitle)
        case .title: return display(28, relativeTo: .title)
        case .title2: return display(22, relativeTo: .title2)
        case .title3: return sans(20, weight == .regular ? .semibold : weight, relativeTo: .title3)
        case .headline: return sans(17, .semibold, relativeTo: .headline)
        case .body: return sans(17, weight, relativeTo: .body)
        case .callout: return sans(16, weight, relativeTo: .callout)
        case .subheadline: return sans(15, weight, relativeTo: .subheadline)
        case .footnote: return sans(13, weight, relativeTo: .footnote)
        case .caption: return sans(12, weight, relativeTo: .caption)
        case .caption2: return sans(11, weight, relativeTo: .caption2)
        @unknown default: return sans(17, weight)
        }
    }

    private static func interName(_ weight: Font.Weight) -> String {
        switch weight {
        case .bold, .heavy, .black: return "Inter-Bold"
        case .semibold: return "Inter-SemiBold"
        case .medium: return "Inter-Medium"
        default: return "Inter-Regular"
        }
    }
}

/// The "R" monogram whose right side becomes two radio waves. Same geometry
/// as assets/brand/monogram.svg (64x64 units).
struct Monogram: View {
    var size: CGFloat = 28
    var letter: Color = RabbleColors.ink
    var wave: Color = RabbleColors.accent

    var body: some View {
        Canvas { ctx, bounds in
            let s = bounds.width / 64
            ctx.scaleBy(x: s, y: s)
            var slabs = Path()
            slabs.addRect(CGRect(x: 9, y: 10, width: 11, height: 45))
            slabs.addRoundedRect(in: CGRect(x: 6, y: 10, width: 18, height: 5), cornerSize: CGSize(width: 1.5, height: 1.5))
            slabs.addRoundedRect(in: CGRect(x: 6, y: 50, width: 20, height: 5), cornerSize: CGSize(width: 1.5, height: 1.5))
            slabs.addRoundedRect(in: CGRect(x: 28, y: 50, width: 18, height: 5), cornerSize: CGSize(width: 1.5, height: 1.5))
            ctx.fill(slabs, with: .color(letter))
            var bowl = Path()
            bowl.move(to: CGPoint(x: 14, y: 15.5))
            bowl.addLine(to: CGPoint(x: 25.5, y: 15.5))
            bowl.addArc(center: CGPoint(x: 25.5, y: 24.5), radius: 9, startAngle: .degrees(-90), endAngle: .degrees(90), clockwise: false)
            bowl.addLine(to: CGPoint(x: 14, y: 33.5))
            ctx.stroke(bowl, with: .color(letter), style: StrokeStyle(lineWidth: 11, lineJoin: .round))
            var leg = Path()
            leg.move(to: CGPoint(x: 22.5, y: 34))
            leg.addLine(to: CGPoint(x: 34, y: 50.8))
            ctx.stroke(leg, with: .color(letter), style: StrokeStyle(lineWidth: 11))
            var waves = Path()
            waves.addArc(center: CGPoint(x: 25.6, y: 24.5), radius: 20, startAngle: .degrees(-53), endAngle: .degrees(53), clockwise: false)
            waves.move(to: CGPoint(x: 42.1, y: 3.2))
            waves.addArc(center: CGPoint(x: 25.6, y: 24.5), radius: 27, startAngle: .degrees(-52), endAngle: .degrees(52), clockwise: false)
            ctx.stroke(waves, with: .color(wave), style: StrokeStyle(lineWidth: 5, lineCap: .round))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Monogram plus the lower-case wordmark in the display face.
struct Wordmark: View {
    var body: some View {
        HStack(spacing: 8) {
            Monogram(size: 28)
            Text("rabble radio").font(RabbleFont.display(20, relativeTo: .headline)).foregroundStyle(RabbleColors.text)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Rabble Radio")
    }
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
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(RabbleColors.border, lineWidth: 1.5))
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
    var background: Color = RabbleColors.inkMuted

    var body: some View {
        Text(text)
            .font(RabbleFont.style(.caption, .semibold))
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
        Pill(text: "ON AIR", color: RabbleColors.live, background: RabbleColors.accentMuted)
            .overlay(Capsule().strokeBorder(RabbleColors.live, lineWidth: 1))
    }
}

struct SectionLabel: View {
    let text: String
    var body: some View {
        Text(text)
            .font(RabbleFont.style(.caption, .semibold))
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
            Circle().fill(RabbleColors.ink)
            if let avatarUrl, let url = URL(string: avatarUrl) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Text(initials).font(RabbleFont.sans(size * 0.33, .semibold)).foregroundStyle(RabbleColors.textOnInk)
                    }
                }
            } else {
                Text(initials).font(RabbleFont.sans(size * 0.33, .semibold)).foregroundStyle(RabbleColors.textOnInk)
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
            Text("Something went wrong").font(RabbleFont.style(.title3, .semibold))
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
                    Text(show.title).font(RabbleFont.style(.headline)).lineLimit(1).foregroundStyle(RabbleColors.text)
                    Text("@\(show.host.handle)").font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.textTertiary).lineLimit(1)
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
                    Text(forYouLine).font(RabbleFont.style(.caption)).foregroundStyle(RabbleColors.accent).lineLimit(1)
                }
            }
            HStack(spacing: 12) {
                Text("\(show.listenerCount) listening")
                Text("\(show.speakerCount) on stage")
                Text("\(show.reactionCount) reactions")
            }
            .font(RabbleFont.style(.caption))
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
