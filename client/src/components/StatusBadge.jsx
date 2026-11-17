const STATUS_STYLES = {
  Pending: 'badge-pending',
  'In Transit': 'badge-transit',
  Customs: 'badge-customs', 'Out for Delivery':'badge-ofd',
  Delivered: 'badge-delivered',
};

const StatusBadge = ({ status }) => {
  const style = STATUS_STYLES[status] || 'badge-pending';
  return <span className={`badge ${style}`}>{status}</span>;
};

export default StatusBadge;
