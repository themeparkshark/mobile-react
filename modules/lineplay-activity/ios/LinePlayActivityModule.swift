import ActivityKit
import ExpoModulesCore
import Foundation

struct LinePlayStateRecord: Record {
  @Field var parts: Int = 0
  @Field var nextPartAtMs: Double? = nil
  @Field var intervalSeconds: Double = 600
  @Field var status: String = ""
  @Field var paused: Bool = false

  var content: LinePlayAttributes.ContentState {
    LinePlayAttributes.ContentState(
      parts: parts,
      nextPartAt: nextPartAtMs.map { Date(timeIntervalSince1970: $0 / 1000) },
      intervalSeconds: intervalSeconds,
      status: status,
      paused: paused
    )
  }
}

public class LinePlayActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LinePlayActivity")

    Function("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    // Starts (or replaces) the single LinePlay activity. Returns false when the
    // player has Live Activities off, so the app just keeps its in-app meter.
    AsyncFunction("start") { (rideName: String, state: LinePlayStateRecord) -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
      for activity in Activity<LinePlayAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      do {
        _ = try Activity.request(
          attributes: LinePlayAttributes(rideName: rideName),
          content: ActivityContent(state: state.content, staleDate: nil),
          pushType: nil
        )
        return true
      } catch {
        return false
      }
    }

    AsyncFunction("update") { (state: LinePlayStateRecord) in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<LinePlayAttributes>.activities {
        await activity.update(ActivityContent(state: state.content, staleDate: nil))
      }
    }

    // Leaves the final Part count on the Lock Screen briefly, then clears it.
    AsyncFunction("end") { (state: LinePlayStateRecord?) in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<LinePlayAttributes>.activities {
        let content = state.map { ActivityContent(state: $0.content, staleDate: nil) }
        await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(15 * 60)))
      }
    }
  }
}
