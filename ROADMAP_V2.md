# Theme Park Shark V2 - LEGENDARY ROADMAP 🦈🎢

**Mission:** Build the most addictive theme park app of all time. Pokémon GO level engagement.

## Current State (Jan 26)
✅ GPS location tracking (5s intervals)
✅ Park detection & switching
✅ Home mode map with prep items
✅ Prep item collection (energy, tickets, XP rewards)
✅ Streak system with multipliers (1-100+ days)
✅ Energy bar with regeneration timer
✅ Trivia mini-game (timed, difficulty levels, multipliers)
✅ Daily gift chest selection
✅ Currency system (park coins, theme currency, tickets)
✅ Sound effects & music systems
✅ Store, friends, leaderboards
✅ Pin collections & swaps
✅ Ride coin level types (model defined)
✅ Ride parts types (model defined)

## PRIORITY 1: At-Home Addiction Loop 🏠 ✅ MOSTLY COMPLETE
**Goal:** Make walking around the neighborhood as addictive as Pokémon GO

### 1.1 Prep Item Sets System ⭐ CRITICAL ✅
- [x] Set type model (Churro Set, Camera Set, etc.)
- [x] SetCollectionScreen - see completion progress
- [x] Set completion rewards (big XP, tickets, exclusive items)
- [x] SetCompletionCelebration modal with confetti!
- [x] API endpoint structure for sets
- [ ] Monthly rotating sets (backend)

### 1.2 Weather-Gated Items 🌧️ ✅
- [x] Weather API integration (Open-Meteo, free!)
- [x] WeatherProvider context with auto-refresh
- [x] Rain/snow/hot/cold/windy condition detection
- [x] WeatherBadge component with glow effects
- [x] WeatherConditionBadge for requirements display
- [x] Integrated into HomeExplore

### 1.3 Time-Gated Items ⏰ ✅
- [x] Morning items (coffee cups, breakfast items) - 6am-11am
- [x] Afternoon items (churros, pretzels) - 11am-5pm
- [x] Evening items (popcorn, dinner items) - 5pm-9pm
- [x] Night items (glow sticks, flashlights) - 9pm-6am
- [x] Weekend-only items
- [x] Golden hour detection
- [x] TimePeriodBadge with countdown timers

### 1.4 Rarity Polish 💎 ✅
- [x] 5-tier rarity (Common/Uncommon/Rare/Epic/Legendary)
- [x] Visual polish (glow effects per rarity)
- [ ] Spawn rate adjustments per rarity (backend)
- [ ] Sound effects per rarity on collection

## PRIORITY 2: Mini-Game Variety 🎮 ✅ COMPLETE
**Goal:** Keep gameplay fresh, different games for different moods

### 2.1 Tap Challenge ✅
- [x] TapChallengeMiniGame component
- [x] Tap counter with timer
- [x] Multiplier based on taps achieved (0.5x-2.0x)
- [x] Satisfying tap animations & haptics
- [x] Screen shake on milestones

### 2.2 Timing Game ✅
- [x] TimingMiniGame component
- [x] "Hit the button when the slider hits the zone"
- [x] Multiple rounds, building difficulty
- [x] Perfect/Good/Miss scoring
- [x] Rounds get harder (smaller zones, faster speed)

### 2.3 Memory Match ✅
- [x] MemoryMatchMiniGame component
- [x] Theme park themed cards (24 emojis!)
- [x] Time-based scoring
- [x] Difficulty levels (easy/medium/hard)
- [x] Card flip animations

### 2.4 Mini-Game Selector ✅
- [x] MiniGameSelector component
- [x] Random game selection with weighting
- [x] Smart exclusions (queue, battery, accessibility)
- [x] Game-specific configuration

### 2.5 Photo Challenge (Future)
- [ ] Camera integration
- [ ] "Find something [blue/round/tall]"
- [ ] AI-powered validation
- [ ] Share to social

## PRIORITY 3: Ride Coin Leveling 🪙 ✅ UI COMPLETE
**Goal:** Give collectors something to grind for

### 3.1 Coin Display Shelf ✅
- [x] CoinShelfScreen - display all collected coins
- [x] Level progress bars per coin (dots display)
- [x] Visual coin upgrades per level (color frames)
- [x] Filter by: all/unlocked/maxed
- [x] Stats summary (unlocked, maxed, total collected)

### 3.2 Level Up System ✅
- [x] Coin detail modal with spinning animation
- [x] Perk display (current + next level)
- [x] Level up button with cost display
- [x] "Max Level!" celebration badge
- [ ] CoinLevelUpModal - actual level up animation (backend integration)

### 3.3 Ride Parts ✅
- [x] RidePartType model with 5-tier rarity
- [x] RideCoinLevelType model with perks
- [x] RIDE_COIN_LEVEL_CONFIG constants
- [ ] RidePartsInventory UI component
- [ ] Backend integration for parts

## PRIORITY 4: In-Line Experience 🎢
**Goal:** Make waiting in line fun

### 4.1 Queue Detection
- [ ] Geo-fenced queue zones per ride
- [ ] "You're in line!" detection
- [ ] Queue time display

### 4.2 Passive Earning
- [ ] Timer showing part accumulation
- [ ] "10 min = 1 ride part" display
- [ ] Bonus parts for long waits

### 4.3 Queue Mini-Games
- [ ] Random mini-game pop-ups
- [ ] Bonus part rewards
- [ ] Leaderboards within queue

## PRIORITY 5: Boss Shark Battles 🦈
**Goal:** Epic endgame content

### 5.1 Boss Unlock
- [ ] Level 50 coin = boss unlocked
- [ ] Boss teaser UI before unlock
- [ ] Boss difficulty tiers

### 5.2 Boss Battle
- [ ] Multi-phase boss fight
- [ ] Tap + timing + trivia combo
- [ ] Epic rewards
- [ ] Boss defeat celebration

## PRIORITY 6: Polish & Juice 🧃 ✅ IN PROGRESS
**Goal:** Every tap feels AMAZING

### 6.1 Haptics ✅
- [x] Light haptic on button tap (expo-haptics)
- [x] Medium on collection/selection
- [x] Heavy on level up/achievement
- [x] Pattern haptics in celebration modals
- [x] Error haptics on wrong answers

### 6.2 Animations ✅
- [x] Pulse animations on badges
- [x] Glow effects for weather/time conditions
- [x] Bounce/spring animations (Animated.spring)
- [x] Celebratory confetti (SetCompletionCelebration)
- [x] Firework bursts
- [x] Card flip animations (Memory Match)
- [x] Screen shake (Tap Challenge)
- [ ] Lottie animations for extra polish

### 6.3 Sounds
- [ ] Collection sounds per rarity
- [ ] Level up fanfare
- [ ] Achievement jingles
- [x] Existing sound effect system (SoundEffectProvider)

---

## Build Order (Starting Now)
1. **Tap Challenge Mini-Game** - Quick win, adds variety
2. **Timing Game** - Another quick mini-game
3. **Set Collection System** - Core addiction loop
4. **Weather Integration** - Unique selling point
5. **Time-Gating** - Drives daily engagement
6. **Coin Shelf** - Collection flex
7. **Level Up UI** - Progression satisfaction
8. **Queue Detection** - In-park differentiation
9. **Boss Battles** - Endgame content

---

*"Every tap should feel rewarding. Every collection should feel earned. Every level-up should feel EPIC."* 🦈
