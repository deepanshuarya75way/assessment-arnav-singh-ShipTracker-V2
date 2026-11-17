const LOCKED_STATUSES = ['Out for Delivery', 'Delivered'];


const MIN_DAYS_AHEAD = 1; // earliest: tomorrow
const MAX_DAYS_AHEAD = 21; // latest: three weeks out
const EXCLUDED_WEEKDAYS = [0]; // 0 = Sunday - no Sunday deliveries

const toDateString = (d) => d.toISOString().slice(0, 10); // YYYY-MM-DD


const BUSINESS_TZ = 'Asia/Kolkata';
const DAY = 86400000;
const WINDOW_AFTER_ESTIMATE_DAYS = 14; // window length when the shipment has an estimated date

const getEligibleDates = (now = new Date(), estimatedDelivery = null) => {

  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ })
    .format(now)
    .split('-')
    .map(Number);
  const today = Date.UTC(y, m - 1, d);

  let startDay = today + MIN_DAYS_AHEAD * DAY;
  let endDay = today + MAX_DAYS_AHEAD * DAY;

  if (estimatedDelivery) {
    const e = new Date(estimatedDelivery);
    const est = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
    if (est > startDay) startDay = est;
    endDay = startDay + WINDOW_AFTER_ESTIMATE_DAYS * DAY;
  }

  const dates = [];
  for (let t = startDay; t <= endDay; t += DAY) {
    const day = new Date(t);
    if (!EXCLUDED_WEEKDAYS.includes(day.getUTCDay())) dates.push(toDateString(day));
  }
  return dates;
};

const isLocked = (status) => LOCKED_STATUSES.includes(status);

const getAmendmentState = (shipment, now = new Date()) => {
  const locked = isLocked(shipment.status);
  return {
    canAmend: !locked,
    reason: locked
      ? shipment.status === 'Delivered'
        ? 'This shipment has already been delivered.'
        : 'This shipment is out for delivery, so it can no longer be changed.'
      : null,
    eligibleDates: locked ? [] : getEligibleDates(now, shipment.estimatedDelivery),
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
