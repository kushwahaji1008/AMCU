/**
 * ValidationMiddleware
 *
 * Centralized input validation rules using express-validator.
 */

import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { isValidDatabaseId } from '../../Core/RequestContext';

const handleValidationErrors = (context: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn(`[VALIDATION ERROR] ${context}:`, errors.array());
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array(),
      });
    }
    next();
  };
};

const strongPasswordRule = (field: string = 'password', optional: boolean = false) => {
  const chain = optional ? body(field).optional({ values: 'undefined' }) : body(field);
  return chain
    .isString()
    .withMessage('Password must be a string')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/)
    .withMessage('Password must contain at least one special character');
};

function isValidFatSnfPair(fat: number, snf: number): boolean {
  if (fat >= 3.0 && fat < 6.0) {
    return snf >= 8.0 && snf <= 8.5;
  }
  if (fat >= 6.0 && fat <= 10.0) {
    return snf >= 8.3 && snf <= 9.0;
  }
  return false;
}

export const validateRegistration = [
  body('username').trim().isLength({ min: 3, max: 100 }).withMessage('Username must be at least 3 characters long'),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail().withMessage('Invalid email address'),
  strongPasswordRule('password'),
  body('role').isIn(['admin', 'operator']).withMessage('Invalid role'),
  body('dairyData.name')
    .if(body('dairyData').exists())
    .trim()
    .notEmpty()
    .withMessage('Dairy name is required'),
  body('dairyData.address')
    .if(body('dairyData').exists())
    .trim()
    .notEmpty()
    .withMessage('Dairy address is required'),
  body('dairyData.contact')
    .if(body('dairyData').exists())
    .trim()
    .notEmpty()
    .withMessage('Dairy contact is required'),
  body('dairyData.databaseId')
    .optional({ values: 'falsy' })
    .trim()
    .custom((val) => isValidDatabaseId(val))
    .withMessage('Invalid dairy database ID format'),
  handleValidationErrors('Registration'),
];

export const validateLogin = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required').isString().withMessage('Password must be a string'),
  handleValidationErrors('Login'),
];

export const validateAdminVerify = [
  body('email').trim().notEmpty().withMessage('Email is required'),
  body('password').notEmpty().withMessage('Password is required').isString().withMessage('Password must be a string'),
  handleValidationErrors('AdminVerify'),
];

export const validatePasswordUpdate = [
  strongPasswordRule('password'),
  handleValidationErrors('PasswordUpdate'),
];

export const validateUserCreate = [
  body('username').trim().isLength({ min: 3, max: 100 }).withMessage('Username must be at least 3 characters long'),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail().withMessage('Invalid email address'),
  strongPasswordRule('password'),
  body('role').optional().isIn(['admin', 'operator']).withMessage('Invalid role'),
  handleValidationErrors('UserCreate'),
];

export const validateUserUpdate = [
  body('status').optional().isIn(['active', 'inactive']).withMessage('Invalid status'),
  body('role').optional().isIn(['admin', 'operator']).withMessage('Invalid role'),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail().withMessage('Invalid email address'),
  strongPasswordRule('password', true),
  handleValidationErrors('UserUpdate'),
];

