import AutoLoad, { AutoloadPluginOptions } from '@fastify/autoload';
import { MySQLPromisePool } from '@fastify/mysql';

import { JobServerEnvSchema } from './env';
import { FastifyPluginAsync } from 'fastify';
import fastifyEnv from '@fastify/env';
import { join } from 'path';
import {Queue, Worker} from "bullmq";
import {QueryExecution} from "@ossinsight/api-server";
import {EmailClient} from "@ossinsight/email-server";
import {GitHubRepoWithEvents} from "./types";
import {CalcMilestonesJobInput} from "./jobs/calc_milestones/index.worker";

export type AppOptions = {
} & Partial<AutoloadPluginOptions>;

// Pass --options via CLI arguments in command to enable these options.
const options: AppOptions = {
};

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      DATABASE_URL: string;
      REDIS_URL: string,
      EMAIL_SERVER_URL: string,
      PLAYGROUND_DATABASE_URL: string;
      SEND_REPO_FEEDS_CRON: string,
      CALC_REPO_MILESTONES_CRON: string,
    };
    mysql: MySQLPromisePool;
    emailClient: EmailClient;
    queues: {
      playground: Queue<QueryExecution, any, string>;
      calc_milestones: Queue<CalcMilestonesJobInput, any, string>;
      calc_milestones_for_repo_events: Queue<GitHubRepoWithEvents, any, string>;
      send_feeds_emails: Queue<{}, any, string>;
      send_feeds_email: Queue<{}, any, string>;
    };
    workers: {
      playground: Worker<QueryExecution, any, string>;
      calc_milestones: Worker<CalcMilestonesJobInput, any, string>;
      send_feeds_emails: Worker<{}, any, string>;
      send_feeds_email: Worker<{}, any, string>;
    };
  }
}

const app: FastifyPluginAsync<AppOptions> = async (
  fastify,
  opts,
): Promise<void> => {
  await fastify.register(fastifyEnv, {
    confKey: 'config', // You can access environment variables via `fastify.config`.
    dotenv: true,
    schema: JobServerEnvSchema,
  });

  // Load plugins.
  await fastify.register(AutoLoad, {
    dir: join(__dirname, "plugins"),
    options: opts,
  });
};

export default app;
export { app, options };
