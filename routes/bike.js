const express = require("express");
const multer = require("multer");
const { addBike, getBikes, rentBike } = require("../controllers/bikeController");
const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.get("/bikes", getBikes);
router.post("/bikes", upload.single("image"), addBike);
router.post("/rent-bike/:id", rentBike);

module.exports = router;
