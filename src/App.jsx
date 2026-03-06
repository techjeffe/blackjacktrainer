import React, { useMemo, useState, useEffect, useRef } from "react";

// Blackjack Trainer — Basic Strategy + Card Counting (Hi-Lo)
// Assumptions for strategy: S17, DAS, no surrender. 2D tweaks noted.

// ==========================
// Shared Utilities
// ==========================
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const UP_CARDS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const ORDER = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
const normalizeRank = (r) => (["J", "Q", "K"].includes(r) ? "10" : r);

const range = (a, b) => {
  const na = normalizeRank(a);
  const nb = normalizeRank(b);
  const s = ORDER.indexOf(na);
  const e = ORDER.indexOf(nb);
  if (s === -1 || e === -1) return [];
  const start = Math.min(s, e);
  const end = Math.max(s, e);
  return ORDER.slice(start, end + 1);
};

const cardValue = (r) => (r === "A" ? 11 : ["J", "Q", "K", "10"].includes(r) ? 10 : parseInt(r, 10));
const normalizeUp = (u) => (["J", "Q", "K"].includes(u) ? "10" : u);

function evaluateHand(cards) {
  const values = cards.map(cardValue);
  const aces = cards.filter((c) => c === "A").length;
  let total = values.reduce((a, b) => a + b, 0);
  let aceAsEleven = aces;
  while (total > 21 && aceAsEleven > 0) {
    total -= 10;
    aceAsEleven--;
  }
  const soft = aceAsEleven > 0;
  let pairRank = null;
  if (cards.length === 2 && cards[0] === cards[1]) pairRank = cards[0];
  if (
    cards.length === 2 &&
    ["10", "J", "Q", "K"].includes(cards[0]) &&
    ["10", "J", "Q", "K"].includes(cards[1])
  )
    pairRank = "10";
  return { total, soft, pairRank };
}

function randomCard() {
  return RANKS[Math.floor(Math.random() * RANKS.length)];
}

function simulateWinProbability({ player, up }, action, deckMode, trials = 1500) {
  function drawCard() {
    return randomCard();
  }

  function playDealer() {
    const dealerCards = [up, drawCard()];
    let dealerEval = evaluateHand(dealerCards);
    if (dealerEval.total === 21 && dealerCards.length === 2) {
      return { cards: dealerCards, eval: dealerEval, blackjack: true };
    }
    while (dealerEval.total < 17) {
      dealerCards.push(drawCard());
      dealerEval = evaluateHand(dealerCards);
    }
    return {
      cards: dealerCards,
      eval: dealerEval,
      blackjack: false,
    };
  }

  function resolveHand(cards, canDouble = true, canSplit = true, bet = 1) {
    const evald = evaluateHand(cards);
    if (evald.total > 21) {
      return [{ cards, eval: evald, busted: true, bet }];
    }
    const decisionEval = { ...evald };
    if (!canSplit) decisionEval.pairRank = null;
    let nextAction = findAction(decisionEval, up, deckMode);
    if (nextAction === "P" && !canSplit) {
      decisionEval.pairRank = null;
      nextAction = findAction(decisionEval, up, deckMode);
    }
    if (nextAction === "D" && !canDouble) {
      nextAction = "H";
    }

    if (nextAction === "S") {
      return [{ cards, eval: evald, busted: false, bet }];
    }
    if (nextAction === "H") {
      const newCards = [...cards, drawCard()];
      return resolveHand(newCards, false, false, bet);
    }
    if (nextAction === "D") {
      const newCards = [...cards, drawCard()];
      const newEval = evaluateHand(newCards);
      return [{ cards: newCards, eval: newEval, busted: newEval.total > 21, bet: bet * 2 }];
    }
    if (nextAction === "P") {
      const leftStart = [cards[0], drawCard()];
      const rightStart = [cards[1], drawCard()];
      const left = resolveHand(leftStart, true, false, bet);
      const right = resolveHand(rightStart, true, false, bet);
      return [...left, ...right];
    }
    return [{ cards, eval: evald, busted: evald.total > 21, bet }];
  }

  function simulateSingleRound() {
    let playerHands = [];
    if (action === "S") {
      const evald = evaluateHand(player);
      playerHands = [{ cards: [...player], eval: evald, busted: evald.total > 21, bet: 1 }];
    } else if (action === "H") {
      const first = [...player, drawCard()];
      playerHands = resolveHand(first, false, false, 1);
    } else if (action === "D") {
      const newCards = [...player, drawCard()];
      const evald = evaluateHand(newCards);
      playerHands = [{ cards: newCards, eval: evald, busted: evald.total > 21, bet: 2 }];
    } else if (action === "P") {
      const first = [player[0], drawCard()];
      const second = [player[1], drawCard()];
      const left = resolveHand(first, true, false, 1);
      const right = resolveHand(second, true, false, 1);
      playerHands = [...left, ...right];
    } else {
      const evald = evaluateHand(player);
      playerHands = [{ cards: [...player], eval: evald, busted: evald.total > 21, bet: 1 }];
    }

    const dealerState = playDealer();
    let net = 0;

    playerHands.forEach((hand) => {
      if (hand.busted) {
        net -= hand.bet;
        return;
      }
      if (dealerState.blackjack) {
        net -= hand.bet;
        return;
      }
      if (dealerState.eval.total > 21) {
        net += hand.bet;
        return;
      }
      const playerTotal = evaluateHand(hand.cards).total;
      const dealerTotal = dealerState.eval.total;
      if (playerTotal > dealerTotal) {
        net += hand.bet;
      } else if (playerTotal < dealerTotal) {
        net -= hand.bet;
      }
    });

    return { net };
  }

  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const { net } = simulateSingleRound();
    if (net > 0) wins += 1;
  }

  return Math.round((wins / trials) * 1000) / 10;
}

