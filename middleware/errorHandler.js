// Centralized error handler. Any error passed to next(err) — including
// ones thrown inside catchAsync-wrapped controllers — ends up here
// instead of being handled inconsistently in every controller.
module.exports = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;

    if (!err.isOperational) {
        // Unexpected/programmer error: log full detail server-side,
        // never leak stack traces or internals to the client.
        console.error("UNEXPECTED ERROR:", err);
    } else {
        console.error(err.message);
    }

    const message =
        err.isOperational && statusCode < 500
            ? err.message
            : "Something went wrong. Please try again.";

    if (req.accepts("html")) {
        return res.status(statusCode).send(message);
    }

    res.status(statusCode).json({ success: false, message });
};
