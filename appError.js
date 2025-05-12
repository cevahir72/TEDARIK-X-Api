// Global error class extending built-in Error class
class AppError extends Error {
    constructor(
        message,
        statusCode,
        isOperational = true,
        name = 'Error',
        stack = ''
    ) {
        super(message)
        // assisn statusCode and status
        this.statusCode = statusCode
        this.status = `${statusCode}`.startsWith(4) ? 'fail' : 'error'
        this.isOperational = isOperational
        this.name = name
        if (stack) {
            this.stack = stack
        }
        Error.captureStackTrace(this, this.constructor)
    }
}
module.exports = AppError
