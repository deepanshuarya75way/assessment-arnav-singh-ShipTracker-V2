const { validationResult } = require('express-validator');
const Shipment = require('../models/Shipment');
const asyncHandler = require('../utils/asyncHandler');
const { getAmendmentState, getEligibleDates, isLocked } = require('../utils/deliveryAmendment');

// Attaches the computed `amendment` block (canAmend / reason / eligibleDates)
// to a shipment response, so the client never has to re-implement the lock
// or window rules - it just renders what the server says.
const withAmendment = (shipment) => ({
  ...shipment.toObject(),
  amendment: getAmendmentState(shipment),
});

// Small helper: builds the base Mongo filter for list/detail queries based
// on role. Centralizing this in one place means every read endpoint enforces
// "customers only see their own shipments" the same way - there's no route
// where someone could forget to scope the query.
const scopeToOwner = (req, filter = {}) => {
  if (req.user.role !== 'admin') {
    filter.owner = req.user._id;
  }
  return filter;
};

// @route   POST /api/shipments
// @access  Private (any authenticated user)
const createShipment = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }

  const { origin, destination, carrier, estimatedDelivery, trackingId } = req.body;

  const shipment = await Shipment.create({
    trackingId,
    owner: req.user._id,
    origin,
    destination,
    carrier,
    estimatedDelivery,
    status: 'Pending',
    statusHistory: [
      {
        status: 'Pending',
        note: 'Shipment created',
        updatedBy: req.user._id,
      },
    ],
  });

  res.status(201).json(shipment);
});

// @route   GET /api/shipments
// @access  Private (admin: all shipments. customer: only their own)
// Supports: ?status=In+Transit  ?origin=shanghai  ?destination=la  ?search=ST-2026
const getShipments = asyncHandler(async (req, res) => {
  const { status, origin, destination, search } = req.query;

  const filter = scopeToOwner(req);

  if (status) filter.status = status;
  // Case-insensitive partial match - "la" should match "Los Angeles, US"
  if (origin) filter.origin = { $regex: origin, $options: 'i' };
  if (destination) filter.destination = { $regex: destination, $options: 'i' };

  // Free-text search across a few fields at once, for a single dashboard
  // search box rather than separate inputs per field.
  if (search) {
    filter.$or = [
      { trackingId: { $regex: search, $options: 'i' } },
      { origin: { $regex: search, $options: 'i' } },
      { destination: { $regex: search, $options: 'i' } },
      { carrier: { $regex: search, $options: 'i' } },
    ];
  }

  const shipments = await Shipment.find(filter).sort({ createdAt: -1 });
  res.status(200).json(shipments);
});

// @route   GET /api/shipments/summary
// @access  Private (admin: across all shipments. customer: only their own)
// Powers the dashboard's summary cards (total / in-transit / delayed).
const getShipmentSummary = asyncHandler(async (req, res) => {
  const filter = scopeToOwner(req);

  const [total, inTransit, delivered, delayed] = await Promise.all([
    Shipment.countDocuments(filter),
    Shipment.countDocuments({ ...filter, status: 'In Transit' }),
    Shipment.countDocuments({ ...filter, status: 'Delivered' }),
    // "Delayed" isn't its own status - it's derived: still in progress,
    // but past its estimated delivery date.
    Shipment.countDocuments({
      ...filter,
      status: { $ne: 'Delivered' },
      estimatedDelivery: { $lt: new Date() },
    }),
  ]);

  res.status(200).json({ total, inTransit, delivered, delayed });
});

// @route   GET /api/shipments/:id
// @access  Private (admin: any. customer: only if they own it)
const getShipmentById = asyncHandler(async (req, res) => {
  const filter = scopeToOwner(req, { _id: req.params.id });

  const shipment = await Shipment.findOne(filter);

  // Returning 404 (not 403) when a customer requests someone else's shipment
  // ID - this avoids confirming to an unauthorized caller that a given
  // tracking ID even exists in the system.
  if (!shipment) {
    return res.status(404).json({ message: 'Shipment not found' });
  }

  res.status(200).json(withAmendment(shipment));
});

// @route   PUT /api/shipments/:id
// @access  Private/Admin
// Updates core shipment details only - NOT status. Status changes go
// through the /history endpoints below, so every status change is always
// captured as a timeline entry rather than silently overwritten.
const updateShipment = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }

  const { origin, destination, carrier, estimatedDelivery } = req.body;

  const shipment = await Shipment.findById(req.params.id);
  if (!shipment) {
    return res.status(404).json({ message: 'Shipment not found' });
  }

  if (origin !== undefined) shipment.origin = origin;
  if (destination !== undefined) shipment.destination = destination;
  if (carrier !== undefined) shipment.carrier = carrier;
  if (estimatedDelivery !== undefined) shipment.estimatedDelivery = estimatedDelivery;

  const updated = await shipment.save();
  res.status(200).json(withAmendment(updated));
});

// @route   DELETE /api/shipments/:id
// @access  Private/Admin
const deleteShipment = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findById(req.params.id);
  if (!shipment) {
    return res.status(404).json({ message: 'Shipment not found' });
  }

  await shipment.deleteOne();
  res.status(200).json({ message: 'Shipment deleted', _id: req.params.id });
});

// ---- Status history sub-resource ----

