import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { IUserRepository } from '../Interfaces/IRepositories';
import { User } from '../../Core/Entities/Sale';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export class AuthService {
  constructor(private userRepo: IUserRepository) {}

  async login(username: string, password: string): Promise<{ token: string; user: Omit<User, 'passwordHash'> }> {
    const user = await this.userRepo.getByUsername(username);
    if (!user) {
      throw new Error('Invalid username or password.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid username or password.');
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    const { passwordHash, ...userWithoutPassword } = user;
    return { token, user: userWithoutPassword };
  }

  async register(username: string, password: string, role: 'admin' | 'operator'): Promise<Omit<User, 'passwordHash'>> {
    const existingUser = await this.userRepo.getByUsername(username);
    if (existingUser) {
      throw new Error('Username already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.userRepo.create({
      username,
      passwordHash,
      role,
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