// ==========================
// Counting Module (Hi-Lo)
// ==========================
const HILO_MAP = {
  2: +1,
  3: +1,
  4: +1,
  5: +1,
  6: +1,
  7: 0,
  8: 0,
  9: 0,
  10: -1,
  J: -1,
  Q: -1,
  K: -1,
  A: -1,
};

class Shoe {
  constructor(decks = 6) {
    this.decks = decks;
    this.reset();
  }
  reset() {
    this.cards = [];
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    for (let d = 0; d < this.decks; d++) {
      for (const r of ranks) {
        for (let i = 0; i < 4; i++) this.cards.push(r);
      }
    }
    // Shuffle deck
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    this.index = 0;
  }
  draw() {
    if (this.index >= this.cards.length) return null;
    return this.cards[this.index++];
  }
  remainingCards() {
    return this.cards.length - this.index;
  }
  remainingDecks() {
    return Math.max(0.25, this.remainingCards() / 52);
  }
}

function CountingModule() {
  const [decks, setDecks] = useState(6);
  const [shoe, setShoe] = useState(() => new Shoe(decks));
  const [running, setRunning] = useState(0);
  const [trueCount, setTrueCount] = useState(0);
  const [current, setCurrent] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [corrects, setCorrects] = useState(0);
  const [streak, setStreak] = useState(0);
  const [history, setHistory] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);
  const [errors, setErrors] = useState({ "+1": 0, 0: 0, "-1": 0 });
  const [lastResult, setLastResult] = useState(null);
  const [timedModeActive, setTimedModeActive] = useState(false);
  const [timerSummary, setTimerSummary] = useState(null);

  useEffect(() => {
    const s = new Shoe(decks);
    setShoe(s);
    setRunning(0);
    setTrueCount(0);
    setCurrent(null);
    setHistory([]);
    setErrors({ "+1": 0, 0: 0, "-1": 0 });
    setLastResult(null);
  }, [decks]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "+" || e.key === "=") submit("+1");
      if (e.key === "-") submit("-1");
      if (e.key === "0") submit("0");
      if (e.key === " ") nextCard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => () => {
    clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (timedModeActive && timeLeft === 0) {
      setTimerSummary({
        attempts,
        accuracy: attempts ? Math.round((100 * corrects) / attempts) : 0,
        corrects,
      });
      setTimedModeActive(false);
    }
  }, [timedModeActive, timeLeft, attempts, corrects]);

  function nextCard() {
    const c = shoe.draw();
    if (!c) {
      const s = new Shoe(decks);
      setShoe(s);
      setRunning(0);
      setTrueCount(0);
      setCurrent(null);
      return;
    }
    setCurrent(c);
  }

  function submit(val) {
    if (!current) return;

    const delta = HILO_MAP[current];
    const correctVal = delta.toString();
    setAttempts((a) => a + 1);

    const isCorrect =
      val === correctVal ||
      (correctVal === "1" && val === "+1") ||
      (correctVal.startsWith("-") && val === "-1");

    const correctDisplay = delta > 0 ? "+1" : delta < 0 ? "-1" : "0";

    if (isCorrect) {
      setCorrects((c) => c + 1);
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
      setErrors((e) => ({ ...e, [val]: e[val] + 1 }));
    }

    setLastResult({
      guess: val,
      correct: correctDisplay,
      isCorrect,
      card: current,
    });

    const newRunning = running + delta;
    const decksRemRounded = Math.max(1, Math.round(shoe.remainingDecks()));
    const newTrue = Math.trunc(newRunning / decksRemRounded);

    setRunning(newRunning);
    setTrueCount(newTrue);
    setHistory((h) =>
      [
        {
          card: current,
          your: val,
          correct: correctDisplay,
          rc: newRunning,
          tc: newTrue,
        },
        ...h,
      ].slice(0, 200)
    );

    const next = shoe.draw();
    if (!next) {
      const s = new Shoe(decks);
      setShoe(s);
      setRunning(0);
      setTrueCount(0);
      setCurrent(null);
    } else {
      setCurrent(next);
    }
  }

  function startTimed(seconds = 60) {
    setTimeLeft(seconds);
    setTimerSummary(null);
    setTimedModeActive(true);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() =>
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return t - 1;
      }),
    1000);
  }

  const acc = attempts ? Math.round((100 * corrects) / attempts) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-cyan-50 to-sky-100 px-5 py-4 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Card Counting Trainer</h2>
          <p className="text-sm text-slate-600">Drill Hi-Lo speed and precision in a live shoe.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Decks</label>
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800"
            value={decks}
            onChange={(e)=>setDecks(parseInt(e.target.value))}
          >
            {[1,2,4,6,8].map(d=> <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-lg shadow-slate-900/5 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-24 w-20 items-center justify-center rounded-2xl border-2 border-emerald-300 bg-white text-5xl font-black text-slate-900 shadow-md">
              {current ?? "?"}
            </div>
            <span className="text-sm text-slate-600">Press <kbd className="rounded border border-slate-300 bg-white px-1">+</kbd>/<kbd className="rounded border border-slate-300 bg-white px-1">=</kbd> for +1, <kbd className="rounded border border-slate-300 bg-white px-1">0</kbd> for 0, <kbd className="rounded border border-slate-300 bg-white px-1">-</kbd> for -1. Space deals next card.</span>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3">
            {["+1","0","-1"].map(v=> {
              const isSelected = lastResult?.guess === v;
              const isCorrect = lastResult?.isCorrect && isSelected;
              const isMissedCorrect = !lastResult?.isCorrect && lastResult?.correct === v;
              const buttonClasses = [
                "rounded-2xl border px-4 py-3 text-base font-bold transition focus:outline-none focus:ring-2 focus:ring-emerald-200",
                "border-slate-300 bg-slate-50 hover:-translate-y-0.5 hover:shadow-md",
                isCorrect ? "border-emerald-400 bg-emerald-100 text-emerald-900" : "",
                isSelected && !isCorrect ? "border-rose-300 bg-rose-100 text-rose-900" : "",
                isMissedCorrect ? "border-emerald-400 bg-emerald-100 text-emerald-900" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button key={v} onClick={()=>submit(v)} className={buttonClasses}>{v}</button>
              );
            })}
          </div>
          {lastResult && (
            <div className={`mb-4 rounded-2xl border px-3 py-2 text-sm ${lastResult.isCorrect ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-rose-300 bg-rose-50 text-rose-900"}`}>
              {lastResult.isCorrect ? "Great job!" : "Oops — that's not the Hi-Lo value."} The correct count adjustment for <strong>{lastResult.card}</strong> is <strong>{lastResult.correct}</strong>.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50" onClick={nextCard}>Deal / Next [Space]</button>
            <button className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50" onClick={()=>{const s=new Shoe(decks); setShoe(s); setRunning(0); setTrueCount(0); setAttempts(0); setCorrects(0); setStreak(0); setHistory([]); setErrors({"+1":0,"0":0,"-1":0}); setCurrent(null); setLastResult(null);}}>Reset Shoe</button>
            <button className="rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-900 hover:bg-cyan-100" onClick={()=>startTimed(60)}>Timed 60s</button>
            {timeLeft>0 && <span className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white">Time left: {timeLeft}s</span>}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-lg shadow-slate-900/5 backdrop-blur-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Stats</h3>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Running Count" value={running} accent={running >= 0 ? "text-emerald-700" : "text-rose-700"} />
            <StatCard label="True Count" value={trueCount} accent={trueCount >= 0 ? "text-cyan-700" : "text-rose-700"} />
            <StatCard label="Accuracy" value={`${acc}%`} />
            <StatCard label="Streak" value={streak} />
            <StatCard label="Attempts" value={attempts} />
          </div>
          {timerSummary && (
            <div className="mt-3 rounded-xl border border-cyan-300 bg-cyan-50 p-3 text-sm text-cyan-900">
              <div className="font-semibold">Timed drill complete</div>
              <div>You reviewed <strong>{timerSummary.attempts}</strong> cards with <strong>{timerSummary.corrects}</strong> correct answers ({timerSummary.accuracy}% accuracy).</div>
              <div className="mt-1 text-xs text-cyan-800">Tip: aim for 90%+ before increasing deck count or reducing the timer.</div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-lg shadow-slate-900/5 backdrop-blur-sm">
          <h3 className="mb-1 text-md font-semibold text-slate-900">Recent Cards</h3>
          <div className="mb-3 text-xs text-slate-500">latest first</div>
          <div className="space-y-2 max-h-56 overflow-auto">
            {history.map((h, i)=> (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2 text-sm">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-bold">{h.card}</span>
                <span>Your: <strong>{h.your}</strong></span>
                <span>Correct: <strong>{h.correct}</strong></span>
                <span>RC: <strong>{h.rc}</strong></span>
                <span>TC: <strong>{h.tc}</strong></span>
              </div>
            ))}
            {history.length===0 && <div className="text-sm text-slate-600">No cards yet. Deal to start.</div>}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-lg shadow-slate-900/5 backdrop-blur-sm">
          <h3 className="mb-2 text-md font-semibold text-slate-900">Error Heatmap (by answer)</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            {Object.entries(errors).map(([k,v])=> (
              <div key={k} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="text-sm text-slate-600">{k}</div>
                <div className="text-xl font-bold text-slate-900">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-slate-500">(Advanced upgrade later: per-rank matrix / confusion chart)</div>
        </div>
      </div>

      <details className="rounded-3xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-700 shadow-lg shadow-slate-900/5 backdrop-blur-sm">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Need a refresher on counting?</summary>
        <div className="mt-3 space-y-2 text-sm">
          <p>Hi-Lo assigns +1 to low cards (2–6), 0 to middle cards (7–9), and −1 to tens and aces. Keep a running total as each card appears.</p>
          <p>Divide the running count by remaining decks to estimate the true count. Positive true counts mean the shoe is rich in tens and aces — raise your bets.</p>
          <p className="text-xs text-slate-500">Keyboard shortcuts: <kbd className="rounded border border-slate-300 bg-white px-1">+</kbd>/<kbd className="rounded border border-slate-300 bg-white px-1">=</kbd> = +1, <kbd className="rounded border border-slate-300 bg-white px-1">0</kbd> = 0, <kbd className="rounded border border-slate-300 bg-white px-1">-</kbd> = −1, <kbd className="rounded border border-slate-300 bg-white px-1">Space</kbd> = deal next card.</p>
        </div>
      </details>

      <footer className="text-xs text-slate-500">Counting system: Hi-Lo (+1 = 2-6, 0 = 7-9, -1 = 10-A). True count uses remaining decks (rounded) from the shoe.</footer>
    </div>
  );
}

// ==========================
// Strategy Tables (S17/DAS, no surrender)
// ==========================
const basePairs = [
  { pair: "A", up: range("2","A"), act: "P" },
  { pair: "8", up: range("2","A"), act: "P" },
  { pair: "10", up: range("2","A"), act: "S" },
  { pair: "9", up: ["2","3","4","5","6","8","9"], act: "P" },
  { pair: "7", up: ["2","3","4","5","6","7"], act: "P" },
  { pair: "6", up: ["2","3","4","5","6"], act: "P" },
  { pair: "5", up: ["2","3","4","5","6","7","8","9"], act: "D" },
  { pair: "4", up: ["5","6"], act: "P" },
  { pair: "3", up: ["2","3","4","5","6","7"], act: "P" },
  { pair: "2", up: ["2","3","4","5","6","7"], act: "P" },
];

const baseSoft = [
  { total: 20, up: range("2","A"), act: "S" },
  { total: 19, up: range("2","A"), act: "S" },
  { total: 18, up: ["2","3","4","5","6"], act: "D" },
  { total: 18, up: ["7","8"], act: "S" },
  { total: 18, up: ["9","10","A"], act: "H" },
  { total: 17, up: ["3","4","5","6"], act: "D" },
  { total: 17, up: ["2","7","8","9","10","A"], act: "H" },
  { total: 16, up: ["4","5","6"], act: "D" },
  { total: 16, up: ["2","3","7","8","9","10","A"], act: "H" },
  { total: 15, up: ["4","5","6"], act: "D" },
  { total: 15, up: ["2","3","7","8","9","10","A"], act: "H" },
  { total: 14, up: ["5","6"], act: "D" },
  { total: 14, up: ["2","3","4","7","8","9","10","A"], act: "H" },
  { total: 13, up: ["5","6"], act: "D" },
  { total: 13, up: ["2","3","4","7","8","9","10","A"], act: "H" },
];

const baseHard = [
  { total: 20, up: range("2","A"), act: "S" },
  { total: 19, up: range("2","A"), act: "S" },
  { total: 18, up: range("2","A"), act: "S" },
  { total: 17, up: range("2","A"), act: "S" },
  { total: 16, up: ["2","3","4","5","6"], act: "S" },
  { total: 16, up: ["7","8","9","10","A"], act: "H" },
  { total: 15, up: ["2","3","4","5","6"], act: "S" },
  { total: 15, up: ["7","8","9","10","A"], act: "H" },
  { total: 14, up: ["2","3","4","5","6"], act: "S" },
  { total: 14, up: ["7","8","9","10","A"], act: "H" },
  { total: 13, up: ["2","3","4","5","6"], act: "S" },
  { total: 13, up: ["7","8","9","10","A"], act: "H" },
  { total: 12, up: ["4","5","6"], act: "S" },
  { total: 12, up: ["2","3","7","8","9","10","A"], act: "H" },
  { total: 11, up: ["2","3","4","5","6","7","8","9","10"], act: "D" },
  { total: 11, up: ["A"], act: "H" },
  { total: 10, up: ["2","3","4","5","6","7","8","9"], act: "D" },
  { total: 10, up: ["10","A"], act: "H" },
  { total: 9,  up: ["3","4","5","6"], act: "D" },
  { total: 9,  up: ["2","7","8","9","10","A"], act: "H" },
  { total: 8,  up: range("2","A"), act: "H" },
  { total: 7,  up: range("2","A"), act: "H" },
  { total: 6,  up: range("2","A"), act: "H" },
  { total: 5,  up: range("2","A"), act: "H" },
];

const ddTweaks = [ { type: "hard", total: 9, up: ["2"], act: "D" } ];

function findAction({ pairRank, soft, total }, up, deckMode) {
  const upN = normalizeUp(up);
  if (pairRank) {
    const rule = basePairs.find((r) => r.pair === (["J","Q","K"].includes(pairRank) ? "10" : pairRank) && r.up.includes(upN));
    if (rule) return rule.act;
  }
  if (soft && total >= 13 && total <= 20) {
    const rule = baseSoft.find((r) => r.total === total && r.up.includes(upN));
    if (rule) return rule.act;
  }
  if (!soft) {
    if (deckMode === "2D") {
      const tw = ddTweaks.find((t) => t.type === "hard" && t.total === total && t.up.includes(upN));
      if (tw) return tw.act;
    }
    const rule = baseHard.find((r) => r.total === total && r.up.includes(upN));
    if (rule) return rule.act;
  }
  return "H";
}

// Strategy UI
const ACTIONS = [ { key: "H", label: "Hit" }, { key: "S", label: "Stand" }, { key: "D", label: "Double" }, { key: "P", label: "Split" } ];

function Badge({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
      {children}
    </span>
  );
}

function StatCard({ label, value, accent = "text-slate-900" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 shadow-sm backdrop-blur-sm">
      <div className="text-[11px] uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function StrategyModule() {
  const [deckMode, setDeckMode] = useState("6D");
  const [scenario, setScenario] = useState(()=>generateScenario());
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [history, setHistory] = useState([]);
  const autoAdvanceRef = useRef(null);

  function generateScenario() {
    let p1 = randomCard(); let p2 = randomCard(); let up = randomCard();
    if (["J","Q","K"].includes(up)) up = "10";
    const player = [p1,p2];
    const evald = evaluateHand(player);
    if (evald.total === 21) return generateScenario();
    return { player, up };
  }

  const evald = useMemo(()=>evaluateHand(scenario.player), [scenario]);
  const correct = useMemo(()=>findAction(evald, scenario.up, deckMode), [evald, scenario, deckMode]);

  function next(){ setScenario(generateScenario()); setFeedback(null); }
  function choose(act){
    const isCorrect = act === correct;
    setAttempts(a=>a+1); setScore(s=> isCorrect? s+1 : s); setStreak(st=> isCorrect? st+1 : 0);
    const winChance = isCorrect ? simulateWinProbability(scenario, act, deckMode) : null;
    setFeedback({ chosen: act, isCorrect, winChance });
    setHistory(h=>[{ ts:Date.now(), deck:deckMode, player:[...scenario.player], up:scenario.up, evald, chosen:act, correct }, ...h].slice(0,200));
    clearTimeout(autoAdvanceRef.current);
    if (isCorrect) {
      autoAdvanceRef.current = setTimeout(() => {
        next();
      }, 1200);
    }
  }
  const accuracy = attempts ? Math.round((100*score)/attempts) : 0;

  useEffect(()=>{
    const onKey=(e)=>{ const k=e.key.toLowerCase(); if(k==="h") choose("H"); if(k==="s") choose("S"); if(k==="d") choose("D"); if(k==="p") choose("P"); if(k===" ") next(); };
    window.addEventListener("keydown", onKey); return ()=>window.removeEventListener("keydown", onKey);
  },[scenario, deckMode]);

  useEffect(() => () => {
    clearTimeout(autoAdvanceRef.current);
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="md:col-span-2 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-lg shadow-slate-900/5 backdrop-blur-sm">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">Current Hand</h2>
        <div className="mb-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-16 w-12 items-center justify-center rounded-xl border-2 border-emerald-300 bg-white text-2xl font-black text-slate-900 shadow-sm">{scenario.player[0]}</span>
            <span className="inline-flex h-16 w-12 items-center justify-center rounded-xl border-2 border-emerald-300 bg-white text-2xl font-black text-slate-900 shadow-sm">{scenario.player[1]}</span>
          </div>
          <Badge>Dealer: {scenario.up}</Badge>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Badge>{evald.soft ? `Soft ${evald.total}` : `Hard ${evald.total}`}</Badge>
          {evald.pairRank && <Badge>Pair of {evald.pairRank === "10" ? "10s" : evald.pairRank + "s"}</Badge>}
          <Badge>S17 / DAS / No Surrender</Badge>
          {deckMode === "2D" ? <Badge>2-Deck tweaks on</Badge> : <Badge>6-Deck baseline</Badge>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ACTIONS.map((a)=> (
            <button
              key={a.key}
              onClick={()=>choose(a.key)}
              className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              {a.label} <span className="text-xs text-slate-500">[{a.key}]</span>
            </button>
          ))}
        </div>
        {feedback && (
          <div className={`mt-4 rounded-2xl border p-3 ${feedback.isCorrect ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>
            <div className="font-semibold mb-1">{feedback.isCorrect ? "Correct" : "Not quite"}</div>
            <div className="text-sm text-slate-700">You chose <strong>{ACTIONS.find(x=>x.key===feedback.chosen)?.label}</strong>. The chart says <strong>{ACTIONS.find(x=>x.key===correct)?.label}</strong> for this spot.</div>
            <div className="mt-2 text-xs text-slate-600">Rationale: Pairs, then soft totals, then hard totals. Doubles default to Hit if not allowed.</div>
            {feedback.isCorrect && typeof feedback.winChance === "number" && (
              <div className="mt-2 text-sm text-slate-700">Estimated win chance from here: <strong>{feedback.winChance}%</strong> (simulated).</div>
            )}
            <button onClick={next} className="mt-3 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">Next hand [Space]</button>
          </div>
        )}
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-lg shadow-slate-900/5 backdrop-blur-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Stats</h2>
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Score" value={`${score} / ${attempts}`} />
          <StatCard label="Accuracy" value={`${accuracy}%`} />
          <StatCard label="Streak" value={streak} />
          <StatCard label="Mode" value={deckMode} accent="text-cyan-700" />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Decks</label>
          <select className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800" value={deckMode} onChange={(e)=>setDeckMode(e.target.value)}>
            <option value="2D">2-Deck</option>
            <option value="6D">6-Deck</option>
          </select>
          <button className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50" onClick={()=>{setScore(0); setAttempts(0); setStreak(0); setHistory([]); setFeedback(null);}}>Reset Session</button>
          <button className="w-full rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-900 hover:bg-cyan-100" onClick={()=>next()}>New Hand</button>
        </div>
      </div>
      <div className="md:col-span-3 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-lg shadow-slate-900/5 backdrop-blur-sm">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">Recent Questions</h2>
        <div className="mb-3 text-xs text-slate-500">(latest first)</div>
        <div className="space-y-2 max-h-64 overflow-auto">
          {history.map((h,i)=> (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge>{h.deck}</Badge>
                <Badge>{h.evald.soft ? `Soft ${h.evald.total}` : `Hard ${h.evald.total}`}</Badge>
                {h.evald.pairRank && <Badge>Pair {h.evald.pairRank}</Badge>}
                <Badge>Dealer {h.up}</Badge>
              </div>
              <div className="mt-1 text-sm">You: <strong>{ACTIONS.find(x=>x.key===h.chosen)?.label}</strong> • Correct: <strong>{ACTIONS.find(x=>x.key===h.correct)?.label}</strong></div>
              {typeof h.correctWinChance === "number" && (
                <div className="mt-1 text-xs text-slate-600">
                  Correct move win chance: <strong>{h.correctWinChance}%</strong>
                  {typeof h.chosenWinChance === "number" && (
                    <>
                      {" "}| Your move: <strong>{h.chosenWinChance}%</strong>
                      {h.chosenWinChance !== h.correctWinChance && (
                        <> ({h.chosenWinChance > h.correctWinChance ? "+" : ""}{Math.round((h.chosenWinChance - h.correctWinChance)*10)/10}% vs optimal)</>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {history.length === 0 && (<div className="text-sm text-slate-600">No attempts yet. Pick an action to begin.</div>)}
        </div>
      </div>
      <details className="md:col-span-3 rounded-3xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-700 shadow-lg shadow-slate-900/5 backdrop-blur-sm">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Strategy quick tips & shortcuts</summary>
        <div className="mt-3 space-y-2">
          <p>Remember the decision order: check for splits first, then soft totals, then hard totals. If doubling isn&apos;t allowed, fall back to a hit.</p>
          <p>Keyboard shortcuts: <kbd className="rounded border border-slate-300 bg-white px-1">H</kbd> = Hit, <kbd className="rounded border border-slate-300 bg-white px-1">S</kbd> = Stand, <kbd className="rounded border border-slate-300 bg-white px-1">D</kbd> = Double, <kbd className="rounded border border-slate-300 bg-white px-1">P</kbd> = Split, <kbd className="rounded border border-slate-300 bg-white px-1">Space</kbd> = deal a new hand.</p>
          <p className="text-xs text-slate-500">Tip: leave the trainer in 6-deck mode to practice shoe games, then switch to 2-deck for pitch games and spot the double-down tweaks.</p>
        </div>
      </details>
    </div>
  );
}

// App wrapper with mode switch
export default function App(){
  const [mode, setMode] = useState("strategy");
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50 to-emerald-100 px-4 py-6 text-slate-900 sm:px-6"
      style={{ fontFamily: '"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif' }}
    >
      <div className="pointer-events-none absolute left-0 top-0 -z-10 h-80 w-80 rounded-full bg-cyan-300/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 -z-10 h-96 w-96 rounded-full bg-emerald-300/25 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-5xl">
        <header className="mb-6 rounded-3xl border border-slate-200/80 bg-white/75 px-5 py-4 shadow-lg shadow-slate-900/5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Blackjack Trainer</h1>
              <p className="text-sm text-slate-600">Sharpen basic strategy and counting speed with focused drills.</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Mode</label>
              <select className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800" value={mode} onChange={(e)=>setMode(e.target.value)}>
                <option value="strategy">Basic Strategy</option>
                <option value="counting">Card Counting (Hi‑Lo)</option>
              </select>
            </div>
          </div>
        </header>
        {mode === "strategy" ? <StrategyModule/> : <CountingModule/>}
        <footer className="mt-6 text-center text-xs text-slate-600">Strategy: S17/DAS/no surrender. Counting: Hi-Lo with true count from remaining decks.</footer>
      </div>
    </div>
  );
}
