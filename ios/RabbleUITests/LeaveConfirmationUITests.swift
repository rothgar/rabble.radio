import XCTest

/// Leaving a joined room always asks first (ShowView.swift's `leaveMessage`
/// alert), whether on stage or in the audience. Joins `demo_space_1` the
/// same way ShowRoomUITests does, then taps the reaction bar's leave
/// control (`accessibilityLabel("Leave the show")`).
final class LeaveConfirmationUITests: XCTestCase {
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
