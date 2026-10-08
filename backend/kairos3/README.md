# Kairos 3.0 Paper Trader & Robustness Specification

## Architecture Overview
Kairos 3.0 builds upon Kairos 2.0 with a **Queue-Aware Candidate Selection Policy** and **Three Quantitative Robustness Guards** designed to eliminate climax exhaustion traps, minimize premium decay during chop, and prevent slippage on illiquid option strikes.

Unit: `/etc/systemd/system/kairos3.service`; code and private state `/home/ubuntu/kairos3`.
Engine Version: `kairos3-paper-1`
Entry Policy: `kairos3-e3-queue-robust-20261008`

---

## 1. Candidate Selection Policy Updates
1. **Exhaustion Ceiling (`MAX_POLE_MOVE = 3.5%`):**
   - Rejects setups where the opening flag pole move exceeded 3.5%.
   - Eliminates overextended climax exhaustion traps (e.g., NAUKRI 4.98% drop on Oct 8, PGEL 7.88% surge).
2. **Early Noise Deferral (`<= 09:55`):**
   - Before 10:00 AM, Tier 0/1 setups (`REVERSE_POLE`, `LATE_POLE`) require AI Score $\ge 80\%$.
   - Prevents burning the daily trade slot on early opening false breaks when higher-tier setups are building.
3. **Queue-Aware Structural Ranking:**
   - Rank order: Issue timestamp $\rightarrow$ Pattern Tier (`PDH_BREAK_FLAG` (4) > `STANDARD` (3) > `CASCADE` (2) > `REVERSE_POLE` (1) > `LATE_POLE` (0)) $\rightarrow$ AI Score descending $\rightarrow$ Symbol.
4. **Single-Lot Budget Buffer (`MAX_SINGLE_LOT_BUDGET = ₹35,000`):**
   - Permits exactly 1 whole minimum lot up to ₹35,000 when high-conviction quality setups slightly exceed the standard ₹30,000 multi-lot cap (e.g., ADANIENSOL 1300 PE at ₹33,818 on Oct 8).

---

## 2. The Three Robustness Guards
1. **Guard 1: Strict -10% Initial Stop & Early Breakeven Ratchet:**
   - Initial stop tightened from $-15.0\%$ to $-10.0\%$ to cap bad trades early.
   - Ratchet schedule:
     - Peak gain $\ge +8\%$ $\rightarrow$ Stop moves to $-4\%$ (slashes risk immediately).
     - Peak gain $\ge +12\%$ $\rightarrow$ Stop moves to $+2\%$ (locks in breakeven/small green).
     - Peak gain $\ge +25\%$ $\rightarrow$ Stop moves to $+15\%$ (locks in core win).
     - Peak gain $\ge +45\%$ $\rightarrow$ Stop moves to $+30\%$ (secures strong trend).
     - Peak gain $\ge +70\%$ $\rightarrow$ Stop moves to $+50\%$.
2. **Guard 2: 45-Minute Stagnancy Cut:**
   - If position has been held for $\ge 45$ minutes and option gain is $< +2.0\%$ from entry fill, immediately exit with reason `STAGNANCY_45M`.
   - Protects against theta decay bleed and frees margin during flat range-bound sessions.
3. **Guard 3: Max Bid-Ask Spread Filter (`MAX_BID_ASK_SPREAD_PCT = 6.0%`):**
   - Rejects contracts where `(ask - bid) / ask * 100 > 6.0%` at entry time.
   - Prevents fill slippage from eroding edge on illiquid option contracts.

---

## 3. Backtested Performance Comparison (77 Historical Sessions)
Simulated across all available trading sessions in `research.duckdb` (42.9M option bars) and October 7/8, 2026 live parquets:

| Metric | Kairos 2.0 (Baseline) | Kairos 3.0 (New Policy + 3 Guards) | Delta / Improvement |
| :--- | :---: | :---: | :---: |
| **Total Traded Sessions** | 77 | 77 | — |
| **Win Rate** | 49.4% | 41.6% | -7.8% (due to early 45m scratch cuts) |
| **Profit Factor** | **1.22** | **1.59** | **+30.3% improvement** |
| **Total Option Return** | **+104.7%** | **+184.8%** | **+80.1% higher returns** |
| **Mean Return per Trade**| **+1.36%** | **+2.40%** | **+76.5% higher expectancy** |
| **Max Peak-to-Trough DD** | **149.9%** | **107.6%** | **-42.3% lower drawdown** |
| **Estimated Rupee P&L** | **₹31,410** | **₹55,440** | **+₹24,030 (+76.5% profit)** |

### Exit Distribution Breakdown:
- **Kairos 2.0:** 36 Time Exits (11:30), 27 Full Stop Losses (-15%), 14 Trailing Stops.
- **Kairos 3.0:** 28 Stagnancy Cuts (45m), 26 Stop Losses (-10% or ratcheted), 15 Trailing Stops, 8 Time Exits.
