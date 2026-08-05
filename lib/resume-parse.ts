/**
 * Turns the Notion-authored resume markdown into a structured shape the resume
 * page can lay out as cards, instead of dumping it through `prose`.
 *
 * Notion is the author here, so the markdown will drift. Every classifier below
 * is a fuzzy match on the heading text and anything unrecognised falls through
 * to `extra`, which the page renders as plain markdown — a renamed or brand-new
 * section degrades to readable prose rather than disappearing.
 */

export type ContactType = 'email' | 'linkedin' | 'website' | 'location' | 'phone';

export interface ResumeContact {
    type: ContactType;
    label: string;
    href: string;
}

export interface ResumeExperience {
    /** Rendered as the prominent, accent-coloured line. */
    company: string;
    role: string;
    location?: string;
    dates?: string;
    /** Lead paragraph(s), always visible. */
    summary: string[];
    /** Detail bullets, collapsed behind the disclosure. */
    bullets: string[];
}

export interface ResumeEducation {
    title: string;
    meta?: string;
}

export interface ResumeExtraSection {
    heading: string;
    markdown: string;
}

export interface ParsedResume {
    name: string;
    headline?: string;
    contacts: ResumeContact[];
    summaryHeading: string;
    summary: string[];
    skillsHeading: string;
    skills: string[];
    certificationsHeading: string;
    certifications: string[];
    experienceHeading: string;
    experience: ResumeExperience[];
    educationHeading: string;
    education: ResumeEducation[];
    extra: ResumeExtraSection[];
}

/**
 * Strip the wrapping emphasis Notion adds to headings (`### **Role**`).
 *
 * Applied repeatedly because Notion sometimes closes a bold run *after* the
 * separator (`**Programme |** _dates_`), so splitting on `|` leaves a fragment
 * carrying two different markers that a single pass would only half-remove.
 */
function stripEmphasis(value: string): string {
    let result = value.trim();
    for (let pass = 0; pass < 4; pass += 1) {
        const next = result
            .replace(/^\s*[*_]{1,3}\s*/, '')
            .replace(/\s*[*_]{1,3}\s*$/, '')
            .trim();
        if (next === result) break;
        result = next;
    }
    return result;
}

/** Heading text as displayed: no trailing colon, no emphasis. */
function cleanHeading(value: string): string {
    return stripEmphasis(value).replace(/\s*:\s*$/, '').trim();
}

