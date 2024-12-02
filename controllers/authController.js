const User = require("../models/User");
const bcrypt = require("bcrypt");

exports.register = async (req, res) => {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });

    try {
        await user.save();
        res.redirect("/login");
    } catch (err) {
        res.status(500).send("Error registering user");
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.send("Invalid credentials");
    }

    req.session.user = user;
    res.redirect("/");
};

exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
};
