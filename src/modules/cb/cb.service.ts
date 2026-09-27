import { Injectable, Logger } from '@nestjs/common';
import { getModels, updateDbOnlineStatus, updateDbOnlineStatusToFalse, VideoModel } from '../../supa-api.service';

const cbApi = 'https://chaturbate.com/affiliates/api/onlinerooms/?format=json&wm=3YHSK';

interface CBApiModel {
  username: string;
  current_show: string;
  image_url: string;
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
  ): Promise<{ name: string; image_url: string }[]> {
    const data = await this.getCbData();
    const publicModels = data.filter((model) => model.current_show === 'public');
    const mapped = publicModels.map((model) => ({
      name: model.username,
      image_url: model.image_url,
    }));
    const from = (page - 1) * limit;
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
