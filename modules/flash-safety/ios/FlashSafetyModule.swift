import ExpoModulesCore
import MediaAccessibility

/// iOS Settings > Accessibility > Motion > Dim Flashing Lights (iOS 16.4+).
public class FlashSafetyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FlashSafety")

    Function("isDimFlashingLightsEnabled") { () -> Bool in
      if #available(iOS 16.4, *) {
        return MADimFlashingLightsEnabled()
      }
      return false
    }
  }
}
