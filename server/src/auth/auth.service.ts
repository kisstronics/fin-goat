import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuid } from 'uuid';
import { StoreService } from '../store/store.service';
import type { User } from '../store/types';

@Injectable()
export class AuthService {
  constructor(
    private readonly store: StoreService,
    private readonly jwt: JwtService,
  ) {}

  async listDemoUsers() {
    const users = await this.store.listUsers();
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      planId: u.planId,
    }));
  }

  async loginDev(emailOrName: string): Promise<{ token: string; user: User }> {
    const settings = await this.store.getGoogleAuthSettings();
    if (!settings.allowDevLogin) {
      throw new UnauthorizedException('Dev login is disabled');
    }

    const q = emailOrName.trim().toLowerCase();
    let user = await this.store.findUserByEmailOrName(q);

    if (!user && q) {
      user = {
        id: uuid(),
        email: q.includes('@') ? q : `${q.replace(/\s+/g, '.')}@fingoat.local`,
        name: emailOrName.trim() || 'Investor',
        role: 'user',
        planId: 'free',
        notifyEmail: true,
        notifyTelegram: false,
        provider: 'dev',
        createdAt: new Date().toISOString(),
      };
      await this.store.createUser(user);
    }

    if (!user) throw new UnauthorizedException('Could not sign in');

    const token = this.jwt.sign({ sub: user.id, role: user.role });
    return { token, user };
  }

  async loginGoogle(profile: {
    id: string;
    emails?: { value: string }[];
    displayName?: string;
    photos?: { value: string }[];
  }): Promise<{ token: string; user: User }> {
    const user = await this.store.upsertGoogleUser(profile);
    const token = this.jwt.sign({ sub: user.id, role: user.role });
    return { token, user };
  }

  async me(userId: string) {
    const user = await this.store.findUserById(userId);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
