const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  totalSeats: {
    type: Number,
    required: true,
    default: 0  // Default value can be set if needed, e.g., 0
  },
  numberOfSeatsLeft: {
    type: Number,
    required: true,
    default: 0  // Default value, this can be updated dynamically based on bookings
  }
});

const Trip = mongoose.model('Trip', tripSchema);

module.exports = Trip;
