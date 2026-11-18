# Shipments, freight, workshops and mining crews

Shipments are opt-in from the Colony tab in the Inspector. The main
stockpile ships at most 24 blocks every 100 simulation ticks. Spoil mode
ships common materials. Surplus mode also ships coal, iron and crystal.
Both retain relics, construction commitments, emergency materials and
the per-material reserves. The ledger records units shipped during the
run. It persists across save and load, and resets for a new mine or prestige.

## First replay

The starting point was the same b2 checkpoint used in the #77 recovery
investigation, at tick 15,420 with 1,081 blocks cleared. All three cases use
balanced construction and the stockpile-first haul directive. Policy was
set at the checkpoint and each replay ran to tick 21,000, or 35 minutes
at 1×.

| Surface shipment mode | Blocks cleared | Blocks shipped | Free storage | Last mining tick |
| --------------------- | -------------: | -------------: | -----------: | ---------------: |
| Keep stock            |          1,310 |              0 |            0 |           18,516 |
| Ship common spoil     |          1,303 |              1 |            0 |           17,689 |
| Ship spoil and ores   |          1,505 |            466 |          242 |           20,978 |

The spoil-only mode left the stockpile too little eligible material to
keep shipping. Spoil and ores freed enough headroom for continuing
excavation, with 195 more blocks cleared by minute 35 than Keep stock.
This tests one late checkpoint on the shipment prototype. The combined
experiment below uses the newer freight and workshop routing rules.

## Freight and workshop design

A shaft lift would reward building a straight vertical route and could
support stops at successive levels. It would need shaft alignment and landing
sites, which the current depot planner does not consider. A fixed minecart
route can serve a depot off the main shaft, but rails through turns and height
changes would need their own placement rules. The prototype uses a single
fixed depot-to-stockpile connection that follows existing walkable access.
It costs 12 spare stone, keeps the endpoints for the run, and transfers up
to 12 blocks per dispatch. It models cargo and backpressure without a cart
sprite or separate track construction.

The player's first workshop decision is whether to keep local raw material
for later or turn it into building stone and free two storage slots per
batch. Enabling the directive equips completed depots and outposts to
process spoil without a separate building cost. Construction can consume
the stone locally, and freight and shipments can carry surplus out.

## Combined replay at 10 minutes

Each run starts fresh with Expand logistics and Main stockpile first.
The comparison uses the issue 77 defaults for the same seeds. All on enables
spoil and ore shipments, depot freight, spoil workshops, and the second crew.

| Seed | Blocks with options off | Blocks with all on | Free slots off → on | Shipped | Freight moved | Workshop batches |
| ---- | ----------------------: | -----------------: | ------------------: | ------: | ------------: | ---------------: |
| a1   |                     933 |              1,028 |             32 → 69 |     579 |           453 |               18 |
| b2   |                     884 |              1,002 |             32 → 74 |     574 |           197 |                8 |
| c3   |                     798 |                899 |             15 → 76 |     534 |           228 |               11 |
| d4   |                     900 |                810 |             18 → 77 |     477 |           508 |               27 |
| e5   |                     788 |                853 |             26 → 82 |     501 |           585 |               31 |

The mean rose from 861 to 918 blocks, a 6.7% gain. All five seeds kept more
storage headroom and used freight and workshops. The workshops processed
24–93 inputs per seed and produced 8–31 stone, freeing 16–62 storage slots
before accounting for subsequent hauling and construction. Seed d4 cleared
90 fewer blocks despite freeing storage, so more capacity alone is a poor
predictor of excavation rate.

## Isolating the change on b2 at 20 minutes

| Options                | Blocks cleared | Mean assigned haul | Simultaneous-face time | Longest mining gap |
| ---------------------- | -------------: | -----------------: | ---------------------: | -----------------: |
| Off                    |          1,227 |         52.5 cells |                142.6 s |             12.8 s |
| Surplus shipments only |          1,271 |         65.2 cells |                136.3 s |             16.0 s |
| Second crew only       |          1,126 |         55.4 cells |                125.9 s |             17.7 s |
| All on                 |          1,409 |         51.0 cells |                166.9 s |             16.3 s |

The mean assigned haul is the path length at assignment, before detours
or retries. Simultaneous-face time counts ticks with diggers at stands for
two or more targets separated by over four tiles. No run in this
comparison reported `storage-full` during the first 20 minutes.
With all options active, 420 blocks traveled by freight and 27 workshop
batches processed 81 input blocks. The combined run cleared 138 more
blocks than shipment-only and its assigned hauls averaged 14.2 cells
shorter. The isolated second-crew option hurt throughput and reduced
simultaneous-face time on this seed. Keep the options player-controlled
while testing more combinations and seeds. Fresh 60-minute comparisons
and comparative freight-disconnection counts remain unmeasured.

## Recovered saves

On the issue 77 checkpoint, all options with Expand logistics reached
1,453 blocks at tick 18,000, up from 1,259 with Expand alone in the
earlier replay. At tick 21,000, the combined run had cleared 1,699
blocks with 496 unreserved storage slots and mined again on the
penultimate tick. Its longest mining gap after loading was 11.8 seconds.

The exported nine-dwarf `cavern-6020` save started at tick 18,868 and
917 blocks cleared. Both runs kept Balanced construction. After
three simulated minutes, the options-off run had cleared 1,185 blocks
but had no free storage and was awaiting recovery. All on cleared
1,184 with 272 free slots and no active blocker. Its longest mining
gap fell from 19.4 to 7.3 seconds and its time with at least two active
faces rose from 35.9 to 38.5 seconds. The run shipped 331 blocks and
processed 36 workshop batches. Freight stayed idle without a linked depot.

## Reproduce

Regenerate the b2 checkpoint using the baseline export in
[the issue 77 replay](issue-77-pacing-replay.md#reproduce). Point
`PACING_RESUME` at that save and use the same end tick for all modes.

```sh
for shipment_mode in off spoil surplus; do
  PACING_RESUME="$pacing_baseline_dir/b2.json" PACING_SHIPMENTS="$shipment_mode" \
    node tools/pacing-replay.mjs balanced 21000 b2
done
```

Run the combined fresh replay at 10 minutes. Use 12,000 or 36,000 ticks
for the 20- or 60-minute checkpoints.

```sh
PACING_SHIPMENTS=surplus PACING_FREIGHT=1 PACING_WORKSHOP=1 PACING_SECOND_CREW=1 \
  node tools/pacing-replay.mjs expand 6000 a1 b2 c3 d4 e5
```
