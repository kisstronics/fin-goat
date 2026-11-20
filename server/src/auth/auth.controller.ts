import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import passport from 'passport';
import type { Profile } from 'passport-google-oauth20';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { StoreService } from '../store/store.service';
import type { User } from '../store/types';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly googleAuth: GoogleAuthService,
    private readonly store: StoreService,
    private readonly config: ConfigService,
  ) {}

  private clientUrl() {
    return this.config.get<string>('CLIENT_URL') || 'http://localhost:5174';
  }

  private setAuthCookie(res: Response, token: string) {
    res.cookie('fg_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @Get('demo-users')
  demoUsers() {
    return this.auth.listDemoUsers();
  }

  @Get('google/status')
  async googleStatus() {
    const settings = await this.store.getGoogleAuthSettings();
    return {
      enabled: settings.enabled,
      configured: Boolean(settings.clientId && settings.clientSecret),
      allowDevLogin: settings.allowDevLogin,
    };
  }

  @Get('google')
  async googleEntry(@Res() res: Response) {
    const settings = await this.store.getGoogleAuthSettings();
    if (!settings.enabled) {
      return res.redirect(
        `${this.clientUrl()}/login?error=google_not_configured`,
      );
    }
    await this.googleAuth.refreshStrategy();
    return res.redirect('/auth/google/start');
  }

  @Get('google/start')
  async googleAuthStart(@Req() req: Request, @Res() res: Response) {
    const settings = await this.store.getGoogleAuthSettings();
    if (!settings.enabled) {
      return res.redirect(
        `${this.clientUrl()}/login?error=google_not_configured`,
      );
    }
    await this.googleAuth.refreshStrategy();
    return passport.authenticate('google', {
      session: false,
      scope: ['email', 'profile'],
    })(req, res, () => undefined);
  }

  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const clientUrl = this.clientUrl();

    if (req.query?.error) {
      return res.redirect(
        `${clientUrl}/login?error=${encodeURIComponent(String(req.query.error))}`,
      );
    }

    await this.googleAuth.refreshStrategy();

    return passport.authenticate(
      'google',
      { session: false },
      (err: Error | null, profile: Profile | false) => {
        if (res.headersSent) return;

        if (err || !profile) {
          const detail = err?.message || 'google_auth_failed';
          return res.redirect(
            `${clientUrl}/login?error=${encodeURIComponent(detail)}`,
          );
        }

        this.auth
          .loginGoogle(profile)
          .then(({ token }) => {
            if (res.headersSent) return;
            this.setAuthCookie(res, token);
            return res.redirect(
              `${clientUrl}/oauth/callback?token=${encodeURIComponent(token)}`,
            );
          })
          .catch(() => {
            if (res.headersSent) return;
            return res.redirect(`${clientUrl}/login?error=google_login_failed`);
          });
      },
    )(req, res, () => undefined);
  }

  @Post('dev-login')
  async login(
    @Body() body: { emailOrName?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.loginDev(body.emailOrName || 'Demo Investor');
    this.setAuthCookie(res, result.token);
    return { user: result.user, token: result.token };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('fg_token');
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: User }) {
    return this.auth.me(req.user.id);
  }
}
