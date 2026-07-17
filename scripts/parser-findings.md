# Parser Test Findings — All Files

## Files Tested
1. Alyssa's 12-Week Plan (.docx)
2. Arms Level 1-3 (.pdf) — Body By Rings
3. BBR Phase #1 (.xlsx) — Body By Rings Training Log
4. Beginning Strongman Training (.docx) — AI-generated
5. Functional Shred (.pdf) — multi-column eBook PDF
6. SFS Cutting Workout Program (.pdf) — eBook with non-workout content
7. HYROX Training Weeks 1-4 (.xlsx)
8. Google Docs workout log (.pdf) — personal training log

---

## Patterns

### P1 — `xN` rep notation (no sets count)
**Files**: HYROX, Arms PDF
**Examples**: `Archer Rows x10`, `x8/leg`, `x8–10`, `x8-15`
**What happens**: Not matched by any regex (all require `NxN`). Line captured as name-only exercise, no targets.
**Fix needed**: New pattern matching leading `x` — treat as reps-only when no sets prefix present.

### P2 — MM:SS time format
**Files**: Alyssa (30:30, 1:30, 45:15, 40:20), Arms (1:00, 2:00)
**What happens**: Completely invisible to parser. `1:30` is not matched by TIME_UNIT_FRAGMENT (which only handles s/sec/min).
- Appears as work:rest intervals (`30:30`) — a completely different meaning from MM:SS clock time
- Appears as rest durations (`1:30` rest between sets)
**Fix needed**: Two sub-patterns:
  - `MM:SS` or `M:SS` as a duration → convert to seconds or `Xmin Ys` form
  - `W:R` work/rest interval notation — capture both values

### P3 — Spreadsheet header not on row 0
**Files**: BBR Phase #1 (.xlsx)
**Examples**: Row 0 is "Body By Rings Training Log Phase #1", row 1 is the actual column header
**What happens**: `detectColumns(rows[0])` sees the title text, finds no "exercise" column, falls back to text mode. All data then misread.
**Fix needed**: Scan first N rows (e.g., 5) for a valid header row instead of always checking row 0 only.

### P4 — Markdown/asterisk formatting from AI-generated docs
**Files**: Beginning Strongman (.docx)
**Examples**: `**Day 1: Strength Focus**`, `#### **Week 1: Foundation Building**`, `*Circuit** (3 rounds):`
**What happens**: mammoth strips leading `**` only partially. `stripBullet` removes one `*` character, leaving `*Day 1: Strength Focus**`. DAY_RE requires `^day` so the line doesn't match — all 126+ exercises land in one day.
**Fix needed**: Strip all leading markdown formatting characters (`*`, `#`, `_`) before applying header regexes. Also strip trailing `**`.

### P5 — Calendar date headers
**Files**: Google Docs log (.pdf)
**Examples**: `July 18`, `July 17`, `Jul 14`, `Jul 12`, `Jul 9`, `Jul 3`, `Jul 2`, `Jul 1`
**What happens**: WEEKDAY_RE only knows Mon/Tue/Wed/Thu/Fri/Sat/Sun. Month + day strings not recognized as headers — fall through to `looksLikeHeaderFallback` which fires for some but not others.
**Fix needed**: Add a CALENDAR_DATE_RE matching `(Jan|Feb|Mar|...|Dec)\s*\d{1,2}` and `(January|February|...|December)\s*\d{1,2}`, optionally with year.

### P6 — Reps-before-name format
**Files**: Google Docs log (.pdf)
**Examples**: `14 situps`, `14 cross crunch`, `14 Hanging knee tucks`, `48k 8` (weight then reps), `68k 5`
**What happens**: 
  - `14 situps` — parser sees `14` as leading number but there's no `x` separator, so name becomes "14 situps" with no targets.
  - `48k 8` — weight first, rep count after, no `x`. Parsed as name-only.
**Fix needed**: 
  - Pattern for `N exercise_name` → reps=N, name=rest
  - Pattern for `Nkg N` / `Nlbs N` (weight then reps) → weight + reps with no sets

### P7 — `Name: N unit` (colon-separated count or distance)
**Files**: Strongman, Functional Shred
**Examples**: `Tire Flips: 5 flips`, `Sandbag Carries: 30 meters`, `Farmer's Walk: 20 meters`, `Sandbag Overhead Press: 5 reps`
**What happens**: The colon is treated as part of the exercise name, and `5 flips` / `30 meters` / `5 reps` is either ignored or misread (no `x` or time unit).
**Fix needed**: Handle `Name: N reps` (treat N as reps), and `Name: N meters/m` (treat as distance note). The `:` after a name before a number should be treated like a separator.

### P8 — European decimal comma in weights
**Files**: Google Docs log (.pdf)
**Examples**: `49,75k`, `59,75k`, `17,5k`, `29,75k`
**What happens**: Weight regex looks for `\d+(?:\.\d+)?` — comma decimals aren't matched. `49,75k` is never parsed as a weight.
**Fix needed**: Add `,` as alternative decimal separator in weight patterns: `\d+(?:[.,]\d+)?`.

