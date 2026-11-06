/** Calendar helpers (365-day years, no leap years). */

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Advance a date object by one day in place.
 * @param {{year:number,month:number,day:number}} date
 * @returns {{newMonth:boolean,newYear:boolean}}
 */
export function advanceDay(date) {
  date.day++;
  let newMonth = false, newYear = false;
  if (date.day > MONTH_DAYS[date.month]) {
    date.day = 1;
    date.month++;
    newMonth = true;
    if (date.month > 11) { date.month = 0; date.year++; newYear = true; }
  }
  return { newMonth, newYear };
}

/** Format as "1 Jan 1950". */
export function formatDate(date) {
  return `${date.day} ${MONTH_NAMES[date.month]} ${date.year}`;
}

/** Days in the month of the given date. */
export function daysInMonth(date) {
  return MONTH_DAYS[date.month];
}

/** Absolute day number of a date (365-day years): used for service intervals. */
export function dayNumber(date) {
  let n = date.year * 365 + date.day - 1;
  for (let m = 0; m < date.month; m++) n += MONTH_DAYS[m];
  return n;
}

/** Inverse of dayNumber. */
export function dateFromDayNumber(n) {
  let year = Math.floor(n / 365), rem = n - year * 365, month = 0;
  while (month < 11 && rem >= MONTH_DAYS[month]) { rem -= MONTH_DAYS[month]; month++; }
  return { year, month, day: rem + 1 };
}
