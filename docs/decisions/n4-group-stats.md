# Group list statistics follow-up (N4)

UI/display only. No simulation state, command rule, save format or RNG use changed; the world hash is unchanged
(`e66b684174510b6b`). Every number is derived read-only from existing vehicle fields when the vehicle list
window refreshes, so there is no per-tick cost.

## Already present (W3, verified)

- `groupStatistics` / group-by buckets: profit this year, profit last year and current usage (occupancy %).
- Selected-group details panel: "Profit this year", "Profit last year", "Current usage".
- Bucket rows: "Total this year", "Average this year", "Total last year", "Usage".
- Plain vehicle list sorts: "Number" and "Total capacity".

## Added

1. `groupKindCounts(vehicles)` and `groupKindLabel(counts)` in `js/ui/vehicleGroupRows.js`: vehicle count by
   kind (train / road / aircraft / ship) plus the total. Unknown kinds count only towards the total.
   `groupStatistics` now returns the same breakdown in `counts`; group buckets carry it too.
2. Selected-group details panel gets a read-only "Vehicles" row, e.g. `5 (3 train, 2 road)`.
   Grouped bucket rows keep their "N vehicles" text and expose the per-kind breakdown as the cell tooltip.
3. Bucket sort options: "Total profit last year", "Current usage", "Total capacity" and "Number"
   (the bucket leader's unit number, matching the plain list's Number sort, which sorts buckets by their
   first member because members are name-ordered).
