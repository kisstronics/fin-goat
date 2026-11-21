import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    if (!(await this.telegram.verifyWebhookSecret(secret))) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }
    // Acknowledge immediately; process linking/replies without blocking Telegram.
    void this.telegram.handleUpdate(body || {}).catch(() => undefined);
    return { ok: true };
  }
}
