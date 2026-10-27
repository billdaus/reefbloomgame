import UIKit
import Capacitor

/// The app's web view controller — stock Capacitor, plus one thing: when the
/// iPad build is running on a Mac ("Designed for iPad" on Apple silicon) it
/// appends a token to the WebView's user agent so the web layer can tell it is
/// the Mac edition (app.html reads it for the footer label). iPadOS reports
/// itself as a Mac in every other respect, so nothing else is reliable.
class ReefBridgeViewController: CAPBridgeViewController {
    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        var onMac = ProcessInfo.processInfo.isiOSAppOnMac   // "Designed for iPad" on Apple silicon
        #if targetEnvironment(macCatalyst)
        onMac = true                                          // the Mac Catalyst build (Intel + Apple silicon)
        #endif
        if onMac {
            let existing = descriptor.appendedUserAgentString ?? ""
            descriptor.appendedUserAgentString = (existing + " ReefBloomMac").trimmingCharacters(in: .whitespaces)
        }
        return descriptor
    }
}
