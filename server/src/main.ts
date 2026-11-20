import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const clientUrl = config.get<string>('CLIENT_URL') || 'http://localhost:5174';

  app.use(cookieParser());
  app.enableCors({
    origin: clientUrl,
    credentials: true,
  });

  const port = Number(config.get<string>('PORT')) || 3003;
  await app.listen(port);
  console.log(`Fin Goat server listening on http://localhost:${port}`);
}

bootstrap();
