/**
 * ErrorMiddleware
 *
 * Global error handler for the Express application.
 * Maps domain errors, Mongoose validation/cast errors, and Mongo duplicate
 * key errors into consistent, safe JSON responses.
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../Core/Errors';

export class ErrorMiddleware {
  static handleError(err: any, req: Request, res: Response, _next: NextFunction) {
    let status = err.statusCode || err.status || err.httpStatus || 500;
    let message = err.message || 'Internal Server Error';
    let code = err.code;

    if (err instanceof AppError) {
      status = err.statusCode;
      message = err.message;
      code = err.code;
    } else if (err?.name === 'CastError') {
      status = 400;
      message = 'Invalid identifier format';
      code = 'INVALID_ID';
    } else if (err?.name === 'ValidationError') {
      status = 400;
      const firstErr = Object.values(err.errors || {})[0] as any;
      message = firstErr?.message || err.message || 'Validation failed';
      code = 'VALIDATION_ERROR';
    } else if (err?.code === 11000) {
      status = 409;
      message = 'A record with this unique identifier already exists.';
      code = 'DUPLICATE_KEY';
    } else if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && status === 400)) {
      status = 400;
      message = 'Malformed JSON payload';
      code = 'INVALID_JSON';
    }

    if (status >= 500) {
      console.error(`[ERROR] ${new Date().toISOString()} ${req.method} ${req.originalUrl}:`, err);
    } else {
      console.warn(`[WARN] ${new Date().toISOString()} ${req.method} ${req.originalUrl} (${status}): ${message}`);
    }

    const isProd = process.env.NODE_ENV === 'production';
    const clientMessage = status >= 500 && isProd ? 'Internal Server Error' : message;

    res.locals.errorDetails = status >= 500 ? `${message}${err?.stack ? `\n${String(err.stack).slice(0, 600)}` : ''}` : message;
    res.locals.errorCode = code;

    res.status(status).json({
      success: false,
      message: clientMessage,
      ...(code ? { code } : {}),
      ...(err instanceof AppError && err.details !== undefined ? { details: err.details } : {}),
      stack: isProd ? null : err.stack,
    });
  }
}
