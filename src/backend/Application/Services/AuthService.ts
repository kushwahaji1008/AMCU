/**
 * AuthService
 *
 * Handles user authentication, registration, OTP verification, and session lifecycle.
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { IUserRepository, IDairyRepository, ILoginAuditRepository } from '../Interfaces/IRepositories';
import { SafeUser, User } from '../../Core/Entities/Sale';
import { Dairy } from '../../Core/Entities/Dairy';
import { JWT_CONFIG } from '../../API/Config/Auth';
import {
  DEFAULT_DATABASE_ID,
  RESERVED_DATABASE_IDS,
  SUPERADMIN_DATABASE_ID,
  isValidDatabaseId,
  toMongoDatabaseName,
} from '../../Core/RequestContext';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../Core/Errors';
import { emailService } from './EmailService';
import { ActivityLogService } from './ActivityLogService';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function sanitizeUser(user: User, dairy?: Dairy | null): SafeUser {
  const { passwordHash: _p, otp: _o, otpExpires: _oe, otpAttempts: _oa, currentSessionId: _s, ...safe } = user;
  if (dairy) {
    return {
      ...safe,
      dairyName: dairy.name,
      address: dairy.address,
      phone: dairy.phone || dairy.contact,
    };
  }
  return safe;
}

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

export class AuthService {
  constructor(
    private userRepo: IUserRepository,
    private dairyRepo: IDairyRepository,
    private auditRepo?: ILoginAuditRepository,
    private activityLogService?: ActivityLogService
  ) {}

  private generateFingerprint(auditData: any): string {
    const data = `${auditData?.userAgent || ''}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async recordAudit(audit: Parameters<ILoginAuditRepository['create']>[0]): Promise<void> {
    if (this.auditRepo) {
      try {
        await this.auditRepo.create(audit);
      } catch (err) {
        console.error('[AuthService] Failed to write login audit:', err);
      }
    }

    if (this.activityLogService) {
      const action =
        audit.role === 'super_admin'
          ? audit.status === 'success'
            ? 'SUPERADMIN_LOGIN'
            : 'SUPERADMIN_LOGIN_FAILED'
          : audit.status === 'success'
          ? 'USER_LOGIN'
          : 'USER_LOGIN_FAILED';

      await this.activityLogService
        .log({
          userId: audit.userId,
          username: audit.username,
          userRole: audit.role,
          action,
          targetId: audit.userId !== 'unknown' ? audit.userId : undefined,
          targetType: 'AUTH',
          operationStatus: audit.status === 'success' ? 'success' : 'failure',
          errorDetails: audit.failureReason,
          ipAddress: audit.ipAddress,
          device: audit.device ? { ...audit.device, platform: audit.device.os } : undefined,
          databaseId: audit.databaseId,
          syncStatus: 'online',
          source: 'server',
        })
        .catch(() => {});
    }
  }

  private async lookupUser(identifier: string): Promise<User | null> {
    if (this.userRepo.getByUsernameOrEmail) {
      return this.userRepo.getByUsernameOrEmail(identifier);
    }
    return this.userRepo.getByUsername(identifier);
  }

  private async resolveDairyForUser(user: User): Promise<Dairy | null> {
    if (user.role === 'super_admin') return null;
    try {
      const key = user.dairyId || user.databaseId;
      if (key && key !== DEFAULT_DATABASE_ID) {
        const dairy = await this.dairyRepo.getById(key);
        if (dairy) return dairy;
      }
      if (user.role === 'admin') {
        return await this.dairyRepo.getByOwnerId(user.id);
      }
    } catch {
      // Non-fatal: login still succeeds even if dairy metadata lookup fails
    }
    return null;
  }

  async login(
    username: string,
    password: string,
    auditData?: any
  ): Promise<{ token: string; user: SafeUser; requiresOTP: boolean }> {
    if (!username || !password) {
      throw new ValidationError('Username and password are required.', 'MISSING_CREDENTIALS');
    }

    const normalizedUsername = username.trim().toLowerCase();
    const user = await this.lookupUser(normalizedUsername);

    if (!user) {
      await this.recordAudit({
        userId: 'unknown',
        username: normalizedUsername,
        role: 'unknown',
        loginAt: new Date(),
        status: 'failure',
        failureReason: 'User not found',
        databaseId: 'unknown',
        ...auditData,
      });
      throw new UnauthorizedError('Invalid username or password.', 'INVALID_CREDENTIALS');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await this.recordAudit({
        userId: user.id,
        username: user.username,
        role: user.role,
        loginAt: new Date(),
        status: 'failure',
        failureReason: 'Invalid password',
        databaseId: user.databaseId,
        ...auditData,
      });
      throw new UnauthorizedError('Invalid username or password.', 'INVALID_CREDENTIALS');
    }

    if (user.status === 'inactive') {
      await this.recordAudit({
        userId: user.id,
        username: user.username,
        role: user.role,
        loginAt: new Date(),
        status: 'failure',
        failureReason: 'Account inactive',
        databaseId: user.databaseId,
        ...auditData,
      });
      throw new ForbiddenError('Your account has been deactivated. Please contact support.', 'ACCOUNT_INACTIVE');
    }

    const fingerprint = auditData ? this.generateFingerprint(auditData) : 'none';
    const sessionId = crypto.randomBytes(16).toString('hex');
    await this.userRepo.update(user.id, { currentSessionId: sessionId });

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        databaseId: user.databaseId,
        dairyId: user.dairyId || user.databaseId,
        fp: fingerprint,
        sid: sessionId,
      },
      JWT_CONFIG.secret,
      { expiresIn: JWT_CONFIG.expiresIn }
    );

    await this.recordAudit({
      userId: user.id,
      username: user.username,
      role: user.role,
      loginAt: new Date(),
      status: 'success',
      databaseId: user.databaseId,
      ...auditData,
    });

    const dairy = await this.resolveDairyForUser(user);
    return {
      token,
      user: sanitizeUser({ ...user, currentSessionId: sessionId }, dairy),
      requiresOTP: false,
    };
  }

  async register(
    username: string,
    email: string | undefined,
    password: string,
    role: 'admin' | 'operator' | 'super_admin',
    dairyData?: { name: string; address: string; contact: string; databaseId?: string },
    existingDairyId?: string,
    existingDatabaseId?: string
  ): Promise<SafeUser> {
    if (!username || !password) {
      throw new ValidationError('Username and password are required.', 'INVALID_REGISTRATION');
    }

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = (email || username).trim().toLowerCase();

    const existingUser = await this.userRepo.getByUsername(normalizedUsername);
    if (existingUser) {
      throw new ConflictError('Username already exists.', 'USERNAME_EXISTS');
    }

    if (normalizedEmail !== normalizedUsername && this.userRepo.getByEmail) {
      const existingByEmail = await this.userRepo.getByEmail(normalizedEmail);
      if (existingByEmail) {
        throw new ConflictError('Email address is already registered.', 'EMAIL_EXISTS');
      }
    }

    let databaseId = existingDatabaseId || DEFAULT_DATABASE_ID;
    let dairyId = existingDairyId || databaseId;

    if (role === 'admin' && dairyData) {
      if (!dairyData.name?.trim() || !dairyData.address?.trim() || !dairyData.contact?.trim()) {
        throw new ValidationError('Dairy name, address, and contact are required.', 'INVALID_DAIRY_DATA');
      }

      databaseId = (dairyData.databaseId || `dairy-${Date.now()}`).trim().toLowerCase();
      if (!isValidDatabaseId(databaseId) || RESERVED_DATABASE_IDS.has(databaseId)) {
        throw new ValidationError(
          'Invalid or reserved dairy database ID. Use 3-50 alphanumeric characters, hyphens, or underscores.',
          'INVALID_DATABASE_ID'
        );
      }

      const targetMongoDb = toMongoDatabaseName(databaseId);
      const existingDairies = await this.dairyRepo.getAll();
      if (existingDairies.some((d) => toMongoDatabaseName(d.databaseId) === targetMongoDb)) {
        throw new ConflictError('A dairy with this database ID already exists.', 'DATABASE_ID_EXISTS');
      }

      dairyId = databaseId;
    } else if (role === 'super_admin') {
      databaseId = SUPERADMIN_DATABASE_ID;
      dairyId = 'global';
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.userRepo.create({
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
      role,
      status: 'active',
      isEmailVerified: true,
      dairyId,
      databaseId,
    });

    if (role === 'admin' && dairyData) {
      try {
        await this.dairyRepo.create({
          name: dairyData.name.trim(),
          address: dairyData.address.trim(),
          contact: dairyData.contact.trim(),
          phone: dairyData.contact.trim(),
          email: normalizedEmail,
          ownerId: user.id,
          databaseId,
        });
      } catch (err) {
        // Roll back orphaned user if dairy creation fails
        await Promise.resolve(this.userRepo.delete(user.id)).catch(() => {});
        throw err;
      }
    }

    const safeUser = sanitizeUser(user);
    if (this.activityLogService) {
      await this.activityLogService
        .log({
          userId: user.id,
          username: user.username,
          userRole: user.role,
          action: dairyData ? 'REGISTER_DAIRY' : 'CREATE_USER',
          targetId: user.id,
          targetType: dairyData ? 'DAIRY' : 'USER',
          afterValue: safeUser,
          databaseId: user.databaseId,
          operationStatus: 'success',
          source: 'server',
        })
        .catch(() => {});
    }

    return safeUser;
  }

  async loginSuperAdmin(
    email: string,
    pass: string,
    auditData?: any
  ): Promise<{ token: string; user: SafeUser; requiresOTP: boolean }> {
    if (!email || !pass) {
      throw new ValidationError('Email and password are required.', 'MISSING_CREDENTIALS');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.lookupUser(normalizedEmail);

    if (!user || user.role !== 'super_admin') {
      await this.recordAudit({
        userId: 'unknown',
        username: normalizedEmail,
        role: 'super_admin',
        loginAt: new Date(),
        status: 'failure',
        failureReason: 'SuperAdmin not found or invalid role',
        databaseId: SUPERADMIN_DATABASE_ID,
        ...auditData,
      });
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (user.status === 'inactive') {
      throw new ForbiddenError('Your account has been deactivated.', 'ACCOUNT_INACTIVE');
    }

    const isPasswordValid = await bcrypt.compare(pass, user.passwordHash);
    if (!isPasswordValid) {
      await this.recordAudit({
        userId: user.id,
        username: user.username,
        role: user.role,
        loginAt: new Date(),
        status: 'failure',
        failureReason: 'Invalid superadmin password',
        databaseId: user.databaseId,
        ...auditData,
      });
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const fingerprint = auditData ? this.generateFingerprint(auditData) : 'none';
    const sessionId = crypto.randomBytes(16).toString('hex');
    await this.userRepo.update(user.id, { currentSessionId: sessionId });

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        databaseId: user.databaseId,
        dairyId: user.dairyId || 'global',
        fp: fingerprint,
        sid: sessionId,
      },
      JWT_CONFIG.secret,
      { expiresIn: JWT_CONFIG.expiresIn }
    );

    await this.recordAudit({
      userId: user.id,
      username: user.username,
      role: user.role,
      loginAt: new Date(),
      status: 'success',
      databaseId: user.databaseId,
      ...auditData,
    });

    return {
      token,
      user: sanitizeUser({ ...user, currentSessionId: sessionId }),
      requiresOTP: false,
    };
  }

  async logout(userId: string): Promise<void> {
    if (!userId) return;
    const existing = this.userRepo.getById ? await this.userRepo.getById(userId).catch(() => null) : null;
    await this.userRepo.update(userId, { currentSessionId: '' });
    if (this.activityLogService) {
      await this.activityLogService
        .log({
          userId,
          username: existing?.username || 'unknown',
          userRole: existing?.role,
          action: 'USER_LOGOUT',
          targetId: userId,
          targetType: 'AUTH',
          operationStatus: 'success',
          databaseId: existing?.databaseId || 'unknown',
          source: 'server',
        })
        .catch(() => {});
    }
  }

  async resendOTP(userId: string): Promise<{ success: boolean; message: string }> {
    if (!userId) {
      throw new ValidationError('User ID is required.', 'MISSING_USER_ID');
    }
    const user = this.userRepo.getById ? await this.userRepo.getById(userId) : null;
    if (!user) {
      throw new NotFoundError('User not found.', 'USER_NOT_FOUND');
    }
    if (user.status === 'inactive') {
      throw new ForbiddenError('Account is inactive.', 'ACCOUNT_INACTIVE');
    }

    if (user.otpExpires) {
      const issuedAt = new Date(user.otpExpires).getTime() - OTP_TTL_MS;
      if (Date.now() - issuedAt < OTP_RESEND_COOLDOWN_MS) {
        throw new ValidationError('Please wait before requesting another OTP.', 'OTP_COOLDOWN');
      }
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpExpires = new Date(Date.now() + OTP_TTL_MS);

    await this.userRepo.update(user.id, {
      otp: hashOtp(otp),
      otpExpires,
      otpAttempts: 0,
    });

    await emailService.sendOTP(user.email, otp);
    return { success: true, message: 'Verification OTP sent.' };
  }

  async verifyOTP(userId: string, otp: string): Promise<{ success: boolean; message: string }> {
    if (!userId || !otp) {
      throw new ValidationError('User ID and OTP are required.', 'INVALID_OTP_INPUT');
    }

    const user = this.userRepo.getById ? await this.userRepo.getById(userId) : null;
    if (!user) {
      throw new NotFoundError('User not found.', 'USER_NOT_FOUND');
    }

    if (!user.otp || !user.otpExpires) {
      throw new ValidationError('No active OTP found. Please request a new OTP.', 'OTP_MISSING');
    }

    if ((user.otpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
      throw new ForbiddenError('Too many failed OTP attempts. Please request a new OTP.', 'OTP_LOCKED');
    }

    if (new Date(user.otpExpires).getTime() < Date.now()) {
      throw new ValidationError('OTP has expired. Please request a new one.', 'OTP_EXPIRED');
    }

    const providedHash = Buffer.from(hashOtp(otp.trim()), 'hex');
    const storedHash = Buffer.from(user.otp, 'hex');
    const matches =
      providedHash.length === storedHash.length && crypto.timingSafeEqual(providedHash, storedHash);

    if (!matches) {
      await this.userRepo.update(user.id, { otpAttempts: (user.otpAttempts || 0) + 1 });
      throw new UnauthorizedError('Invalid OTP.', 'OTP_INVALID');
    }

    await this.userRepo.update(user.id, {
      isEmailVerified: true,
      otp: '',
      otpExpires: undefined,
      otpAttempts: 0,
    });

    return { success: true, message: 'Email verified successfully.' };
  }
}
