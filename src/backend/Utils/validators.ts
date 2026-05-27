/**
 * Validators
 * 
 * Utility functions for common validation operations.
 * Centralized validation logic for better maintainability.
 */

import { ValidationError } from '../Core/Exceptions/AppError';

export class Validators {
  /**
   * Validates email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 255;
  }

  /**
   * Validates phone number (basic international format)
   */
  static isValidPhoneNumber(phone: string): boolean {
    const phoneRegex = /^[\d\s\-\+\(\)]{7,20}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }

  /**
   * Validates strong password requirements
   */
  static isValidPassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) errors.push('Password must be at least 8 characters long');
    if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('Password must contain at least one special character');

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates username format
   */
  static isValidUsername(username: string): boolean {
    // 3-50 characters, alphanumeric, underscore, hyphen
    const usernameRegex = /^[a-zA-Z0-9_-]{3,50}$/;
    return usernameRegex.test(username);
  }

  /**
   * Validates farmer ID format
   */
  static isValidFarmerId(farmerId: string): boolean {
    return farmerId.trim().length > 0 && farmerId.length <= 50;
  }

  /**
   * Validates numeric range
   */
  static isInRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }

  /**
   * Validates FAT percentage
   */
  static isValidFAT(fat: number): boolean {
    return this.isInRange(fat, 0, 10);
  }

  /**
   * Validates SNF percentage
   */
  static isValidSNF(snf: number): boolean {
    return this.isInRange(snf, 0, 10);
  }

  /**
   * Validates milk quantity
   */
  static isValidQuantity(quantity: number): boolean {
    return quantity > 0 && quantity <= 1000;
  }

  /**
   * Validates amount (price)
   */
  static isValidAmount(amount: number): boolean {
    return amount > 0 && amount <= 10000000; // Up to 10M
  }

  /**
   * Validates bank account format (basic)
   */
  static isValidBankAccount(account: string): boolean {
    return account.replace(/\s/g, '').length >= 9 && account.replace(/\s/g, '').length <= 18;
  }

  /**
   * Validates IFSC code
   */
  static isValidIFSC(ifsc: string): boolean {
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    return ifscRegex.test(ifsc);
  }

  /**
   * Validates MongoDB ObjectId
   */
  static isValidObjectId(id: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  /**
   * Sanitizes input string
   */
  static sanitizeString(input: string, maxLength: number = 255): string {
    if (typeof input !== 'string') return '';
    return input
      .trim()
      .substring(0, maxLength)
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/[^\w\s\-@.]/g, ''); // Remove special characters except safe ones
  }
}
