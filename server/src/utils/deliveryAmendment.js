const LOCKED_STATUSES = ['Out for Delivery', 'Delivered'];

// Allowable reschedule window, in days from today (UTC).
const MIN_DAYS_AHEAD = 1; // earliest: tomorrow
const MAX_DAYS_AHEAD = 21; // latest: three weeks out
const EXCLUDED_WEEKDAYS = [0]; // 0 = Sunday - no Sunday deliveries

const toDateString = (d) => d.toISOString().slice(0, 10); // YYYY-MM-DD

// Returns eligible delivery days as 'YYYY-MM-DD' strings.
const getEligibleDates = (now = new Date()) => {
  const dates = [];
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = MIN_DAYS_AHEAD; i <= MAX_DAYS_AHEAD; i++) {
    const d = new Date(base + i * 86400000);
    if (!EXCLUDED_WEEKDAYS.includes(d.getUTCDay())) dates.push(toDateString(d));
  }
  return dates;
};

const isLocked = (status) => LOCKED_STATUSES.includes(status);

// Describes whether (and why not) a shipment can currently be amended.
const getAmendmentState = (shipment, now = new Date()) => {
  const locked = isLocked(shipment.status);
  return {
    canAmend: !locked,
    reason: locked
      ? shipment.status === 'Delivered'
        ? 'This shipment has already been delivered.'
        : 'This shipment is out for delivery, so it can no longer be changed.'
      : null,
    eligibleDates: locked ? [] : getEligibleDates(now),
  };
};

module.exports = {
  LOCKED_STATUSES,
  MIN_DAYS_AHEAD,
  MAX_DAYS_AHEAD,
  getEligibleDates,
  isLocked,
  getAmendmentState,
};
