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
  // T29: OpenTTD CT_VALUABLES (payment 7509, days 1/32); only exists in games with extra industries (banks)
  { id: 'VALU', name: 'Valuables', color: '#facc15', basePay: 1.47, days1: 1, days2: 32, unit: 'bags' },
  // T-IN: OpenLoco-style chain cargos (extraIndustries only). Payment rates follow OpenTTD's temperate values in spirit.
  { id: 'STON', name: 'Stone', color: '#a8a29e', basePay: 0.6, days1: 20, days2: 80, unit: 'tonnes' },
  { id: 'BMAT', name: 'Building Materials', color: '#b45f3c', basePay: 0.8, days1: 14, days2: 60, unit: 'tonnes' },
  { id: 'PAPR', name: 'Paper', color: '#e7e5e4', basePay: 0.75, days1: 12, days2: 50, unit: 'tonnes' },
  { id: 'FOOD', name: 'Food', color: '#f97316', basePay: 1.0, days1: 4, days2: 30, unit: 'tonnes' },
  // TP: sub-tropical WATER (OpenTTD CT_WATER); only tropic games place water industries or water vehicles.
  { id: 'WATER', name: 'Water', color: '#38bdf8', basePay: 0.9, days1: 12, days2: 40, unit: 'kilolitres' },
  // TP: sub-tropical cargos (OpenTTD CT_RUBBER, CT_FRUIT, CT_MAIZE, CT_COPPER_ORE, CT_DIAMONDS; WOOD is existing); tropic games only
  { id: 'RUBBER', name: 'Rubber', color: '#1f2937', basePay: 0.95, days1: 2, days2: 20, unit: 'litres' },
  { id: 'FRUIT', name: 'Fruit', color: '#e11d48', basePay: 1.1, days1: 0, days2: 15, unit: 'tonnes' },
  { id: 'MAIZE', name: 'Maize', color: '#facc15', basePay: 0.7, days1: 10, days2: 40, unit: 'tonnes' },
  { id: 'COPPER_ORE', name: 'Copper Ore', color: '#b45309', basePay: 0.85, days1: 12, days2: 255, unit: 'tonnes' },
  { id: 'DIAMONDS', name: 'Diamonds', color: '#67e8f9', basePay: 1.6, days1: 10, days2: 255, unit: 'bags' },
];

/** Cargo lookup by id. */
export const CARGO_BY_ID = Object.fromEntries(CARGOS.map((c) => [c.id, c]));

/** Ids of all cargos. */
export const CARGO_IDS = CARGOS.map((c) => c.id);
