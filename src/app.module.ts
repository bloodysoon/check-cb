import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configArray, environmentSchema } from './config';
import { CBModule } from './modules/cb/cb.module';
import { ApiController, ModelController } from './modules/models/model.controller';

@Module({
  imports: [
    CBModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: environmentSchema,
      load: configArray,
    }),
  ],
  controllers: [ModelController, ApiController],
})
export class AppModule {}
