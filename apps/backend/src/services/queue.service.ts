import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';

export interface BuildJobData {
  serviceId: string;
  gitRepoUrl: string;
  gitBranch: string;
  dockerfilePath: string;
  envVars?: string;
  triggeredBy?: string;
}

export class QueueService {
  public buildQueue: Queue<BuildJobData> | null = null;
  public redisClient: Redis | null = null;
  private isRedisAvailable = false;
  private fallbackQueue: Array<(jobData: BuildJobData) => Promise<void>> = [];

  constructor() {
    this.init();
  }

  private init() {
    try {
      this.redisClient = new Redis(config.redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy(times: number) {
          if (times > 3) return null; // Stop reconnecting after 3 tries in local dev
          return Math.min(times * 500, 2000);
        },
      });

      this.redisClient.on('connect', () => {
        this.isRedisAvailable = true;
        console.log('✅ Conexão com Redis estabelecida com sucesso.');
      });

      this.redisClient.on('error', (_err: any) => {
        this.isRedisAvailable = false;
        // Suppress repeated logs if offline
      });

      this.buildQueue = new Queue<BuildJobData>('build-queue', {
        connection: this.redisClient,
        defaultJobOptions: {
          attempts: 2,
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      });
    } catch (err: any) {
      console.warn('BullMQ Redis inicializado em modo fallback:', err.message);
    }
  }

  public async addBuildJob(data: BuildJobData): Promise<{ id: string; status: string }> {
    if (this.isRedisAvailable && this.buildQueue) {
      const job = await this.buildQueue.add(`build-${data.serviceId}`, data);
      return { id: String(job.id), status: 'queued' };
    }

    // Fallback: Dispatch to in-process handlers if registered
    const jobId = `local-${Date.now()}`;
    setImmediate(async () => {
      for (const handler of this.fallbackQueue) {
        try {
          await handler(data);
        } catch (e: any) {
          console.error(`Erro no fallback job ${jobId}:`, e.message);
        }
      }
    });

    return { id: jobId, status: 'queued_in_memory' };
  }

  public registerFallbackProcessor(handler: (data: BuildJobData) => Promise<void>) {
    this.fallbackQueue.push(handler);
  }
}

export const queueService = new QueueService();