function isDivider(line: string): boolean {
    return /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function isBullet(line: string): boolean {
    return /^\s*[-*+]\s+/.test(line);
}

function bulletText(line: string): string {
    return line.replace(/^\s*[-*+]\s+/, '').trim();
}

/**
 * A date-ish line: `_July 2024 - Present (1 year 7 months)_`. Matched on the
 * emphasis wrapper plus a year, so a plain italic sentence isn't mistaken for one.
 */
function isDateLine(line: string): boolean {
    const bare = stripEmphasis(line);
    return /^[*_]/.test(line.trim()) && /\b(19|20)\d{2}\b|\bpresent\b/i.test(bare);
}

function classifyContact(label: string, href: string): ResumeContact {
    const lowerHref = href.toLowerCase();
    const lowerLabel = label.toLowerCase();

    if (lowerHref.startsWith('mailto:')) {
        const address = href.slice('mailto:'.length).replace(/\/+$/, '');
        // Notion sometimes produces a `mailto:` link around what is plainly a
        // domain (no `@`). Treat that as the website it actually is rather than
        // shipping a mail link that opens a broken compose window.
        if (address.includes('@')) {
            return { type: 'email', label: address, href: `mailto:${address}` };
        }
        return { type: 'website', label: address, href: `https://${address}` };
    }
    if (lowerHref.startsWith('tel:')) {
        return { type: 'phone', label: label || href.slice(4), href };
    }
    if (lowerHref.includes('linkedin.com') || lowerLabel.includes('linkedin')) {
        return { type: 'linkedin', label, href: href.replace(/^http:/, 'https:') };
    }
    if (lowerHref.includes('google.com/maps')) {
        return { type: 'location', label, href };
    }
    return { type: 'website', label, href: href.replace(/^http:/, 'https:') };
}

function parseContacts(line: string): ResumeContact[] {
    const contacts: ResumeContact[] = [];
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(line)) !== null) {
        contacts.push(classifyContact(match[1].trim(), match[2].trim()));
    }

    // De-duplicate on destination — Notion occasionally emits the same link twice.
    const seen = new Set<string>();
    return contacts.filter((contact) => {
        const key = contact.href.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

interface RawSection {
    heading: string;
    lines: string[];
}

/** Split the body into `##` sections, keeping anything before the first one as the preamble. */
function splitSections(lines: string[]): { preamble: string[]; sections: RawSection[] } {
    const preamble: string[] = [];
    const sections: RawSection[] = [];
    let current: RawSection | null = null;

    for (const line of lines) {
        const heading = /^##\s+(?!#)(.*)$/.exec(line);
        if (heading) {
            current = { heading: cleanHeading(heading[1]), lines: [] };
            sections.push(current);
            continue;
        }
        (current ? current.lines : preamble).push(line);
    }

    return { preamble, sections };
}

interface RawEntry {
    title: string;
    lines: string[];
}

/** Split a section's body into `###` entries. */
function splitEntries(lines: string[]): RawEntry[] {
    const entries: RawEntry[] = [];
    let current: RawEntry | null = null;

    for (const line of lines) {
        const heading = /^###\s+(.*)$/.exec(line);
        if (heading) {
            current = { title: stripEmphasis(heading[1]), lines: [] };
            entries.push(current);
            continue;
        }
        if (current) current.lines.push(line);
    }

    return entries;
}

function parseExperienceEntry(entry: RawEntry): ResumeExperience {
    const role = entry.title;
    let company = '';
    let location: string | undefined;
    let dates: string | undefined;
    const summary: string[] = [];
    const bullets: string[] = [];

    const body = entry.lines.filter((line) => !isDivider(line));

    for (const raw of body) {
        const line = raw.trim();
        if (!line) continue;

        if (isBullet(line)) {
            bullets.push(bulletText(line));
            continue;
        }

        // `**Dovito Business Solutions** | Windsor, Colorado`
        if (!company && /^\*\*/.test(line)) {
            const [head, ...rest] = line.split('|');
            company = stripEmphasis(head);
            const tail = stripEmphasis(rest.join('|').trim());
            if (tail) {
                if (isDateLine(rest.join('|').trim())) dates = tail;
                else location = tail;
            }
            continue;
        }

        if (!dates && isDateLine(line)) {
            dates = stripEmphasis(line);
            continue;
        }

        summary.push(line);
    }

    // Role-only entries (no bold company line) still deserve a headline, so fall
    // back to the h3 rather than rendering a card with an empty title.
    if (!company) {
        company = role;
        return { company, role: '', location, dates, summary, bullets };
    }

    return { company, role, location, dates, summary, bullets };
}

function parseEducationEntry(entry: RawEntry): ResumeEducation {
    const meta = entry.lines
        .map((line) => line.trim())
        .filter((line) => line && !isDivider(line))
        .map((line) =>
            line
                .split('|')
                .map((part) => stripEmphasis(part.trim()))
                .filter(Boolean)
                .join(' · ')
        )
        .join(' · ');

    return { title: entry.title, meta: meta || undefined };
}

function collectBullets(lines: string[]): string[] {
    return lines
        .map((line) => line.trim())
        .filter(isBullet)
        .map(bulletText);
}

function collectParagraphs(lines: string[]): string[] {
    return lines
        .map((line) => line.trim())
        .filter((line) => line && !isDivider(line) && !isBullet(line));
}

const matches = (heading: string, ...needles: string[]): boolean => {
    const lower = heading.toLowerCase();
    return needles.some((needle) => lower.includes(needle));
};

export function parseResume(markdown: string): ParsedResume {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');

    const parsed: ParsedResume = {
        name: '',
        contacts: [],
        summaryHeading: 'Summary',
        summary: [],
        skillsHeading: 'Skills',
        skills: [],
        certificationsHeading: 'Certifications',
        certifications: [],
        experienceHeading: 'Experience',
        experience: [],
        educationHeading: 'Education',
        education: [],
        extra: [],
    };

    const { preamble, sections } = splitSections(lines);

    // ---- Header ---------------------------------------------------------
    for (const raw of preamble) {
        const line = raw.trim();
        if (!line || isDivider(line)) continue;

        const h1 = /^#\s+(?!#)(.*)$/.exec(line);
        if (h1) {
            parsed.name = stripEmphasis(h1[1]);
            continue;
        }
        if (/\[[^\]]+\]\([^)]+\)/.test(line)) {
            parsed.contacts.push(...parseContacts(line));
            continue;
        }
        if (!parsed.headline) parsed.headline = stripEmphasis(line);
    }

    // ---- Sections -------------------------------------------------------
    for (const section of sections) {
        const { heading } = section;

        if (matches(heading, 'experience', 'employment', 'work history')) {
            parsed.experienceHeading = heading;
            parsed.experience.push(...splitEntries(section.lines).map(parseExperienceEntry));
            continue;
        }
        if (matches(heading, 'education')) {
            parsed.educationHeading = heading;
            parsed.education.push(...splitEntries(section.lines).map(parseEducationEntry));
            continue;
        }
        if (matches(heading, 'certification', 'license', 'credential')) {
            parsed.certificationsHeading = heading;
            parsed.certifications.push(...collectBullets(section.lines));
            continue;
        }
        if (matches(heading, 'skill', 'competenc', 'strength')) {
            parsed.skillsHeading = heading;
            parsed.skills.push(...collectBullets(section.lines));
            continue;
        }
        if (matches(heading, 'summary', 'about', 'profile', 'overview')) {
            parsed.summaryHeading = heading;
            parsed.summary.push(...collectParagraphs(section.lines));
            continue;
        }

        const markdownBody = section.lines
            .join('\n')
            .replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, '')
            .trim();
        if (markdownBody) parsed.extra.push({ heading, markdown: markdownBody });
    }

    return parsed;
}

/**
 * True when the markdown produced enough structure to be worth laying out as
 * cards. Anything less (the credential-less placeholder, a stub page) is better
 * served by the plain markdown fallback.
 */
export function hasStructure(parsed: ParsedResume): boolean {
    return Boolean(
        parsed.name &&
            (parsed.experience.length > 0 || parsed.education.length > 0 || parsed.summary.length > 0)
    );
}
