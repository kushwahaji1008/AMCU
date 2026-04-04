import { Request, Response, NextFunction } from 'express';

export class ErrorMiddleware {
  static handleError(err: any, req: Request, res: Response, next: NextFunction) {
    console.error(`[ERROR] ${new Date().toISOString()}: ${err.message}`);
    
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';

    res.status(status).json({
      success: false,
      message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
  }
}
