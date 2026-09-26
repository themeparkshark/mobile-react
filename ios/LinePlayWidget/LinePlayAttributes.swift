import ActivityKit
import Foundation

// Keep in sync with modules/lineplay-activity/ios/LinePlayAttributes.swift: ActivityKit
// matches the app's and the widget's copies by type name and Codable shape.
public struct LinePlayAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var parts: Int
    /// When the next Ride Part lands; nil while capped, paused or checking.
    public var nextPartAt: Date?
    public var intervalSeconds: Double
    public var status: String
    public var paused: Bool
  }

  public var rideName: String
}
