import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import type { User } from '../store/types';
import { UsersService } from './users.service';

@Controller('api/settings')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  get(@Req() req: Request & { user: User }) {
    return this.users.getSettings(req.user.id);
  }

  @Patch()
  update(
    @Req() req: Request & { user: User },
    @Body()
    body: Partial<{
      name: string;
      phone: string;
      notifyEmail: boolean;
      notifyTelegram: boolean;
      planId: User['planId'];
    }>,
  ) {
    return this.users.updateSettings(req.user.id, body);
  }

  @Get('alerts')
  alerts(@Req() req: Request & { user: User }) {
    return this.users.alerts(req.user.id);
  }

  @Post('telegram/test')
  sendTestTelegram(@Req() req: Request & { user: User }) {
    return this.users.sendTestTelegram(req.user.id);
  }
}
