import type { AuthResponse, LoginInput, RegisterInput, UserDto } from '@carintel/shared';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/sequelize';
import * as bcrypt from 'bcryptjs';
import { User } from '../database/models';
import type { JwtPayload } from './jwt-auth.guard';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User) private readonly users: typeof User,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResponse> {
    const existing = await this.users.findOne({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email already registered');

    const user = await this.users.create({
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    });
    return this.issueToken(user);
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await this.users.scope('withPassword').findOne({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueToken(user);
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.users.findByPk(userId);
    if (!user) throw new NotFoundException();
    return toUserDto(user);
  }

  private async issueToken(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return { accessToken: await this.jwt.signAsync(payload), user: toUserDto(user) };
  }
}

function toUserDto(user: User): UserDto {
  return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() };
}
