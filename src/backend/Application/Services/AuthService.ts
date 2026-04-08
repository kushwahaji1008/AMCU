import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { IUserRepository, IDairyRepository } from '../Interfaces/IRepositories';
import { User } from '../../Core/Entities/Sale';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export class AuthService {
  constructor(
    private userRepo: IUserRepository,
    private dairyRepo: IDairyRepository
  ) {}

  async login(username: string, password: string): Promise<{ token: string; user: Omit<User, 'passwordHash'> }> {
    const normalizedUsername = username.toLowerCase();
    const user = await this.userRepo.getByUsername(normalizedUsername);
    if (!user) {
      throw new Error('Invalid username or password.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid username or password.');
    }

    if (user.status === 'inactive') {
      throw new Error('Your account has been deactivated. Please contact support.');
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, databaseId: user.databaseId },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    const { passwordHash, ...userWithoutPassword } = user;
    return { token, user: userWithoutPassword };
  }

  async register(
    username: string, 
    password: string, 
    role: 'admin' | 'operator' | 'super_admin',
    dairyData?: { name: string; address: string; contact: string; databaseId?: string },
    existingDairyId?: string,
    existingDatabaseId?: string
  ): Promise<Omit<User, 'passwordHash'>> {
    const normalizedUsername = username.toLowerCase();
    const existingUser = await this.userRepo.getByUsername(normalizedUsername);
    if (existingUser) {
      throw new Error('Username already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    // Determine databaseId and dairyId
    let databaseId = existingDatabaseId || '(default)';
    let dairyId = existingDairyId;

    if (role === 'admin' && dairyData) {
      databaseId = dairyData.databaseId || `dairy-${Date.now()}`;
      dairyId = databaseId;
    } else if (role === 'super_admin') {
      databaseId = 'dugdhaset.superadmin';
      dairyId = 'global';
    }

    const user = await this.userRepo.create({
      username: normalizedUsername,
      passwordHash,
      role,
      status: 'active',
      dairyId,
      databaseId
    });

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

  async loginSuperAdmin(email: string, pass: string): Promise<{ token: string; role: string; databaseId: string }> {
    const ADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin@rnsoft.in';
    const ADMIN_PASS = process.env.SUPERADMIN_PASS || 'SuperAdmin@123';
    const ADMIN_DB_ID = 'dugdhaset.superadmin';

    if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
      const token = jwt.sign(
        { id: 'super-admin-id', username: email, role: 'super_admin', databaseId: ADMIN_DB_ID },
        JWT_SECRET,
        { expiresIn: '1d' }
      );
      return { token, role: 'super_admin', databaseId: ADMIN_DB_ID };
    }
    throw new Error('Invalid credentials');
  }
}
