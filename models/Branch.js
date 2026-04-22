const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    /** Human-readable location label, e.g. "Sabadell, Spain" */
    location: {
      type: String,
      trim: true,
      default: '',
    },
    /** @deprecated Use `location`; kept for older clients */
    address: {
      type: String,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    currency: {
      type: String,
      default: 'EUR',
      uppercase: true,
      match: [/^[A-Z]{3}$/, 'Currency must be a valid 3-letter code'],
    },
    language: {
      type: String,
      default: 'es',
      lowercase: true,
    },
    timezone: {
      type: String,
      default: 'Europe/Madrid',
      trim: true,
    },
    /** WGS84 — optional; used by clients for distance / maps */
    latitude: {
      type: Number,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180,
    },
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

branchSchema.index({ isActive: 1, name: 1 });

module.exports = mongoose.model('Branch', branchSchema);
