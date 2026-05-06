import { jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';

const SECRET = process.env.JWT_SECRET
    ? new TextEncoder().encode(process.env.JWT_SECRET)
    : null;

if (!SECRET) {
    console.warn('[auth] JWT_SECRET not set — all authed endpoints will reject requests.');
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
    if (!SECRET) {
        return c.json({ error: 'service not configured' }, 503);
    }
    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
        return c.json({ error: 'unauthorized' }, 401);
    }
    const token = auth.slice(7);
    try {
        const { payload } = await jwtVerify(token, SECRET, {
            algorithms: ['HS256'],
            audience: 'artifacts-service',
        });
        c.set('user', payload);
        await next();
    } catch {
        return c.json({ error: 'invalid token' }, 401);
    }
};
