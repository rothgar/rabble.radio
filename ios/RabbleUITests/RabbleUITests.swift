import XCTest

/// Smoke coverage against a server seeded with demo data (`node
/// scripts/seed-demo.mjs --local`; see ios/README.md's "UI tests"), proving
/// the headless UI test plumbing (Mac mini and `macos-latest` runner alike)
/// is wired end to end: the app launches and reaches the home screen.
final class RabbleUITests: XCTestCase {
    func testHomeShowsSections() {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.staticTexts["Shows"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["ON AIR NOW"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["STATIONS"].exists)
        // FOR YOU only renders for a signed-in viewer who follows a host or
        // room (Models.swift's `forYou`); this run is anonymous — Bluesky
        // login cannot be driven headlessly — so it is not asserted here.
    }
}
