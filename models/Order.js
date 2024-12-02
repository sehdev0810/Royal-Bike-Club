const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    bike: { type: mongoose.Schema.Types.ObjectId, ref: "Bike" },
    rentalDate: Date,
    returnDate: Date,
    totalCost: Number,
    status: { type: String, enum: ["Pending", "Completed"], default: "Pending" },
});

module.exports = mongoose.model("Order", orderSchema);
