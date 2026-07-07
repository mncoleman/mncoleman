import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

/**
 * Non-AI profanity / inappropriate-content filter for the short free-text
 * visitor fields (name, favorite food, favorite song, random fact, place label).
 *
 * obscenity's English dataset covers strong profanity + common slurs and ships
 * whitelists for the classic false-positives (Scunthorpe, Penistone, …). The
 * recommended transformers defeat leetspeak / spacing / unicode look-alike
 * evasion ("f u c k", "ʃ h i t", "sh1t"). All checks run server-side — client
 * filtering is never trusted.
 */
const matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
});

/**
 * Small supplemental deny list — extend as needed. obscenity handles the bulk;
 * add terms here (matched as lowercased substrings) only for gaps you actually
 * observe. Kept empty by default so we don't hand-maintain an offensive corpus.
 */
const SUPPLEMENTAL_DENY: string[] = [];

/**
 * Whole-field allowlist — legitimate values that must never trip the filter even
 * if a substring looks bad. obscenity already whitelists these internally; this
 * is belt-and-suspenders and an easy extension point for real false-positives.
 */
const ALLOWLIST = new Set<string>(['scunthorpe', 'penistone', 'lightwater', 'cockburn', 'clitheroe']);

export interface ModerationResult {
    clean: boolean;
    field?: string;
}

function isDirty(text: string): boolean {
    if (!text) return false;
    const lowered = text.toLowerCase().trim();
    if (ALLOWLIST.has(lowered)) return false;
    if (matcher.hasMatch(text)) return true;
    for (const term of SUPPLEMENTAL_DENY) {
        if (lowered.includes(term)) return true;
    }
    return false;
}

/**
 * Scan the user-supplied free-text fields. Returns the first dirty field name,
 * if any, so the client can point the visitor at what to fix.
 */
export function moderateFields(fields: Record<string, string | null | undefined>): ModerationResult {
    for (const [field, value] of Object.entries(fields)) {
        if (value && isDirty(value)) return { clean: false, field };
    }
    return { clean: true };
}
