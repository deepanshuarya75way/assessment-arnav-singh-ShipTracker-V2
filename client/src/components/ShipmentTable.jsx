import { useNavigate } from 'react-router-dom';
import StatusBadge from './StatusBadge';

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatRequestDate = (dateStr)=>
  new Date(dateStr).toLocaleDateString('en-US',{month:'short',days:'numeric',timeZone:'UTC'});

const RequestCell = ({prefs})=>{
  if(!prefs || (!prefs.preferredDate && !prefs.instructions)){
    return <div className="cell-muted">-</div>;
  }
  return(
    <div className="cell-request" title={prefs.instructions || ''}>
      {prefs.preferredDate && <span>Reschedule to {formatRequestDate(prefs.preferredDate)}</span>}
      {prefs.instructions && <span className='req-note'>{prefs.instructions}</span>}
    </div>
  );
};
const ShipmentTable = ({ shipments, loading, isAdmin=false }) => {
  const navigate = useNavigate();

  if (loading) {
    return <p className="loading-state">Loading shipments...</p>;
  }

  if (shipments.length === 0) {
    return (
      <div className="empty-state">
        <p>No shipments found.</p>
      </div>
    );
  }
  const rowClass = isAdmin ? 'shipment-row with-request' : 'ship-row';
  return (
    <div className="panel ship-table">
      <div className="ship-row head">
        <div>Tracking ID</div>
        <div>Origin</div>
        <div>Destination</div>
        <div>Carrier</div>
        <div>Status</div>
        <div>Est. delivery</div>
        {isAdmin && <div>Customer request</div>}
      </div>
      {shipments.map((s) => (
        <div
          key={s._id}
          onClick={() => navigate(`/shipments/${s._id}`)}
          className={`${rowClass} body`}
        >
          <div className="cell-primary">{s.trackingId}</div>
          <div className="cell-muted">{s.origin}</div>
          <div className="cell-muted">{s.destination}</div>
          <div className="cell-muted">{s.carrier}</div>
          <div><StatusBadge status={s.status} /></div>
          <div className="cell-muted">{formatDate(s.estimatedDelivery)}</div>
          {isAdmin && <RequestCell prefs={s.deliveryPreferences}/>}
        </div>
      ))}
    </div>
  );
};

export default ShipmentTable;
