import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import passport from 'passport';
import { Strategy as GoogleStrategy, type Profile } from 'passport-google-oauth20';
import { StoreService } from '../store/store.service';

@Injectable()
export class GoogleAuthService implements OnModuleInit {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(private readonly store: StoreService) {}

  async onModuleInit() {
    await this.refreshStrategy();
  }

  async refreshStrategy() {
    const settings = await this.store.getGoogleAuthSettings();
    try {
      passport.unuse('google');
    } catch {
      // strategy may not exist yet
    }

    if (!settings.clientId || !settings.clientSecret) {
      this.logger.warn(
        'Google Sign-in credentials missing in app_settings — configure in Admin.',
      );
      return settings;
    }

    passport.use(
      'google',
      new GoogleStrategy(
        {
          clientID: settings.clientId,
          clientSecret: settings.clientSecret,
          callbackURL: settings.callbackUrl,
          scope: ['email', 'profile'],
        },
        (
          _accessToken: string,
          _refreshToken: string,
          profile: Profile,
          done: (err: Error | null, user?: Profile) => void,
        ) => {
          done(null, profile);
        },
      ),
    );

    this.logger.log(
      `Google strategy registered (enabled=${settings.enabled}, callback=${settings.callbackUrl})`,
    );
    return settings;
  }

  async isConfigured() {
    const settings = await this.store.getGoogleAuthSettings();
    return Boolean(settings.clientId && settings.clientSecret);
  }

  async isEnabled() {
    const settings = await this.store.getGoogleAuthSettings();
    return settings.enabled;
  }
}
