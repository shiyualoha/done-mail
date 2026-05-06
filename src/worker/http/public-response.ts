import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface PublicPagination {
  limit: number;
  nextCursor: string;
  hasMore: boolean;
}

export function publicOk<T>(c: Context, data: T, pagination?: PublicPagination) {
  return c.json({
    ok: true,
    data,
    ...(pagination ? { pagination } : {})
  });
}

export function publicFail(c: Context, message: string, status: ContentfulStatusCode = 400, code = 'request_failed') {
  return c.json(
    {
      ok: false,
      error: { code, message }
    },
    { status }
  );
}
