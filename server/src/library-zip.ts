import { zipSync, strToU8 } from 'fflate';
import { getSkillMd, listSkillResources } from './library-storage';

/**
 * Builds a skill zip with `<slug>/` as the zip's root entry — required by both
 * claude.ai's Capabilities skill upload and Claude Code's `.claude/skills/<name>/`
 * convention. The slug already satisfies SKILL.md's `name` charset/length rules
 * (shared `isValidSlug` regex), so no renaming happens at zip time.
 */
export async function buildSkillZip(slug: string): Promise<Buffer> {
    const skillMd = await getSkillMd(slug);
    const resources = await listSkillResources(slug);

    const files: Record<string, Uint8Array> = {
        [`${slug}/SKILL.md`]: strToU8(skillMd),
    };
    for (const r of resources) {
        files[`${slug}/${r.folder}/${r.filename}`] = strToU8(r.content);
    }

    return Buffer.from(zipSync(files, { level: 6 }));
}
