import { Injectable, Logger } from '@nestjs/common';
import { getModels, updateDbOnlineStatus, updateDbOnlineStatusToFalse, VideoModel } from '../../supa-api.service';

const cbApi = 'https://chaturbate.com/affiliates/api/onlinerooms/?format=json&wm=3YHSK';

interface CBApiModel {
  username: string;
  current_show: string;
  image_url: string;
  gender: string;
}

@Injectable()
export class CBService {
  private readonly logger = new Logger(CBService.name);

  async getCbData(): Promise<CBApiModel[]> {
    try {
      const response = await fetch(cbApi);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.logger.error('Error fetching data from cbApi:', error instanceof Error ? error.stack : error);
      return [];
    }
  }

  async getCbModels(
    limit: number = 20,
    page: number = 1,
    status?: string,
  ): Promise<{ name: string; image_url: string; status?: string | null }[]> {
    this.logger.log('getCbModels: start', { limit, page, status });
    const [data, dbModels] = await Promise.all([
      this.getCbData(),
      getModels(),
    ]);
    this.logger.log('getCbModels: fetched data', { cbModels: data.length, dbModels: dbModels.length });

    const statusByName = new Map<string, string | null>();
    for (const dbModel of dbModels) {
      if (!dbModel.name?.trim()) continue;
      const key = dbModel.name.trim().toLowerCase();
      if (!statusByName.has(key)) {
        statusByName.set(key, dbModel.status ?? null);
      }
    }
    this.logger.log('getCbModels: statusByName keys', Array.from(statusByName.keys()));

    let filteredModels = data.filter(
      (model) => model.current_show === 'public' && model.gender !== 'm',
    );

    if (status !== undefined) {
      const statusLower = status.trim().toLowerCase();
      this.logger.log('getCbModels: filtering by status', { status, statusLower });

      if (statusLower === 'null' || statusLower === 'none' || statusLower === '') {
        filteredModels = filteredModels.filter(
          (model) => !statusByName.get(model.username.trim().toLowerCase()),
        );
      } else {
        filteredModels = filteredModels.filter((model) =>
          statusByName.get(model.username.trim().toLowerCase())?.toLowerCase() === statusLower,
        );
      }
    }

    this.logger.log('getCbModels: after filter', { count: filteredModels.length });
    const mapped = filteredModels.map((model) => ({
      name: model.username,
      image_url: model.image_url,
      status: statusByName.get(model.username.trim().toLowerCase()) ?? null,
    }));
    const from = (page - 1) * limit;
    this.logger.log('getCbModels: returning slice', { from, to: from + limit, total: mapped.length });
    return mapped.slice(from, from + limit);
  }

  async syncWithCb() {
    this.logger.debug('Sync with Chaturbate');
    const models = await getModels();
    const cbData = await this.getCbData();

    await Promise.all(
      models.map(async (model: VideoModel) => {
        const wasOnline = model.isOnline;
        const res = await this.checkIfModelIsOnline(model.name, cbData);

        if (wasOnline !== res.isOnline) {
          if (res.isOnline) {
            this.logger.log(`${model.name} is online`);
            await updateDbOnlineStatus(model.id!, res.imageUrl!, new Date());
          } else {
            this.logger.error(`${model.name} is offline`);
            await updateDbOnlineStatusToFalse(model.id!);
          }
        } else if (res.isOnline) {
          await updateDbOnlineStatus(model.id!, res.imageUrl!);
        }
      })
    );
  }

  private async checkIfModelIsOnline(modelUsername: string, data: CBApiModel[]): Promise<{ isOnline: boolean; imageUrl?: string }> {
    try {
      const model = data.find(
        (item) => item.username.toLowerCase() === modelUsername.toLowerCase()
      );
      if (model && model.current_show === 'public') {
        return {
          isOnline: true,
          imageUrl: model.image_url,
        };
      }
      return { isOnline: false };
    } catch (error) {
      this.logger.error('Error checking model status:', error instanceof Error ? error.stack : error);
      return { isOnline: false };
    }
  }
}
