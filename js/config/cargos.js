/**
 * Cargo table. basePay = money per unit per tile of distance when delivered fast.
 * days1: days in transit with full pay; days2: days of slow decay before steep decay.
 */
export const CARGOS = [
  { id: 'PASS', name: 'Passengers', color: '#3b82f6', basePay: 0.9, days1: 12, days2: 30, unit: 'passengers' },
  { id: 'MAIL', name: 'Mail', color: '#e5e7eb', basePay: 1.1, days1: 8, days2: 25, unit: 'bags' },
  { id: 'COAL', name: 'Coal', color: '#1f2937', basePay: 0.65, days1: 20, days2: 80, unit: 'tonnes' },
  { id: 'WOOD', name: 'Wood', color: '#92400e', basePay: 0.7, days1: 18, days2: 70, unit: 'tonnes' },
  { id: 'OIL', name: 'Oil', color: '#0f172a', basePay: 0.75, days1: 25, days2: 80, unit: 'kilolitres' },
  { id: 'GRAI', name: 'Grain', color: '#eab308', basePay: 0.7, days1: 10, days2: 50, unit: 'tonnes' },
  { id: 'LVST', name: 'Livestock', color: '#d97706', basePay: 0.85, days1: 10, days2: 30, unit: 'items' },
  { id: 'IORE', name: 'Iron Ore', color: '#9a3412', basePay: 0.65, days1: 20, days2: 80, unit: 'tonnes' },
  { id: 'STEL', name: 'Steel', color: '#64748b', basePay: 0.9, days1: 12, days2: 60, unit: 'tonnes' },
  { id: 'GOOD', name: 'Goods', color: '#dc2626', basePay: 1.2, days1: 10, days2: 40, unit: 'crates' },
];

/** Cargo lookup by id. */
export const CARGO_BY_ID = Object.fromEntries(CARGOS.map((c) => [c.id, c]));

/** Ids of all cargos. */
export const CARGO_IDS = CARGOS.map((c) => c.id);
