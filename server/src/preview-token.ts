import { jwtVerify } from 'jose';

/** Query parameter the admin panel appends to /a/:slug to open a private artifact without its password. */
export const PREVIEW_PARAM = 'adminPreview';
export const PREVIEW_PURPOSE = 'artifact-preview';
/** Its own audience, so requireAuth (aud 'artifacts-service') rejects a preview token structurally on every API route. */
export const PREVIEW_AUDIENCE = 'artifacts-preview';

/**
 * Verifies the short-lived, single-slug token the admin Worker mints for the
 * admin panel's preview frame. Same shared secret and audience as every other
 * service token, but it only unlocks the one artifact it names: signature,
 * audience, expiry, purpose and slug must all match. Anything else is false,
 * and the caller then serves the normal password gate.
 */
export async function verifyPreviewToken(token: string | undefined | null, slug: string, secret: string | undefined): Promise<boolean> {
    if (!token || !secret || token.length > 2048) return false;
    try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
            algorithms: ['HS256'], // pins HS256: 'none' and HS384 are refused
            audience: PREVIEW_AUDIENCE,
        });
        return payload.purpose === PREVIEW_PURPOSE && payload.preview === slug;
    } catch {
        return false;
    }
}
