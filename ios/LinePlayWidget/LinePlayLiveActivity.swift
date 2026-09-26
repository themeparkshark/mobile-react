import ActivityKit
import SwiftUI
import WidgetKit

private let ocean = Color(red: 7 / 255, green: 104 / 255, blue: 185 / 255)
private let deep = Color(red: 5 / 255, green: 52 / 255, blue: 110 / 255)
private let gold = Color(red: 1, green: 207 / 255, blue: 59 / 255)

/// Counts down to the next Ride Part, or shows the plain status when there's no
/// timer (capped, paused, checking). The system animates the countdown itself.
private struct NextPart: View {
  let state: LinePlayAttributes.ContentState
  var font: Font = .system(size: 28, weight: .heavy, design: .rounded)

  var body: some View {
    if let next = state.nextPartAt, !state.paused, next > Date() {
      Text(timerInterval: Date()...next, countsDown: true)
        .font(font).monospacedDigit().foregroundStyle(gold)
        // Timer text otherwise claims the full row width.
        .multilineTextAlignment(.leading).frame(width: 84, alignment: .leading)
    } else {
      Text(state.status).font(.system(size: 15, weight: .bold, design: .rounded))
        .foregroundStyle(gold).lineLimit(1)
    }
  }
}

private struct PartProgress: View {
  let state: LinePlayAttributes.ContentState

  var body: some View {
    if let next = state.nextPartAt, !state.paused, next > Date() {
      ProgressView(timerInterval: next.addingTimeInterval(-state.intervalSeconds)...next, countsDown: false) {
        EmptyView()
      } currentValueLabel: { EmptyView() }
        .tint(gold)
    } else {
      ProgressView(value: 1).tint(gold.opacity(0.5))
    }
  }
}

private struct PartCount: View {
  let parts: Int
  var size: CGFloat = 44

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      Image("RidePart").resizable().scaledToFit().frame(width: size, height: size)
      Text("\(parts)")
        .font(.system(size: size * 0.42, weight: .black, design: .rounded))
        .foregroundStyle(.white)
        .shadow(color: deep, radius: 0, x: 0, y: 2)
        .offset(x: 4, y: 4)
    }
  }
}

struct LinePlayLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LinePlayAttributes.self) { context in
      // Lock Screen / banner
      HStack(spacing: 14) {
        PartCount(parts: context.state.parts, size: 52)
        VStack(alignment: .leading, spacing: 4) {
          Text(context.attributes.rideName)
            .font(.system(size: 16, weight: .heavy, design: .rounded))
            .foregroundStyle(.white).lineLimit(1)
          HStack(alignment: .firstTextBaseline, spacing: 6) {
            NextPart(state: context.state)
            if context.state.nextPartAt != nil && !context.state.paused {
              Text("to next Ride Part").font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(.white.opacity(0.85))
            }
          }
          PartProgress(state: context.state)
        }
      }
      .padding(16)
      .activityBackgroundTint(ocean)
      .activitySystemActionForegroundColor(gold)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          PartCount(parts: context.state.parts, size: 46).padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          NextPart(state: context.state, font: .system(size: 24, weight: .heavy, design: .rounded))
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(context.attributes.rideName)
            .font(.system(size: 15, weight: .heavy, design: .rounded)).lineLimit(1)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 4) {
            PartProgress(state: context.state)
            Text(context.state.paused ? "Paused" : "Earning Ride Parts in line")
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .foregroundStyle(.secondary)
          }
        }
      } compactLeading: {
        HStack(spacing: 3) {
          Image("RidePart").resizable().scaledToFit().frame(width: 20, height: 20)
          Text("\(context.state.parts)").font(.system(size: 15, weight: .black, design: .rounded))
            .foregroundStyle(gold)
        }
      } compactTrailing: {
        if let next = context.state.nextPartAt, !context.state.paused, next > Date() {
          Text(timerInterval: Date()...next, countsDown: true)
            .font(.system(size: 15, weight: .bold, design: .rounded)).monospacedDigit()
            .foregroundStyle(gold).frame(maxWidth: 48)
        } else {
          Image(systemName: context.state.paused ? "pause.fill" : "checkmark")
            .foregroundStyle(gold)
        }
      } minimal: {
        Image("RidePart").resizable().scaledToFit().frame(width: 20, height: 20)
      }
      .keylineTint(gold)
    }
  }
}
