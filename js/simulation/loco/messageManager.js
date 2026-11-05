/**
 * Ported from OpenLoco (MIT), src/MessageManager.cpp updateDaily (0x004285E1) + src/Message.cpp message type descriptors.
 * OpenLoco messages expire `duration` days after they were posted. transit-tycoon news items carry
 * { date: absolute day, duration } (set by news.js pushNews from MESSAGE_KINDS); ageing removes expired items.
 * Items without `date` (old saves) never expire. Durations follow Message.cpp (advice 30-60, general 120-180).
 */
import { MONTH_DAYS } from '../date.js';

/** kind -> { duration (days), priority } (Message.cpp descriptors: advice 60/1, general 120/2, company news 180/3). */
export const MESSAGE_KINDS = {
  info: { duration: 120, priority: 2 },
  good: { duration: 180, priority: 3 },
  bad: { duration: 180, priority: 3 },
};

/** Absolute day number of a date (365-day years). */
export function absoluteDay(date) {
  let d = date.year * 365 + date.day;
  for (let m = 0; m < date.month; m++) d += MONTH_DAYS[m];
  return d;
}

/** MessageManager::updateDaily: drop expired messages (iterating from the newest, like the original). */
export function updateDaily(game) {
  const s = game.state;
  const news = s.news;
  if (!news || !news.length) return;
  const today = absoluteDay(s.date);
  for (let i = news.length - 1; i >= 0; i--) {
    const m = news[i];
    if (typeof m.date === 'number' && typeof m.duration === 'number' && today >= m.date + m.duration) news.splice(i, 1);
  }
}
