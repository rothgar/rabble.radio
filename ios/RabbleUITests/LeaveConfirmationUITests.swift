import XCTest

/// Leaving a joined room always asks first (ShowView.swift's `leaveMessage`
/// alert), whether on stage or in the audience. Joins `demo_space_1` the
/// same way ShowRoomUITests does, then taps the reaction bar's leave
/// control (`accessibilityLabel("Leave the show")`).
final class LeaveConfirmationUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        // Alphabetically first in the bundle, so this is the first test
        // XCTest runs — it pays a first-connection cold-start cost (fresh
        // simulator network stack, WebRTC/media engine init) that
        // ShowRoomUITests, running after it, doesn't. Pay that cost here,
        // untimed and unasserted, instead of inside the real test's 20s
        // connection budget below (#148).
        let warmup = XCUIApplication()
        warmup.launchArguments = ["-showId", "demo_space_1", "-autoJoin"]
        warmup.launch()
        _ = warmup.descendants(matching: .any)["show-on-air-badge"].waitForExistence(timeout: 30)
        warmup.terminate()
    }

    func testLeaveShowsConfirmation() {
        let app = XCUIApplication()
        app.launchArguments = ["-showId", "demo_space_1", "-autoJoin"]
        app.launch()

        XCTAssertTrue(
            app.descendants(matching: .any)["show-on-air-badge"].waitForExistence(timeout: 20),
            "expected demo_space_1 to connect before leaving"
        )

        app.buttons["Leave the show"].tap()

        XCTAssertTrue(app.alerts["Leave the show?"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.alerts.buttons["Leave"].exists)
        XCTAssertTrue(app.alerts.buttons["Stay"].exists)
        app.alerts.buttons["Stay"].tap()
    }
}
