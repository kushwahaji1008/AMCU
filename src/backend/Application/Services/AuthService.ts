/**
 * AuthService
 * 
 * Handles user authentication, registration, and session management.
 * Includes security features like password hashing, JWT generation,
 * and session fingerprinting.
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { IUserRepository, IDairyRepository, ILoginAuditRepository } from '../Interfaces/IRepositories';
import { User } from '../../Core/Entities/Sale';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export class AuthService {
  constructor(
    private userRepo: IUserRepository,
    private dairyRepo: IDairyRepository,
    private auditRepo?: ILoginAuditRepository
  ) {}

  /**
   * Generates a unique fingerprint for the session based on IP and User-Agent.
   * This prevents session hijacking via token theft.
   */
  private generateFingerprint(auditData: any): string {
    const data = `${auditData.ipAddress}-${auditData.userAgent}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Authenticates a user and returns a JWT token.
   * Logs the login attempt for auditing.
   */
  async login(username: string, password: string, auditData?: any): Promise<{ token: string; user: Omit<User, 'passwordHash'>; requiresOTP: boolean }> {
    const normalizedUsername = username.toLowerCase();
    const user = await this.userRepo.getByUsername(normalizedUsername);
    
    // 1. Verify User Existence
    if (!user) {
      if (this.auditRepo) {
        await this.auditRepo.create({
          userId: 'unknown',
          username: normalizedUsername,
          role: 'unknown',
          loginAt: new Date(),
          status: 'failure',
          failureReason: 'User not found',
          databaseId: 'unknown',
          ...auditData
        });
      }
      throw new Error('Invalid username or password.');
    }

    // 2. Verify Password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      if (this.auditRepo) {
        await this.auditRepo.create({
          userId: user.id,
          username: user.username,
          role: user.role,
          loginAt: new Date(),
          status: 'failure',
          failureReason: 'Invalid password',
          databaseId: user.databaseId,
          ...auditData
        });
      }
      throw new Error('Invalid username or password.');
    }

    // 3. Check Account Status
    if (user.status === 'inactive') {
      if (this.auditRepo) {
        await this.auditRepo.create({
          userId: user.id,
          username: user.username,
          role: user.role,
          loginAt: new Date(),
          status: 'failure',
          failureReason: 'Account inactive',
          databaseId: user.databaseId,
          ...auditData
        });
      }
      throw new Error('Your account has been deactivated. Please contact support.');
    }

    // 4. Generate Session Fingerprint
    const fingerprint = auditData ? this.generateFingerprint(auditData) : 'none';

    // 5. Generate JWT Token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        databaseId: user.databaseId,
        fp: fingerprint 
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 6. Log Successful Login
    if (this.auditRepo) {
      await this.auditRepo.create({
        userId: user.id,
        username: user.username,
        role: user.role,
        loginAt: new Date(),
        status: 'success',
        databaseId: user.databaseId,
        ...auditData
      });
    }

    const { passwordHash, ...userWithoutPassword } = user;
    return { token, user: userWithoutPassword, requiresOTP: false };
  }

  /**
   * Registers a new user and creates a corresponding dairy if the role is 'admin'.
   */
  async register(
    username: string, 
    email: string,
    password: string, 
    role: 'admin' | 'operator' | 'super_admin',
    dairyData?: { name: string; address: string; contact: string; databaseId?: string },
    existingDairyId?: string,
    existingDatabaseId?: string
  ): Promise<Omit<User, 'passwordHash'>> {
    const normalizedUsername = username.toLowerCase();
    
    // 1. Check for existing user
    const existingUser = await this.userRepo.getByUsername(normalizedUsername);
    if (existingUser) {
      throw new Error('Username already exists.');
    }

    // 2. Hash Password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // 3. Determine Database and Dairy Context
    let databaseId = existingDatabaseId || '(default)';
    let dairyId = existingDairyId;

    if (role === 'admin' && dairyData) {
      databaseId = dairyData.databaseId || `dairy-${Date.now()}`;
      dairyId = databaseId;
    } else if (role === 'super_admin') {
      databaseId = 'dugdhaset.superadmin';
      dairyId = 'global';
    }

    // 4. Create User Record
    const user = await this.userRepo.create({
      username: normalizedUsername,
      email: email.toLowerCase(),
      passwordHash,
      role,
      status: 'active',
      isEmailVerified: true, // Auto-verify for production readiness
      dairyId,
      databaseId
    });

    // 5. Create Dairy Record (if applicable)
    if (role === 'admin' && dairyData) {
      await this.dairyRepo.create({
        name: dairyData.name,
        address: dairyData.address,
        contact: dairyData.contact,
        ownerId: user.id,
        databaseId: databaseId
      });
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Special authentication for the Super Admin account.
   */
  async loginSuperAdmin(email: string, pass: string, auditData?: any): Promise<{ token: string; user: any; requiresOTP: boolean }> {
    const ADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin@rnsoft.in';
    const ADMIN_PASS = process.env.SUPERADMIN_PASS || 'SuperAdmin@123';
    
    if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
      let user = await this.userRepo.getByUsername(email);
      
      // Auto-create Super Admin user record if it doesn't exist
      if (!user) {
        user = await this.userRepo.create({
          username: email,
          email: email,
          passwordHash: await bcrypt.hash(pass, 10),
          role: 'super_admin',
          status: 'active',
          isEmailVerified: true,
          databaseId: 'dugdhaset.superadmin',
          dairyId: 'global'
        });
      }

      const fingerprint = auditData ? this.generateFingerprint(auditData) : 'none';

      const token = jwt.sign(
        { 
          id: user.id, 
          username: user.username, 
          role: user.role, 
          databaseId: user.databaseId,
          fp: fingerprint
        },
        JWT_SECRET,
        { expiresIn: '1d' }
      );

      if (this.auditRepo) {
        await this.auditRepo.create({
          userId: user.id,
          username: user.username,
          role: user.role,
          loginAt: new Date(),
          status: 'success',
          databaseId: user.databaseId,
          ...auditData
        });
      }

      const { passwordHash, ...userWithoutPassword } = user;
      return { token, user: userWithoutPassword, requiresOTP: false };
    }

    // Log Failed Super Admin Login
    if (this.auditRepo) {
      await this.auditRepo.create({
        userId: 'unknown',
        username: email,
        role: 'super_admin',
        loginAt: new Date(),
        status: 'failure',
        failureReason: 'Invalid superadmin credentials',
        databaseId: 'dugdhaset.superadmin',
        ...auditData
      });
    }
    throw new Error('Invalid credentials');
  }
}
