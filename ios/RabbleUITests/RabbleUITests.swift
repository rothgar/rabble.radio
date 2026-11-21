import XCTest

/// Placeholder coverage proving the headless UI test plumbing (Mac mini and
/// `macos-latest` runner alike) is wired end to end: the app launches and
/// reaches the home screen.
final class RabbleUITests: XCTestCase {
    func testAppLaunchesToShowsHomeScreen() {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.staticTexts["Shows"].waitForExistence(timeout: 10))
    }
}
