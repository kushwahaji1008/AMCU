/**
 * ErrorMiddleware
 * 
 * Global error handler for the Express application.
 * Catches all unhandled errors and returns a standardized JSON response.
 */

import { Request, Response, NextFunction } from 'express';

export class ErrorMiddleware {
  /**
   * Standard error handling middleware.
   * Properly detects HTTP status codes and returns appropriate responses.
   */
  static handleError(err: any, req: Request, res: Response, next: NextFunction) {
    // Log the error for server-side monitoring
    console.error(`[ERROR] ${new Date().toISOString()}: ${err.message}`);
    
    // Proper status code detection with fallback chain
    const status = err.statusCode || err.status || err.httpStatus || 500;
    const message = err.message || 'Internal Server Error';

    // Send a clean error response to the client
    res.status(status).json({
      success: false,
      message,
      // Hide stack traces in production for security
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
  }
}