// @route   POST /api/shipments/:id/history
// @access  Private/Admin
// Adds a new timeline entry AND syncs shipment.status to match it, since
// the latest history entry always represents the shipment's current status.
const addStatusUpdate = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }

  const { status, note, timestamp } = req.body;

  const shipment = await Shipment.findById(req.params.id);
  if (!shipment) {
    return res.status(404).json({ message: 'Shipment not found' });
  }

  shipment.statusHistory.push({
    status,
    note,
    timestamp: timestamp || Date.now(),
    updatedBy: req.user._id,
  });
  shipment.status = status;

  const updated = await shipment.save();
  res.status(201).json(withAmendment(updated));
});

// @route   PATCH /api/shipments/:id/history/:historyId
// @access  Private/Admin
const updateStatusEntry = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }

  const shipment = await Shipment.findById(req.params.id);
  if (!shipment) {
    return res.status(404).json({ message: 'Shipment not found' });
  }

  // .id() is Mongoose's built-in lookup for a subdocument by its _id -
  // this is exactly why we kept _id enabled on statusUpdateSchema.
  const entry = shipment.statusHistory.id(req.params.historyId);
  if (!entry) {
    return res.status(404).json({ message: 'Status history entry not found' });
  }

  const { status, note, timestamp } = req.body;
  if (status !== undefined) entry.status = status;
  if (note !== undefined) entry.note = note;
  if (timestamp !== undefined) entry.timestamp = timestamp;

  // Keep shipment.status in sync: recompute it as whichever entry is now
  // chronologically most recent, in case an edit changed the ordering.
  const latest = [...shipment.statusHistory].sort((a, b) => b.timestamp - a.timestamp)[0];
  if (latest) shipment.status = latest.status;

  const updated = await shipment.save();
  res.status(200).json(withAmendment(updated));
});

// @route   DELETE /api/shipments/:id/history/:historyId
// @access  Private/Admin
const deleteStatusEntry = asyncHandler(async (req, res) => {
  const shipment = await Shipment.findById(req.params.id);
  if (!shipment) {
    return res.status(404).json({ message: 'Shipment not found' });
  }

  const entry = shipment.statusHistory.id(req.params.historyId);
  if (!entry) {
    return res.status(404).json({ message: 'Status history entry not found' });
  }

  entry.deleteOne();

  // Re-sync shipment.status to whatever is now the latest remaining entry.
  // If the deleted entry was the only one, statusHistory is empty and we
  // leave shipment.status as-is rather than guessing.
  const latest = [...shipment.statusHistory].sort((a, b) => b.timestamp - a.timestamp)[0];
  if (latest) shipment.status = latest.status;

  const updated = await shipment.save();
  res.status(200).json(withAmendment(updated));
});

// ---- Customer delivery amendment ----

// @route   PATCH /api/shipments/:id/delivery-preferences
// @access  Private (owner customer, or admin). Locked once Out for Delivery.
// Lets the customer pick a new delivery date from the eligible window and/or
// leave delivery instructions (gate code, neighbour drop-off...). Dispatch
// sees the result straight away because it's stored on the shipment itself.
const updateDeliveryPreferences = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }

  const preferredDate = req.body.preferredDate || undefined;
  const instructions = typeof req.body.instructions === 'string' ? req.body.instructions.trim() : undefined;

  if (!preferredDate && !instructions) {
    return res.status(400).json({ message: 'Provide a new delivery date and/or delivery instructions' });
  }

  // Same ownership scoping as the read endpoints (404 for someone else's shipment).
  const filter = scopeToOwner(req, { _id: req.params.id });
  const shipment = await Shipment.findOne(filter);
  if (!shipment) {
    return res.status(404).json({ message: 'Shipment not found' });
  }

  if (isLocked(shipment.status)) {
    return res.status(409).json({
      message: getAmendmentState(shipment).reason,
    });
  }

  if (preferredDate && !getEligibleDates().includes(preferredDate)) {
    return res.status(400).json({ message: 'That date is not available for delivery. Please pick an eligible day.' });
  }

  // Keep whichever half the customer didn't touch this time.
  const current = shipment.deliveryPreferences || {};
  const next = {
    preferredDate: preferredDate ? new Date(`${preferredDate}T00:00:00.000Z`) : current.preferredDate,
    instructions: instructions !== undefined && instructions !== '' ? instructions : current.instructions,
    updatedBy: req.user._id,
    updatedAt: new Date(),
  };

  // Atomic guard: the status condition is part of the update itself, so if
  // dispatch flips the shipment to "Out for Delivery" between the read above
  // and this write, the amendment is rejected rather than slipping through.
  const updated = await Shipment.findOneAndUpdate(
    { _id: shipment._id, status: { $nin: ['Out for Delivery', 'Delivered'] } },
    { $set: { deliveryPreferences: next } },
    { new: true, runValidators: true }
  );

  if (!updated) {
    return res.status(409).json({
      message: 'This shipment is out for delivery, so it can no longer be changed.',
    });
  }

  res.status(200).json(withAmendment(updated));
});

module.exports = {
  createShipment,
  getShipments,
  getShipmentSummary,
  getShipmentById,
  updateShipment,
  deleteShipment,
  addStatusUpdate,
  updateStatusEntry,
  deleteStatusEntry,
  updateDeliveryPreferences,
};
