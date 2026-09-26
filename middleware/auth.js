const jwt = require("jsonwebtoken");
const User = require("../models/User");
const catchAsync = require("../utils/catchAsync");

const auth = catchAsync(async (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.redirect("/login");
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        res.clearCookie("token");
        return res.redirect("/login");
    }

    // A valid signature only proves the token was issued by us — it
    // doesn't mean the account still exists.
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
        res.clearCookie("token");
        return res.redirect("/login");
    }

    req.user = { id: currentUser._id.toString(), name: currentUser.name, email: currentUser.email };

    // Makes the logged-in user available to every EJS view (sidebar shows the name)
    res.locals.user = req.user;

    next();
});

module.exports = auth;
