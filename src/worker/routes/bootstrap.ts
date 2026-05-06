import { Hono } from 'hono';
import { authStateFromConfig } from '../auth';
import { getAuthConfig, getPublicSettings } from '../config';
import { hasValidCookieSession } from '../http/auth';
import type { Env } from '../types';
import { apiOk } from '../utils';

const bootstrapRoutes = new Hono<{ Bindings: Env }>();

bootstrapRoutes.get('/', async (c) => {
  const authConfig = await getAuthConfig(c.env);
  const auth = authStateFromConfig(authConfig);
  const authenticated = auth.initialized ? await hasValidCookieSession(c, auth.version) : false;
  const settings = await getPublicSettings(c.env);

  return apiOk(c, {
    auth: {
      initialized: auth.initialized,
      authenticated
    },
    settings
  });
});

export default bootstrapRoutes;
