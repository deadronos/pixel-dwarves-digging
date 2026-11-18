# Surface shipments prototype

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
This tests one late checkpoint. Fresh runs across all five seeds through
60 minutes are needed before setting default shipment rates or modes.

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
