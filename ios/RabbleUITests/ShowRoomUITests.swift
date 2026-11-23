import XCTest

/// Opens a room headlessly the way a tapped reminder notification would:
/// `-showId <id> -autoJoin` (RabbleApp.swift) joins straight away, with
/// nothing tapped. `demo_space_1` (scripts/seed-demo.mjs) is seeded always
/// on air, so a fresh launch into it should reach the connected room.
final class ShowRoomUITests: XCTestCase {
    func testAutoJoinReachesOnAirRoom() {
        let app = XCUIApplication()
        app.launchArguments = ["-showId", "demo_space_1", "-autoJoin"]
        app.launch()

        // Transient: the join request is a real network round trip, so this
        // is usually observable, but it is not asserted on its own — the
        // room reaching ON AIR below is the real assertion.
        _ = app.staticTexts["Connecting…"].waitForExistence(timeout: 3)

        XCTAssertTrue(
            app.descendants(matching: .any)["show-on-air-badge"].waitForExistence(timeout: 20),
            "expected the ON AIR badge once demo_space_1 connects"
        )
        XCTAssertTrue(app.descendants(matching: .any)["show-listening-count"].exists)
    }
}
