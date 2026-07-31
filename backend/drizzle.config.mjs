import 'dotenv/config';

export default {
  schema: './src/db/schema.mjs',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
