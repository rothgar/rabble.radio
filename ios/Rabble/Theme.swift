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
    }
}

struct LiveBadge: View {
    var body: some View {
        Pill(text: "ON AIR", color: RabbleColors.live, background: RabbleColors.live.opacity(0.15))
    }
}

struct HostAvatar: View {
    let host: PublicHost
    var size: CGFloat = 36

    var body: some View {
        let initials = String((host.displayName ?? host.handle).trimmingCharacters(in: .whitespaces).prefix(2)).uppercased()
        Text(initials)
            .font(.system(size: size * 0.33, weight: .semibold))
            .foregroundStyle(RabbleColors.text)
            .frame(width: size, height: size)
            .background(RabbleColors.surfaceRaised)
            .clipShape(Circle())
    }
}
