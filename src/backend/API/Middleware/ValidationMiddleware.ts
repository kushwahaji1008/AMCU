/**
 * ValidationMiddleware
 * 
 * Defines input validation rules for various API endpoints using express-validator.
 * This ensures data integrity and protects against malformed requests.
 */

import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

/**
 * Validation rules for user registration.
 * Enforces strong password policy and valid email format.
 */
export const validateRegistration = [
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters long'),
  body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Password contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),
  body('role').isIn(['admin', 'operator']).withMessage('Invalid role'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

/**
 * Validation rules for user login.
 */
export const validateLogin = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

/**
 * Validation rules for creating/updating farmer records.
 */
export const validateFarmer = [
  body('farmerId').trim().notEmpty().withMessage('Farmer ID is required'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('mobile').isMobilePhone('any').withMessage('Invalid mobile number'),
  body('village').trim().notEmpty().withMessage('Village is required'),
  body('cattleType').isIn(['Cow', 'Buffalo', 'Mixed']).withMessage('Invalid cattle type'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];
