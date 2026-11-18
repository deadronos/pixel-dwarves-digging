# Issue 77 excavation pacing replay

Replayed the simulation from `aea9908` using fresh colonies with six dwarves,
no upgrades, the default work directive, and the five seeds from the original
measurement. Each tick uses the normal simulation engine. At 1×, 6,000 ticks
represent 10 minutes. Percentages use the initial mineable block count for
each seed and exclude bedrock. [Issue #77](https://github.com/deadronos/pixel-dwarves-digging/issues/77)

## Default pacing

| Seed | 1:40 | 5 min | 10 min | 20 min | Longest mining gap through 20 min |
| ---- | ---: | ----: | -----: | -----: | --------------------------------: |
| a1   |  239 |   516 |    697 |    851 |                            10.3 s |
| b2   |  225 |   470 |    580 |    716 |                            11.2 s |
| c3   |  237 |   524 |    677 |    825 |                            10.3 s |
| d4   |  246 |   527 |    716 |    874 |                            10.2 s |
| e5   |  215 |   457 |    637 |    896 |                            16.8 s |
| Mean |  232 |   499 |    661 |    832 |                                   |

The colonies cleared 7.77% on average by 10 minutes and 9.77% by 20 minutes.
The first 10 minutes produced 30% more blocks than the 510 per run reported
in the previous issue update. First relics appeared between 38.4 seconds and
2 minutes 8.1 seconds in these seeds. The opening supports a quick relic run,
while the one-hour full-clear target requires a sustained average near 142
blocks per minute. [Previous pacing baseline](https://github.com/deadronos/pixel-dwarves-digging/issues/77#issuecomment-6960246752)

| Time window | Blocks per minute | Mean outbound haul path | Mean load per dispatched haul |
| ----------- | ----------------: | ----------------------: | ----------------------------: |
| 0–1:40      |             139.4 |              16.3 cells |                          2.06 |
| 1:40–5 min  |              79.9 |              47.5 cells |                          2.07 |
| 5–10 min    |              32.5 |              94.6 cells |                          1.42 |
| 10–20 min   |              17.1 |             136.7 cells |                          1.21 |

From minute 10 to 20, the dwarves spent 58% of their ticks traveling to a dig or
haul destination and 35% idle. Only 5% of ticks showed a dig task at its site.
Every run had eight depots at 20 minutes and still had 13–34 unreserved storage
slots. The longest stretch without a mined block was 16.8 seconds.

Among 1,243 samples of grounded, unloaded idle dwarves in the second 10
minutes, 991 had all exposed targets claimed, 236 had zero reachable exposed
faces, 15 had at least one safe dig, and one had support failures. Bootstrap
protection had already ended for all runs. These end-of-tick snapshots show
available work at the sampled moment. A newly idle dwarf may start an
assignment during the next tick. Haul distances and loads are measured at
first assignment of a routed haul, before any detours or retries.

## One-hour default replay

Seed `b2` reached 716 blocks at 20 minutes and 1,081 blocks at 25:34. That
was its last mined block. It was still at 1,081 of 8,486 mineable blocks
(12.74%) at 60 minutes, with 37 storage slots free and the colony reporting
`awaiting-recovery`. This is one seed, so the replay establishes a reproducible
late stall without estimating how often it happens across maps.

## Existing logistics directives

| Seed | Default at 20 min | Expand logistics at 10 min | Expand logistics at 20 min | Expand + finish current route at 20 min |
| ---- | ----------------: | -------------------------: | -------------------------: | --------------------------------------: |
| a1   |               851 |                        732 |                      1,051 |                                     922 |
| b2   |               716 |                        635 |                        846 |                                     837 |
| c3   |               825 |                        839 |                      1,019 |                                         |
| d4   |               874 |                        636 |                        784 |                                         |
| e5   |               896 |                        648 |                        883 |                                     801 |

With main-stockpile-first hauling, Expand logistics averaged 698 blocks at
10 minutes and 917 at 20 minutes. It improved the 20-minute result on three
of five seeds, for a 10% gain on average. During minutes 10–20, its mean
outbound haul fell from 137 to 111 cells and its mining rate rose from 17.1
to 21.9 blocks per minute. It still spent 34% of dwarf-ticks idle.

Switching to Finish current route makes newly assigned hauls pick the
shortest available path. With Expand logistics, this improved the 10-minute
result on a1 and b2 but lowered it on e5. At 20 minutes all three runs were
behind Expand logistics with the default haul directive. Depot location,
route safety, storage availability and quarry geometry all continue to
change as a run progresses.

## Balance implications

Keep the opening as a baseline for relic play. For full clears, turn the
b2 recovery failure into a regression replay and open additional safe mining
faces before the colony exhausts its current ones. Compare depot placement
that follows the active work against the current early buildout. Measure
both against the 10–20 minute rate, longest no-mining interval and share cleared
at 60 minutes before tuning base dig speed or staffing.

## Mitigation and checkpoint replay

At tick 15,420, three b2 dwarves at (7, 5) were grounded but still marked
stranded. They had a 56-step path to the stockpile and paths to depots
with room. The stale tasks kept the colony in `awaiting-recovery`, blocking
the search that could reopen a mining face.

The engine now clears a grounded dwarf's stranded task when there is
already a route to a completed store. It also checks for new safe work
while at least two dwarves are waiting and others are digging. An access
build still needs a reachable site, funding, and a demonstrated safe dig
with a route to storage. Expand logistics can fund up to two additional
depots per stockpile when work is at least 32 walking cells from existing
storage. The depot check measures coverage and the haul directive still
decides which destination to use.

A development replay also repeated an outpost task without delivering
material. Invalid depot and outpost scaffolds now use the same cancellation
and refund path as invalid access orders. The refund includes carried units
through the existing reservations and gives the assigned builders back to
the scheduler.

The original checkpoint mined its next block at tick 15,463, 43 ticks
after loading. Default logistics reached 1,310 blocks, 229 beyond the
original plateau, before filling all 744 storage slots. It last mined
at 30:52 and still had 1,310 blocks at minute 60. The separate outpost
checkpoint resumed after four ticks and added 27 blocks in 200 ticks.
The regression suite also checks that a builder who falls releases the
reservation for the stone it carries into recovery.

Starting the same stalled checkpoint with Expand logistics reached
1,641 blocks before filling all 888 slots. Its last clear was at 44:51.
It remained blocked on storage at minute 60. That run started before the
falling-builder accounting fix. The ten fresh 20-minute block totals
matched between the two builds.

## Updated pacing

| Directive        | Mean blocks at 10 min, before → after | Mean blocks at 20 min, before → after |
| ---------------- | ------------------------------------: | ------------------------------------: |
| Default          |                             661 → 767 |                           832 → 1,153 |
| Expand logistics |                             698 → 861 |                           917 → 1,189 |

| Seed | Updated default at 20 min | Updated Expand logistics at 20 min |
| ---- | ------------------------: | ---------------------------------: |
| a1   |                     1,116 |                              1,206 |
| b2   |                       922 |                              1,227 |
| c3   |                     1,274 |                              1,068 |
| d4   |                     1,180 |                              1,227 |
| e5   |                     1,273 |                              1,215 |

The five-seed default replay averaged 767 blocks at 10 minutes and 1,153
at 20 minutes, gains of 16% and 39%. Between minutes 10 and 20, mining
rose from 17.1 to 38.6 blocks per minute, average haul length fell from
137 to 89 cells, and idle time fell from 35% to 17%. Seed c3 was blocked
at the final tick with full storage. Expand logistics improved the
20-minute result by 30% against its own baseline and had free storage
at minute 20 on all five seeds.

In an isolation check using the mitigation code with only the extra
Expand slots changed, b2 cleared 1,164 blocks with eight slots and
1,227 with ten. c3 cleared 1,206 with eight and 1,068 with ten.
The longest mining gap over 20 minutes fell from 22 seconds to 12.8
on b2 and to 16.1 on c3. That gives the extra slots a mixed throughput
result and a shorter longest gap in this two-seed sample.

## Reproduce

Run from the repository root after `npm ci`. The replays used Node v26.12.0.
The runner prints JSON Lines at 1,000 and 3,000 ticks, every 6,000 ticks after
that, and at the requested end tick.

```sh
node tools/pacing-replay.mjs balanced 12000 a1 b2 c3 d4 e5
node tools/pacing-replay.mjs expand 12000 a1 b2 c3 d4 e5
PACING_HAULING=finish-current-route node tools/pacing-replay.mjs expand 12000 a1 b2 e5
node tools/pacing-replay.mjs balanced 36000 b2
```

To regenerate the original stalled checkpoint with the current runner,
export the baseline game code and reuse the installed dependencies.

```sh
pacing_baseline_dir=$(mktemp -d)
git archive 8db67db src/game package.json | tar -x -C "$pacing_baseline_dir"
mkdir "$pacing_baseline_dir/tools"
cp tools/pacing-replay.mjs "$pacing_baseline_dir/tools/"
ln -s "$PWD/node_modules" "$pacing_baseline_dir/node_modules"
(cd "$pacing_baseline_dir" && PACING_CAPTURE="$pacing_baseline_dir/b2.json" \
  node tools/pacing-replay.mjs balanced 15420 b2)
PACING_RESUME="$pacing_baseline_dir/b2.json" node tools/pacing-replay.mjs balanced 36000 b2
PACING_RESUME="$pacing_baseline_dir/b2.json" node tools/pacing-replay.mjs expand 36000 b2
```
