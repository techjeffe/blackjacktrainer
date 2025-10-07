# Blackjack Trainer – Agent Integration Guide

This document explains how coding agents or other developers can interact with and extend the Blackjack Basic Strategy + Card Counting Trainer.

---

## 🧩 Architecture Overview

**Framework:** React (functional components, hooks)

**Structure:**

* **App.jsx** – Wrapper with mode switch (Basic Strategy / Card Counting)
* **StrategyModule** – Handles 2-deck and 6-deck basic strategy trainer.
* **CountingModule** – Implements Hi-Lo card counting trainer.
* **Shared utilities** – Hand evaluation, deck simulation, and strategy tables.

---

## ⚙️ Core Components & Behavior

### `App`

* Root component.
* Maintains mode state (`strategy` | `counting`).
* Renders either `StrategyModule` or `CountingModule`.

### `StrategyModule`

* Generates a random player hand and dealer upcard.
* Looks up correct action using `findAction()` against base tables.
* Tracks score, accuracy, streak, and history.
* **Auto-advance logic:**

  * Advances automatically when answer is correct.
  * Waits for user to press *Space* or click *Next hand* when answer is wrong.

### `CountingModule`

* Simulates a shoe with selectable deck count (1–8).
* Displays one card at a time; user inputs +1, 0, or −1 via button or keyboard.
* Updates running and true count automatically.
* Auto-deals next card immediately after response.
* Tracks per-input accuracy, error counts, streaks, and time-based drills.

---

## 🧠 Key Functions

| Function                         | Purpose                                                             |
| -------------------------------- | ------------------------------------------------------------------- |
| `evaluateHand(cards)`            | Calculates total, softness, and pair info for a hand                |
| `findAction(hand, up, deckMode)` | Returns correct strategy action (H/S/D/P)                           |
| `Shoe`                           | Deck/shoe simulator with shuffle and draw behavior                  |
| `HILO_MAP`                       | Defines Hi-Lo values per rank                                       |
| `CountingModule.submit(val)`     | Evaluates input, updates counts, auto-deals next card               |
| `StrategyModule.choose(act)`     | Evaluates player decision, records result, optionally auto-advances |

---

## 🎛️ Interaction / Extension Points

### 1. **Mode Expansion**

Add new modes (e.g., *Advanced Counting* or *Drill Mode*) by extending the `<select>` in `App` and adding another module.

### 2. **Analytics Hooks**

All actions (`choose`, `submit`) can trigger external telemetry. Add `sendEvent()` calls for logging to APIs.

### 3. **Error Analysis & Visualization**

The CountingModule has an `errors` object (for +1/0/−1). Agents can replace this with a more granular rank-level confusion matrix.

### 4. **Configurable Rules**

Strategy tables (`baseHard`, `baseSoft`, `basePairs`) assume **S17/DAS/no surrender**. Agents can inject custom rulesets via JSON or API calls for H17 or surrender variations.

### 5. **Persistence Layer (optional)**

Add localStorage, Supabase, or Firebase integration to save session stats and history.

### 6. **UI/UX Customization**

The app uses TailwindCSS; agents can replace classes or wrap components with ShadCN UI primitives for consistent themeing.

---

## 🔌 Keyboard Shortcuts

**Strategy Trainer:**

* `H` → Hit
* `S` → Stand
* `D` → Double
* `P` → Split
* `Space` → Next hand (only on incorrect answers)

**Counting Trainer:**

* `+` → +1
* `0` → 0
* `-` → −1
* `Space` → Next card (optional)

---

## 🚀 Future Expansion Ideas

* **Advanced error heatmap** – Per-rank confusion matrix.
* **Bet sizing trainer** – Simulate bankroll and bet spread logic.
* **Shoe memory challenge** – Recall sequences of drawn cards.
* **Voice input** – Call out counts for hands-free drills.
* **AI tutor mode** – GPT agent that explains reasoning after each decision.

---

## 📄 Versioning

* **v1.0** – Basic Strategy + Hi-Lo Counting modules complete.
* **v1.1 (planned)** – Add data persistence, analytics, and advanced heatmap.

---

**Author:** Jeff Eberhard
**Purpose:** To guide coding agents extending or integrating with the Blackjack Trainer project.
