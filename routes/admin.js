const express = require("express");
const { adminPanel } = require("../controllers/adminController");
const router = express.Router();

const ensureAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.email === process.env.ADMIN_EMAIL) {
        return next();
    }
    res.status(403).send("Access Denied");
};

router.get("/admin", ensureAdmin, adminPanel);

module.exports = router;