export const validateFarmer = [
  body('farmerId').trim().notEmpty().withMessage('Farmer ID is required'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('mobile').trim().isMobilePhone('any').withMessage('Invalid mobile number'),
  body('village').trim().notEmpty().withMessage('Village is required'),
  body('cattleType').isIn(['Cow', 'Buffalo', 'Mixed']).withMessage('Invalid cattle type'),
  body('status').optional().isIn(['Active', 'Inactive']).withMessage('Invalid status'),
  handleValidationErrors('Farmer'),
];

export const validateFarmerUpdate = [
  body('farmerId').optional().trim().notEmpty().withMessage('Farmer ID cannot be empty'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('mobile').optional().trim().isMobilePhone('any').withMessage('Invalid mobile number'),
  body('village').optional().trim().notEmpty().withMessage('Village cannot be empty'),
  body('cattleType').optional().isIn(['Cow', 'Buffalo', 'Mixed']).withMessage('Invalid cattle type'),
  body('status').optional().isIn(['Active', 'Inactive']).withMessage('Invalid status'),
  handleValidationErrors('FarmerUpdate'),
];

export const validateCollection = [
  body().custom((bodyVal) => {
    if (!bodyVal?.farmerInternalId && !bodyVal?.farmerId) {
      throw new Error('Farmer record is required');
    }
    return true;
  }),
  body('quantity').isFloat({ min: 0.1, max: 1000 }).withMessage('Quantity must be between 0.1 and 1000 liters'),
  body('fat').isFloat({ min: 0, max: 20 }).withMessage('FAT must be a valid number between 0 and 20'),
  body('snf').isFloat({ min: 0, max: 15 }).withMessage('SNF must be a valid number between 0 and 15'),
  body('clr').optional().isFloat({ min: 0, max: 40 }).withMessage('CLR must be between 0 and 40'),
  body('shift').isIn(['Morning', 'Evening']).withMessage('Shift must be Morning or Evening'),
  body('milkType').optional().isIn(['Cow', 'Buffalo', 'Mixed']).withMessage('Invalid milk type'),
  handleValidationErrors('Collection'),
  (req: Request, res: Response, next: NextFunction) => {
    const fat = parseFloat(req.body.fat);
    const snf = parseFloat(req.body.snf);

    if (!isValidFatSnfPair(fat, snf)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid FAT/SNF combination. FAT must be 3.0-5.9 with SNF 8.0-8.5, OR FAT 6.0-10.0 with SNF 8.3-9.0',
      });
    }

    next();
  },
];

export const validateCollectionUpdate = [
  body('quantity').optional().isFloat({ min: 0.1, max: 1000 }).withMessage('Quantity must be between 0.1 and 1000 liters'),
  body('fat').optional().isFloat({ min: 0, max: 20 }).withMessage('FAT must be a valid number between 0 and 20'),
  body('snf').optional().isFloat({ min: 0, max: 15 }).withMessage('SNF must be a valid number between 0 and 15'),
  body('clr').optional().isFloat({ min: 0, max: 40 }).withMessage('CLR must be between 0 and 40'),
  body('rate').optional().isFloat({ min: 0, max: 1000 }).withMessage('Rate must be non-negative'),
  body('shift').optional().isIn(['Morning', 'Evening']).withMessage('Shift must be Morning or Evening'),
  body('milkType').optional().isIn(['Cow', 'Buffalo', 'Mixed']).withMessage('Invalid milk type'),
  handleValidationErrors('CollectionUpdate'),
  (req: Request, res: Response, next: NextFunction) => {
    if (req.body.fat !== undefined && req.body.snf !== undefined) {
      const fat = parseFloat(req.body.fat);
      const snf = parseFloat(req.body.snf);
      if (!isValidFatSnfPair(fat, snf)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid FAT/SNF combination. FAT must be 3.0-5.9 with SNF 8.0-8.5, OR FAT 6.0-10.0 with SNF 8.3-9.0',
        });
      }
    }
    next();
  },
];

