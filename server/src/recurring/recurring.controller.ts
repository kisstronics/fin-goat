import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import type {
  RecurringFrequency,
  RecurringKind,
  User,
} from '../store/types';
import { RecurringService } from './recurring.service';

@Controller('api/recurring')
@UseGuards(JwtAuthGuard)
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  list(@Req() req: Request & { user: User }) {
    return this.recurring.summary(req.user.id);
  }

  @Post()
  create(
    @Req() req: Request & { user: User },
    @Body()
    body: {
      kind: RecurringKind;
      name: string;
      amount: number;
      category?: string;
      frequency?: RecurringFrequency;
      dayOfMonth?: number;
      notes?: string;
      active?: boolean;
    },
  ) {
    return this.recurring.create(req.user.id, body);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: User },
    @Param('id') id: string,
    @Body()
    body: Partial<{
      kind: RecurringKind;
      name: string;
      amount: number;
      category: string;
      frequency: RecurringFrequency;
      dayOfMonth: number | null;
      notes: string;
      active: boolean;
    }>,
  ) {
    return this.recurring.update(req.user.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request & { user: User }, @Param('id') id: string) {
    return this.recurring.remove(req.user.id, id);
  }
}
