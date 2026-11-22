import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import type { User } from '../store/types';
import { AnnouncementsService } from './announcements.service';

@Controller('api/announcements')
@UseGuards(JwtAuthGuard)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(
    @Req() req: Request & { user: User },
    @Query('limit') limit?: string,
  ) {
    return this.announcements.listForUser(req.user.id, Number(limit) || 50);
  }

  @Get('alert-stocks')
  alertStocks(@Req() req: Request & { user: User }) {
    return this.announcements.listAlertStocks(req.user.id);
  }

  @Post('alert-stocks')
  addAlertStock(
    @Req() req: Request & { user: User },
    @Body() body: { tickerId: string },
  ) {
    return this.announcements.addAlertStock(req.user.id, body.tickerId);
  }

  @Delete('alert-stocks/:id')
  removeAlertStock(
    @Req() req: Request & { user: User },
    @Param('id') id: string,
  ) {
    return this.announcements.removeAlertStock(req.user.id, id);
  }

  @Get('tickers/search')
  searchTickers(@Query('q') q?: string) {
    return this.announcements.searchTickers(q || '');
  }

  @Post('sync')
  @UseGuards(AdminGuard)
  sync() {
    return this.announcements.manualSync();
  }
}