### P9 — Non-workout boilerplate absorbed as exercises
**Files**: SFS Cutting PDF, Functional Shred PDF
**Examples**: Nutrition sections, disclaimers, copyright pages, motivational text, FAQ sections
**What happens**: Parser has no concept of "this content isn't a workout". Every line of a PDF eBook goes through exercise parsing. Headers like "MACROS", "DISCLAIMER:", "MEALS PER DAY" fire `looksLikeSectionHeader` (all caps, short) and create new "days" containing paragraphs of text.
**Fix needed**: Hard to solve at parse time without NLP. Mitigation options:
  - A minimum exercise-density threshold per day (if <30% of lines in a "day" have any recognizable target, flag the day with a warning)
  - Filter lines that are obviously sentences (contain common non-workout words, end with `.` and are >60 chars)

### P10 — Level/section headers inside a PDF not creating day splits
**Files**: Arms PDF
**Examples**: `Body By Rings - Arms Level 2`, `Body By Rings - Arms Level 3`
**What happens**: These lines are >45 chars, so `looksLikeHeaderFallback` returns false. They don't match WEEK_RE, DAY_RE, or WEEKDAY_RE. They become exercises with no targets inside the single "Day 1" group.
**Fix needed**: These are plan-level section separators. Could be caught by pattern matching on "Level N" or by relaxing the length limit on `looksLikeSectionHeader` for lines that are already inside a day and contain known structural keywords.

### P11 — Multi-column PDF layout garbles exercise text
**Files**: Functional Shred PDF, SFS Cutting PDF
**Examples**: `"DB Snatch ( Alternating  • DB Romanian Deadlift to\nArms)                         Front Lunge"`, `"Walkout Push Ups  • Down Dog Toe Touchers  completion of last exercise"`
**What happens**: pdftotext `-layout` mode reconstructs columns side-by-side with spaces. Two-column workout blocks (Warmup | Workout) merge into one wide line. Exercise names are split across the join point.
**Fix needed**: Detect and split multi-column lines at bullet markers (`•`), or use pdftotext without `-layout` flag (plain flow order). Removing `-layout` would lose some structure but avoid cross-column merging. This is a text-extraction layer issue, not the text parser.

### P12 — `Min N:` EMOM format
**Files**: HYROX
**Examples**: `Min 1: Archer Push-ups x8–10`, `Min 2: Burpee Broad Jumps x5–8`, `Min 3: Bulgarian Split Squats x8/leg`
**What happens**: `Min N:` prefix doesn't match any day/section header regex, and the exercise line `Archer Push-ups x8–10` uses `x` but with an en-dash range (not matched by SET_REP_WEIGHT_RE which only handles `\d+-\d+` with an ASCII hyphen/space).
**Two issues**:
  - `Min N:` lines should be treated as sub-grouping within a circuit, not standalone exercises
  - En-dash (`–`) in rep ranges not normalized to ASCII hyphen

### P13 — Shared set/rest header lines (applies to following exercises)
**Files**: Alyssa, Arms (PDF rest column separate from exercise name)
**Examples**: `3 Sets, 1:30 rest between sets`, `3-4 Sets, 40:20 for ab circuit`, `30:30, 1:15 rest between sets`
**What happens**: These lines describe parameters for the exercises that follow them — they are not exercises themselves. Parser captures them as exercises with no targets.
**Fix needed**: Recognize lines matching `N(-N)? sets[,.]?\s*...` or `N:N, N:N rest...` as circuit/block headers that should be attached to the following exercise group as metadata.

---

## Priority Ranking (impact across files)

| # | Pattern | Files Hit | Severity |
|---|---------|-----------|----------|
| 1 | P2 — MM:SS time format | 2 | High — invisible to every regex |
| 2 | P4 — Markdown asterisks in AI docs | 1 | High — collapses all days into 1 |
| 3 | P3 — Header not on xlsx row 0 | 1 | High — kills structured parsing entirely |
| 4 | P1 — `xN` rep notation | 2 | Medium — very common real-world format |
| 5 | P5 — Calendar date headers | 1 | Medium — common in personal logs |
| 6 | P12 — En-dash in ranges + EMOM format | 1 | Medium |
| 7 | P6 — Reps-before-name / weight-reps | 1 | Medium |
| 8 | P7 — Colon-separated count/distance | 2 | Medium |
| 9 | P11 — Multi-column PDF layout | 2 | Medium — extraction layer |
| 10 | P13 — Shared set/rest header lines | 2 | Low-medium — confirm screen can fix |
| 11 | P8 — European decimal comma | 1 | Low |
| 12 | P9 — Non-workout boilerplate | 2 | Low — hard to solve cleanly |
| 13 | P10 — Level headers inside PDF | 1 | Low |
