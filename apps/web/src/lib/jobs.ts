import { loadEnv } from "@one-lister/config/env";
import type { JobEnqueuer } from "@one-lister/core";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

const IMAGE_PROCESS_QUEUE = "image-process";

let imageQueue: Queue | undefined;
let connection: Redis | undefined;

function getConnection(): Redis {
  if (!connection) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  return connection;
}

function getImageQueue(): Queue {
  if (!imageQueue) {
    imageQueue = new Queue(IMAGE_PROCESS_QUEUE, {
      connection: getConnection(),
    });
  }
  return imageQueue;
}

export function getJobEnqueuer(): JobEnqueuer {
  return {
    async enqueueImageProcess(payload) {
      const redis = getConnection();
      if (redis.status === "wait" || redis.status === "end") {
        await redis.connect();
      }
      await getImageQueue().add("process", payload, {
        jobId: `image-process:${payload.productImageId}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      });
    },
  };
}
