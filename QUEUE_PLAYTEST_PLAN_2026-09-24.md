# Theme Park Shark: first real queue playtest

**Status:** Ready as a field protocol; no guest playtest has been run.  
**Purpose:** Find out whether LinePlay makes a real wait more enjoyable and whether it closes the ride coin → Parts → first upgrade loop. A working timer, a passing test suite, or a polished preview cannot answer that.

## Test the experience, not just the screens

Run the pilot at the three authored attractions: Magic Kingdom Space Mountain and Haunted Mansion, plus Disneyland Pirates of the Caribbean. Recruit at least six parties across the rides: solo fans, a two-person pair, and a family or friend group sharing one phone. Include people who have never seen the app and at least one infrequent park visitor. Give them a signed-in build with the correct park/ride mapping and an account state that lets them attempt the ride coin. Do not coach them through the UI after the opening instruction: **“Use this if you want while you wait. Stop whenever the real line needs your attention.”**

Test both an ordinary wait and a longer or interrupted wait. If the actual line is short, do not simulate a 45-minute guest experience and call it a field result. Record the real elapsed time, but do not tell guests that the entrance-board wait is their remaining time.

## Observe six moments

| Moment | What to record |
| --- | --- |
| First 60 seconds | Did the guest notice LinePlay and start without help? Did the opening ride chapter lead them to Crew Bingo, another mission, or the community route? Time the first meaningful tap and first completed activity. |
| First five minutes | Did they understand the ride story, direct mission choices, compact Parts meter, and that activity scores do not mint currency? Could they find the optional wait/reward details if needed? After one round, did the chapter/next activity rail lead them into another activity without coaching? If they chose a field-note clue, did they notice it changed the memory finale and talk about the choice? |
| Movement | Could they stop or pause promptly, keep their place in line, and resume without losing the round or crew state? |
| Middle of wait | Which activities did they repeat, skip, or abandon? Did the group talk or pass the phone voluntarily? Did they discover later rounds, including shared or newly appended pages, without losing their place? Did the game become repetitive? |
| Crew Bingo | Did anyone choose it unprompted, understand how to finish a line, share the phone safely, and continue after the first square? Did tapping a square reveal its prompt and return to the board without confusion? Were the prompts interesting or too childish? Could a solo guest play without feeling excluded? |
| Community route | Did the guest understand that other nearby players can change the bonus round? Did the one-minute eligibility wait feel fair after the first activity, and could they return to a playable chapter while waiting? |
| Boarding or exit | Could they end honestly? Did the recap reflect actual games played, eligible time, and confirmed rewards? |
| After the ride | Could they find the coin, understand the next upgrade cost, and say what they want to pursue next? |
| Event collecting | If a Project Edition is enabled, did they notice its frame, understand why it was earned, and choose to display or pursue another edition? |

Log timestamps and observed actions, then ask each person privately: “Did this make the wait better, worse, or the same?” and “What was your favorite and least favorite moment?” Ask them to rate fun and clarity from 1–5 and to explain the Ticket, Part, and coin relationship in their own words. Capture exact confusing language. Do not infer enjoyment from screen time alone.

## Required technical readback

For each session, join the app's session ID with the backend LinePlay receipt, project contribution and coin edition if present, ride Part balance, and coin level before and after. Check that reconnecting does not duplicate a reward or edition, a far or stale location sample does not count as eligible time, and an unmapped or low-confidence queue still allows the games without promising Parts. Record battery percentage at start and end, device model, network interruptions, and whether the app was backgrounded. Do not log precise guest coordinates in the study notes.

## Decision rules for the pilot

Treat these as **provisional** thresholds to discuss after seeing behavior:

- Continue investing in this chapter design if most uncoached parties start a game, most say the wait felt better, and both solo and one-phone groups voluntarily return to another activity after the first round.
- Rework the opening if people cannot choose an activity within a minute or think they must stare at the timer to earn Parts.
- Rework the activity mix if guests exhaust the interesting content early, repeat trivia accidentally, or feel that the group mode slows the real queue.
- Rework or remove Crew Bingo if it makes guests scan for clues while walking, distracts from the physical queue, or fails to generate spontaneous conversation or sustained solo play. Its self-reported squares must never award Ride Parts.
- Stop any reward pilot if a receipt disagrees with the displayed result, queue proximity routinely misclassifies guests, or a reconnect can mint duplicate Parts. Keep the entertainment available while fixing reward confidence.

The next iteration should change the specific activity, copy, pacing, or reward rule that observations implicate. Do not scale to more rides solely because this pilot's code passes tests.
