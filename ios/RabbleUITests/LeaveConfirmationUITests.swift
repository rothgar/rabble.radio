import XCTest

/// Leaving a joined room always asks first (ShowView.swift's `leaveMessage`
/// alert), whether on stage or in the audience. Joins `demo_space_1` the
/// same way ShowRoomUITests does, then taps the reaction bar's leave
/// control (`accessibilityIdentifier("reaction-bar-leave-button")`).
///
/// Waits on that identifier rather than `show-on-air-badge`: the badge can
/// be true from the show's HTTP metadata alone, before the LiveKit room
/// object is populated, while the reaction bar (and its leave button) only
/// renders once the room has actually connected (#150).
final class LeaveConfirmationUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        // Alphabetically first in the bundle, so this is the first test
        // XCTest runs — it pays a cold-start cost (fresh simulator, first
        // app launch, first network round trip to the dev server and to
        // LiveKit) that ShowRoomUITests, running after it, doesn't. Pay
        // that cost here, untimed and unasserted, instead of inside the
        // real test's 20s connection budget below (#148). Leaves cleanly
        // (same flow as the real test) so this warmup's own listener
        // doesn't linger in demo_space_1 for the real test that follows.
        let warmup = XCUIApplication()
        warmup.launchArguments = ["-showId", "demo_space_1", "-autoJoin"]
        warmup.launch()
        if warmup.buttons["reaction-bar-leave-button"].waitForExistence(timeout: 30) {
            warmup.buttons["reaction-bar-leave-button"].tap()
            if warmup.alerts["Leave the show?"].waitForExistence(timeout: 5) {
                warmup.alerts.buttons["Leave"].tap()
            }
        }
        warmup.terminate()
    }

    func testLeaveShowsConfirmation() {
        let app = XCUIApplication()
        app.launchArguments = ["-showId", "demo_space_1", "-autoJoin"]
        app.launch()

        XCTAssertTrue(
            app.buttons["reaction-bar-leave-button"].waitForExistence(timeout: 20),
            "expected demo_space_1's LiveKit room to connect (and its reaction bar to appear) before leaving"
        )

        app.buttons["reaction-bar-leave-button"].tap()

        XCTAssertTrue(app.alerts["Leave the show?"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.alerts.buttons["Leave"].exists)
        XCTAssertTrue(app.alerts.buttons["Stay"].exists)
        app.alerts.buttons["Stay"].tap()
    }
}
