import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { addModel, getModels, incrementAttemp, saveModels, updateModelStatus } from '../../supa-api.service';
import { CBService } from '../cb/cb.service';

@Controller('model')
export class ModelController {
  constructor(private readonly cbService: CBService) {}

  @Get()
  async getSupaModels(): Promise<any> {
    return await getModels();
  }

  @Get('/cb')
  async getCbModels(
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('status') status?: string,
  ): Promise<any> {
    const limitNumber = limit ? +limit || 20 : 20;
    const pageNumber = page ? +page || 1 : 1;
    return await this.cbService.getCbModels(limitNumber, pageNumber, status);
  }

  @Post('/cb')
  async createModel(
    @Body() body: { name: string; status?: string },
  ): Promise<{ ok: boolean; data: any }> {
    const data = await addModel(body.name, body.status);
    return { ok: true, data };
  }

  @Post('/cb/update-status')
  async updateStatus(
    @Body() body: { name: string; status?: string | null },
  ): Promise<{ ok: boolean; data: any }> {
    const data = await updateModelStatus(body.name, body.status);
    return { ok: true, data };
  }

  @Post('/cb/sync')
  async syncWithCb(): Promise<{ ok: boolean }> {
    await this.cbService.syncWithCb();
    return { ok: true };
  }

  @Post('/cb/increment-attemp')
  async incrementAttemp(
    @Body() body: { name: string },
  ): Promise<{ name: string; attemp: number }> {
    const updated = await incrementAttemp(body.name);
    return { name: body.name, attemp: (updated as any).attemp };
  }
}

@Controller('api')
export class ApiController {
  @Get('/models/:name')
  async getModelByName(@Param('name') name: string): Promise<any> {
    const all = await getModels();
    return (
      all.find(
        (model) =>
          model.name?.trim().toLowerCase() === name?.trim().toLowerCase(),
      ) || null
    );
  }

  @Post('/models')
  async createModels(
    @Body() body: { models: { name: string; status?: string }[] },
  ): Promise<{ ok: boolean; data: any }> {
    const data = await saveModels(body.models || []);
    return { ok: true, data };
  }
}
