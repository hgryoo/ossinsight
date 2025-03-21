import {APIError} from "../../../utils/error";
import {FastifyPluginAsyncJsonSchemaToTs} from "@fastify/type-provider-json-schema-to-ts";
import {SQLPlaygroundPromptTemplate} from "../../../plugins/services/bot-service/template/SQLPlaygroundPromptTemplate";

export interface IBody {
  question: string;
  context?: Record<string, any>
}

const schema = {
  body: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      context: {
        type: 'object',
        properties: {
          repo_id: {
            type: 'number'
          },
          repo_name: {
            type: 'string',
          }
        }
      }
    }
  }
} as const;

export const GENERATE_SQL_USED_HEADER = "x-playground-generate-sql-used";
export const GENERATE_SQL_LIMIT_HEADER = "x-playground-generate-sql-limit";
export const MAX_DAILY_GENERATE_SQL_LIMIT = 2000;

/**
 * @Deprecated
 * Use /playground/generate-sql instead.
 * @param app
 * @param opts
 */
const root: FastifyPluginAsyncJsonSchemaToTs = async (app, opts): Promise<void> => {
  app.get('/quota', {
    preHandler: [app.authenticate],
  }, async function (req, reply) {
    const { playgroundService } = app;
    const { id: userId, githubLogin } = req.user;

    // Get the limit and used.
    let limit = app.config.PLAYGROUND_DAILY_QUESTIONS_LIMIT || MAX_DAILY_GENERATE_SQL_LIMIT;
    let used = await playgroundService.countTodayQuestionRequests(userId, false);

    // Give the trusted users more daily requests.
    const trustedLogins = app.config.PLAYGROUND_TRUSTED_GITHUB_LOGINS;
    if (trustedLogins.includes(githubLogin)) {
      limit = MAX_DAILY_GENERATE_SQL_LIMIT;
    }

    // Set the headers.
    reply.status(200).send({
      limit,
      used,
    });
  });

  app.post<{
    Body: IBody;
  }>('/', {
    preHandler: [app.authenticate],
    schema
  }, async function (req, reply) {
    const { playgroundService, botService } = app;
    const { question, context: questionContext } = req.body;
    const { id: userId, githubId, githubLogin } = req.user;
    const context = {
      this_repo_id: questionContext?.repo_id,
      this_repo_name: questionContext?.repo_name,
      my_user_id: githubId,
      my_user_login: githubLogin,
    };

    // Get the limit and used.
    let limit = app.config.PLAYGROUND_DAILY_QUESTIONS_LIMIT || MAX_DAILY_GENERATE_SQL_LIMIT;
    let used = await playgroundService.countTodayQuestionRequests(userId, false);

    // Give the trusted users more daily requests.
    const trustedLogins = app.config.PLAYGROUND_TRUSTED_GITHUB_LOGINS;
    if (trustedLogins.includes(githubLogin)) {
      limit = MAX_DAILY_GENERATE_SQL_LIMIT;
    }

    // Check if the current user reached the daily request limit.
    reply.header(GENERATE_SQL_LIMIT_HEADER, limit);
    if (used >= limit) {
      reply.header(GENERATE_SQL_USED_HEADER, used);
      throw new APIError(429, `You have reached the daily question limit. Please try again tomorrow.`);
    } else {
      reply.header(GENERATE_SQL_USED_HEADER, used + 1);
    }

    let sql;
    try {
      const promptTemplate = new SQLPlaygroundPromptTemplate();
      sql = await botService.questionToSQL(promptTemplate, question, context);
      if (!sql) {
        throw new APIError(500, 'No SQL generated');
      }
      await playgroundService.recordQuestion({
        userId,
        context,
        question,
        sql: sql,
        success: true,
        preset: false
      });
    } catch (err) {
      await playgroundService.recordQuestion({
        userId,
        context,
        question,
        sql: null,
        success: false,
        preset: false
      });
      throw err;
    }

    if (sql) {
      reply.send({
        sql: sql
      });
    } else {
      reply.status(404).send({
        message: 'No SQL found.'
      });
    }
  });
}

export default root;