export const validateShiftSummary = [
  body('date').trim().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be in YYYY-MM-DD format'),
  body('shift').isIn(['Morning', 'Evening']).withMessage('Shift must be Morning or Evening'),
  body('totalFarmers').optional().isInt({ min: 0 }).withMessage('Invalid total farmers'),
  body('totalQuantity').optional().isFloat({ min: 0 }).withMessage('Invalid total quantity'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Invalid total amount'),
  handleValidationErrors('ShiftSummary'),
];

export const validateCustomer = [
  body('name').trim().notEmpty().withMessage('Customer name is required'),
  body('mobile').trim().isMobilePhone('any').withMessage('Invalid mobile number'),
  body('type').optional().isIn(['Individual', 'Commercial']).withMessage('Invalid customer type'),
  body('defaultSaleRate').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Default rate must be non-negative'),
  handleValidationErrors('Customer'),
];

export const validateCustomerUpdate = [
  body('name').optional().trim().notEmpty().withMessage('Customer name cannot be empty'),
  body('mobile').optional().trim().isMobilePhone('any').withMessage('Invalid mobile number'),
  body('type').optional().isIn(['Individual', 'Commercial']).withMessage('Invalid customer type'),
  body('status').optional().isIn(['Active', 'Inactive']).withMessage('Invalid status'),
  body('defaultSaleRate').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Default rate must be non-negative'),
  handleValidationErrors('CustomerUpdate'),
];

export const validateSale = [
  body('customerId').trim().notEmpty().withMessage('Customer is required'),
  body('milkType').optional().isIn(['Cow', 'Buffalo', 'Mixed']).withMessage('Invalid milk type'),
  body('quantity').isFloat({ gt: 0, max: 10000 }).withMessage('Quantity must be greater than 0'),
  body('rate').isFloat({ min: 0, max: 10000 }).withMessage('Rate must be a valid non-negative number'),
  body('paymentMode').isIn(['Cash', 'Credit', 'UPI']).withMessage('Invalid payment mode'),
  handleValidationErrors('Sale'),
];

export const validateCustomerPayment = [
  body('customerId').trim().notEmpty().withMessage('Customer is required'),
  body('amount').isFloat({ gt: 0, max: 10000000 }).withMessage('Payment amount must be greater than 0'),
  body('paymentMode').optional().isIn(['Cash', 'UPI', 'Bank Transfer']).withMessage('Invalid payment mode'),
  handleValidationErrors('CustomerPayment'),
];

export const validateFarmerPayment = [
  body().custom((bodyVal) => {
    if (!bodyVal?.farmerInternalId && !bodyVal?.farmerId) {
      throw new Error('Farmer is required');
    }
    return true;
  }),
  body('amount').isFloat({ gt: 0, max: 10000000 }).withMessage('Payment amount must be greater than 0'),
  handleValidationErrors('FarmerPayment'),
];

export const validateRate = [
  body('milkType').optional().isIn(['Cow', 'Buffalo', 'Mixed']).withMessage('Invalid milk type'),
  body().custom((val) => {
    const hasPoint = val?.fat !== undefined && val?.snf !== undefined && val?.rate !== undefined;
    const hasRange =
      val?.fatMin !== undefined &&
      val?.fatMax !== undefined &&
      val?.snfMin !== undefined &&
      val?.snfMax !== undefined &&
      val?.ratePerLiter !== undefined;
    if (!hasPoint && !hasRange) {
      throw new Error('Rate details (fat/snf/rate or fatMin/fatMax/snfMin/snfMax/ratePerLiter) are required');
    }
    return true;
  }),
  body('fat').optional().isFloat({ min: 0, max: 20 }).withMessage('Invalid FAT'),
  body('snf').optional().isFloat({ min: 0, max: 15 }).withMessage('Invalid SNF'),
  body('rate').optional().isFloat({ min: 0, max: 1000 }).withMessage('Invalid rate'),
  body('fatMin').optional().isFloat({ min: 0, max: 20 }).withMessage('Invalid fatMin'),
  body('fatMax').optional().isFloat({ min: 0, max: 20 }).withMessage('Invalid fatMax'),
  body('snfMin').optional().isFloat({ min: 0, max: 15 }).withMessage('Invalid snfMin'),
  body('snfMax').optional().isFloat({ min: 0, max: 15 }).withMessage('Invalid snfMax'),
  body('ratePerLiter').optional().isFloat({ min: 0, max: 1000 }).withMessage('Invalid ratePerLiter'),
  handleValidationErrors('Rate'),
];

export const validateDairyUpdate = [
  body('name').optional().trim().notEmpty().withMessage('Dairy name cannot be empty'),
  body('address').optional().trim().notEmpty().withMessage('Address cannot be empty'),
  body('contact').optional().trim().notEmpty().withMessage('Contact cannot be empty'),
  body('phone').optional().trim().notEmpty().withMessage('Phone cannot be empty'),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail().withMessage('Invalid email address'),
  handleValidationErrors('DairyUpdate'),
];
