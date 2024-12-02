const Bike = require("../models/Bike");
const Order = require("../models/Order");

exports.getBikes = async (req, res) => {
    const bikes = await Bike.find();
    res.render("bikes", { bikes });
};

exports.addBike = async (req, res) => {
    const { name, type, price } = req.body;
    const bike = new Bike({
        name,
        type,
        price,
        available: true,
        image: req.file.path,
    });

    try {
        await bike.save();
        res.redirect("/bikes");
    } catch (err) {
        res.status(500).send("Error adding bike");
    }
};

exports.rentBike = async (req, res) => {
    const bikeId = req.params.id;

    try {
        const bike = await Bike.findById(bikeId);
        if (!bike || !bike.available) {
            return res.status(400).send("Bike not available");
        }

        const order = new Order({
            user: req.session.user._id,
            bike: bike._id,
            rentalDate: new Date(),
            totalCost: bike.price,
        });

        bike.available = false;
        await bike.save();
        await order.save();

        res.redirect("/bikes");
    } catch (err) {
        res.status(500).send("Error renting bike");
    }
};
