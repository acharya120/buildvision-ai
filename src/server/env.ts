export interface Env {
  DATABASE_URL?: string;
  APP_SECRET?: string;
  ADMIN_EMAIL?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM_NAME?: string;
  NODE_ENV?: string;
}
export const readEnv = (): Env => {
  const e = process.env;
  return { DATABASE_URL: e.DATABASE_URL, APP_SECRET: e.APP_SECRET, ADMIN_EMAIL: e.ADMIN_EMAIL, SMTP_HOST: e.SMTP_HOST, SMTP_PORT: e.SMTP_PORT, SMTP_USER: e.SMTP_USER, SMTP_PASS: e.SMTP_PASS, SMTP_FROM_NAME: e.SMTP_FROM_NAME, NODE_ENV: e.NODE_ENV };
};
