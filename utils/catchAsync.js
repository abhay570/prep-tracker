// Wraps an async route handler so any rejected promise / thrown error
// is forwarded to Express's error-handling middleware instead of
// crashing the process or requiring a try/catch in every controller.
module.exports = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
