import { useState } from 'react';
import DeliveryCalendar from './DeliveryCalendar';

const MAX_NOTE = 500;

const formatDay = (d) =>
  new Date(d).toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });

const formatStamp = (d) =>
  new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const CurrentRequest = ({ prefs }) => (
  <dl className="amend-current">
    {prefs.preferredDate && (
      <>
        <dt>Requested delivery date</dt>
        <dd>{formatDay(prefs.preferredDate)}</dd>
      </>
    )}
    {prefs.address && (
      <>
        <dt>Delivery address</dt>
        <dd>{prefs.address}</dd>
      </>
    )}
    {prefs.instructions && (
      <>
        <dt>Delivery instructions</dt>
        <dd>{prefs.instructions}</dd>
      </>
    )}
    {prefs.updatedAt && (
      <>
        <dt>Last updated</dt>
        <dd>{formatStamp(prefs.updatedAt)}</dd>
      </>
    )}
  </dl>
);

// Customers: reschedule + instructions form (locked once Out for Delivery).
// Admins (dispatch): read-only view of whatever the customer requested.
const DeliveryAmendmentPanel = ({ shipment, isAdmin, onSave }) => {
  const prefs = shipment.deliveryPreferences;
  const amendment = shipment.amendment || { canAmend: false, eligibleDates: [] };

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hasRequest = prefs && (prefs.preferredDate || prefs.instructions || prefs.address);

  // Dispatch view
  if (isAdmin) {
    return (
      <div className="panel detail-card">
        <div className="amend-head">
          <h2>Customer delivery request</h2>
        </div>
        {hasRequest ? (
          <CurrentRequest prefs={prefs} />
        ) : (
          <p className="app-sub">The customer hasn't requested any delivery changes.</p>
        )}
        {!amendment.canAmend && amendment.reason && <p className="amend-locked">Locked: {amendment.reason}</p>}
      </div>
    );
  }

  const openForm = () => {
    setDate('');
    setNote(prefs?.instructions || '');
    setAddress(prefs?.address || '');
    setError('');
    setOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!date && !note.trim() && !address.trim()) {
      setError('Pick a new date, or add an address or delivery instructions.');
      return;
    }
    setSaving(true);
    try {
      const payload = {};
      if (date) payload.preferredDate = date;
      if (note.trim()) payload.instructions = note.trim();
      if (address.trim()) payload.address = address.trim();
      await onSave(payload);
      setOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save your changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel detail-card">
      <div className="amend-head">
        <h2>Delivery options</h2>
        {amendment.canAmend && !open && (
          <button onClick={openForm} className="btn-secondary">
            Reschedule / add instructions
          </button>
        )}
      </div>

      {hasRequest && <CurrentRequest prefs={prefs} />}

      {!amendment.canAmend && (
        <p className="amend-locked">{amendment.reason || 'Delivery changes are no longer available.'}</p>
      )}

      {amendment.canAmend && !open && !hasRequest && (
        <p className="app-sub">
          Won't be home? Pick a different delivery day or leave a gate code / drop-off note.
        </p>
      )}

      {amendment.canAmend && open && (
        <form onSubmit={handleSubmit} className="amend-form">
          {error && <div className="alert-error">{error}</div>}

          <div className="form-field">
            <label>
              New delivery date <span className="optional">(optional)</span>
            </label>
            <DeliveryCalendar eligibleDates={amendment.eligibleDates} value={date} onChange={setDate} />
          </div>

          <div className="form-field">
            <label htmlFor="delivery-address">
              Delivery address <span className="optional">(street, landmark, pincode)</span>
            </label>
            <input
              id="delivery-address"
              type="text"
              maxLength={200}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 12 MG Road, near City Mall, 560001"
            />
          </div>

          <div className="form-field">
            <label htmlFor="delivery-note">
              Delivery instructions <span className="optional">(optional)</span>
            </label>
            <textarea
              id="delivery-note"
              value={note}
              maxLength={MAX_NOTE}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Gate code 4411, or leave with neighbour at no. 12"
            />
            <div className="amend-count">{note.length}/{MAX_NOTE}</div>
          </div>

          <div className="amend-actions">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default DeliveryAmendmentPanel;
