import { useMemo, useState } from 'react';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n) => String(n).padStart(2, '0');
const toKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; 



const DeliveryCalendar = ({ eligibleDates, value, onChange }) => {
  const eligible = useMemo(() => new Set(eligibleDates), [eligibleDates]);

  const months = useMemo(
    () => [...new Set(eligibleDates.map((d) => d.slice(0, 7)))].sort(),
    [eligibleDates]
  );

  const [monthIdx, setMonthIdx] = useState(0);

  if (months.length === 0) {
    return <p className="app-sub">No delivery dates are currently available.</p>;
  }

  const [year, month1] = months[Math.min(monthIdx, months.length - 1)].split('-').map(Number);
  const month = month1 - 1;
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(<span key={`e${i}`} className="cal-empty" />);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = toKey(year, month, d);
    const isEligible = eligible.has(key);
    cells.push(
      <button
        key={key}
        type="button"
        disabled={!isEligible}
        aria-pressed={value === key}
        aria-label={key}
        className={`cal-day${value === key ? ' selected' : ''}`}
        onClick={() => onChange(key)}
      >
        {d}
      </button>
    );
  }

  return (
    <div className="cal">
      <div className="cal-head">
        <button
          type="button"
          className="cal-nav"
          aria-label="Previous month"
          disabled={monthIdx === 0}
          onClick={() => setMonthIdx(monthIdx - 1)}
        >
          ‹
        </button>
        <span className="cal-title">
          {MONTHS[month]} {year}
        </span>
        <button
          type="button"
          className="cal-nav"
          aria-label="Next month"
          disabled={monthIdx >= months.length - 1}
          onClick={() => setMonthIdx(monthIdx + 1)}
        >
          ›
        </button>
      </div>
      <div className="cal-grid">
        {DOW.map((d, i) => (
          <span key={i} className="cal-dow">{d}</span>
        ))}
        {cells}
      </div>
    </div>
  );
};

export default DeliveryCalendar;
