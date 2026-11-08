import SwiftUI

enum Route: Hashable {
    case station(String)
    case show(id: String, autoJoin: Bool)
    case me
}

/// The navigation stack's path, shared so pushed screens can push further
/// (Start a show lands in the room) or pop to the root (log out).
@MainActor
final class Navigator: ObservableObject {
    @Published var path = NavigationPath()

    func push(_ route: Route) { path.append(route) }

    func pop() {
        if !path.isEmpty { path.removeLast() }
    }

    func popToRoot() { path = NavigationPath() }
}
