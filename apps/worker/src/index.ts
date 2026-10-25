import { loadEnv } from "@one-lister/config/env";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";

import { QUEUE_NAMES, type QueueName } from "./queues.js";

const env = loadEnv();

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const connectionOptions = connection as unknown as ConnectionOptions;

const queues = new Map<QueueName, Queue>();
const workers: Worker[] = [];

function createPlaceholderWorker(name: Exclude<QueueName, "heartbeat">): Worker {
  return new Worker(
    name,
    async (job) => {
      console.log(`[${name}] job ${job.id ?? "unknown"} received`, job.name);
    },
    { connection: connectionOptions },
  );
}

async function setup(): Promise<void> {
  for (const name of QUEUE_NAMES) {
    queues.set(name, new Queue(name, { connection: connectionOptions }));
  }

  for (const name of QUEUE_NAMES) {
    if (name === "heartbeat") {
      continue;
    }
    workers.push(createPlaceholderWorker(name));
  }

  const heartbeatWorker = new Worker(
    "heartbeat",
    async () => {
      console.log(`[heartbeat] ${new Date().toISOString()}`);
    },
    { connection: connectionOptions },
  );
  workers.push(heartbeatWorker);

  const heartbeatQueue = queues.get("heartbeat");
  if (!heartbeatQueue) {
    throw new Error("heartbeat queue missing");
  }

  // Immediate tick so local verification doesn't wait a full minute.
  await heartbeatQueue.add("tick", {}, { removeOnComplete: 100, removeOnFail: 100 });

  await heartbeatQueue.upsertJobScheduler(
    "heartbeat-tick",
    { every: 60_000 },
    {
      name: "tick",
      opts: {
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    },
  );

  console.log(
    `[worker] started — queues: ${QUEUE_NAMES.join(", ")} (NODE_ENV=${env.NODE_ENV})`,
  );
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received, shutting down…`);

  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  await connection.quit();

  console.log("[worker] shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

setup().catch((error: unknown) => {
  console.error("[worker] failed to start", error);
  process.exit(1);
});
