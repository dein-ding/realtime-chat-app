import * as Joi from '@hapi/joi';

export const configValidationSchema = Joi.object({
    PORT: Joi.number().default(3000),
    STAGE: Joi.string().default('dev'),
    DATABASE_URL: Joi.string().required(),
    JWT_SECRET: Joi.string().required(),

    ADMIN_PWD: Joi.string().required(),
});
