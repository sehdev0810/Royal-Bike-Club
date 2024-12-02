const Bike = require("../models/Bike");

exports.adminPanel = async (req, res) => {
    const bikes = await Bike.find();
    res.render("admin", { bikes });
};
