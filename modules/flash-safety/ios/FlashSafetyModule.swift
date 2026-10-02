import ExpoModulesCore
import MediaAccessibility

/// iOS Settings > Accessibility > Motion > Dim Flashing Lights.
public class FlashSafetyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FlashSafety")

    Function("isDimFlashingLightsEnabled") { () -> Bool in
      MADimFlashingLightsEnabled()
    }
  }
}
