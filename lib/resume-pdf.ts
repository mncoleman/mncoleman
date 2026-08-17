import type { ParsedResume } from '@/lib/resume-parse';

/**
 * Builds the resume as a real, text-selectable PDF in the browser.
 *
 * The alternative — rasterising the DOM with html2canvas — produces a picture of
 * a resume: unselectable, unsearchable, and rejected outright by most applicant
 * tracking systems. Laying the typed `ParsedResume` out directly costs a little
 * more code and gives a document that behaves like a document.
 *
 * `jspdf` is ~350 KB and is only ever needed by someone who clicks Save, so it is
 * imported dynamically at call time and never enters any route's bundle.
 *
 * The visual hierarchy deliberately mirrors the `@media print` block in
 * `globals.css` — same order, same rules under the headings, same restraint — so
 * "Print" and "Save" hand back recognisably the same document.
 */

const MARGIN = 54; // 0.75in
const RULE = '#999999';
const BODY = '#1a1a1a';
const MUTED = '#555555';

/** Markdown to plain text: the PDF has no inline formatting to render it into. */
function plain(markdown: string): string {
    return markdown
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links keep their label
        .replace(/`([^`]*)`/g, '$1')
        .replace(/[*_]{1,3}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export async function downloadResumePdf(resume: ParsedResume): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const width = pageW - MARGIN * 2;
    let y = MARGIN;

    /** Starts a new page when the next block would run off the bottom. */
    const ensure = (needed: number) => {
        if (y + needed > pageH - MARGIN) {
            doc.addPage();
            y = MARGIN;
        }
    };

    const text = (
        value: string,
        {
            size = 9.5,
            style = 'normal',
            color = BODY,
            indent = 0,
            gap = 3,
            lineHeight = 1.35,
        }: {
            size?: number;
            style?: 'normal' | 'bold' | 'italic';
            color?: string;
            indent?: number;
            gap?: number;
            lineHeight?: number;
        } = {}
    ) => {
        doc.setFont('helvetica', style);
        doc.setFontSize(size);
        doc.setTextColor(color);
        const lines = doc.splitTextToSize(value, width - indent) as string[];
        const step = size * lineHeight;
        for (const line of lines) {
            // Per line, not per block: a long paragraph should break across pages
            // rather than jumping wholesale to the next one.
            ensure(step);
            doc.text(line, MARGIN + indent, y + size * 0.85);
            y += step;
        }
        y += gap;
    };

    const heading = (label: string) => {
        ensure(34);
        y += 8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(BODY);
        doc.text(label.toUpperCase(), MARGIN, y + 10);
        y += 15;
        doc.setDrawColor(RULE);
        doc.setLineWidth(0.5);
        doc.line(MARGIN, y, pageW - MARGIN, y);
        y += 9;
    };

    const bullet = (value: string) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(BODY);
        const lines = doc.splitTextToSize(plain(value), width - 14) as string[];
        lines.forEach((line, i) => {
            ensure(13);
            if (i === 0) doc.text('•', MARGIN + 2, y + 8);
            doc.text(line, MARGIN + 14, y + 8);
            y += 12.8;
        });
        y += 2;
    };

    // ── Header ──────────────────────────────────────────────────────────────
    text(resume.name, { size: 21, style: 'bold', gap: 2 });
    if (resume.headline) text(plain(resume.headline), { size: 11, color: MUTED, gap: 4 });
    if (resume.contacts.length) {
        text(resume.contacts.map((c) => c.label).join('  ·  '), { size: 9, color: MUTED, gap: 6 });
    }
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y, pageW - MARGIN, y);
    y += 4;

    // ── Body, in the same order as the page ─────────────────────────────────
    if (resume.summary.length) {
        heading(resume.summaryHeading);
        resume.summary.forEach((p) => text(plain(p)));
    }

    if (resume.skills.length) {
        heading(resume.skillsHeading);
        resume.skills.forEach(bullet);
    }

    if (resume.certifications.length) {
        heading(resume.certificationsHeading);
        resume.certifications.forEach(bullet);
    }

    if (resume.experience.length) {
        heading(resume.experienceHeading);
        resume.experience.forEach((entry) => {
            // Keep a role's title line with at least the start of its body.
            ensure(40);
            const role = [entry.company, entry.role].filter(Boolean).join(' — ');
            text(plain(role), { size: 10.5, style: 'bold', gap: 1 });
            const meta = [entry.dates, entry.location].filter(Boolean).join('  |  ');
            if (meta) text(meta, { size: 8.5, style: 'italic', color: MUTED, gap: 3 });
            entry.summary.forEach((p) => text(plain(p)));
            entry.bullets.forEach(bullet);
            y += 4;
        });
    }

    if (resume.education.length) {
        heading(resume.educationHeading);
        resume.education.forEach((entry) => {
            text(plain(entry.title), { size: 10, style: 'bold', gap: 1 });
            if (entry.meta) text(plain(entry.meta), { size: 9, color: MUTED });
        });
    }

    // Unrecognised sections still print — same "degrade to prose, never vanish"
    // contract `lib/resume-parse.ts` gives the page itself.
    resume.extra.forEach((section) => {
        heading(section.heading);
        section.markdown
            .split(/\n{2,}/)
            .map(plain)
            .filter(Boolean)
            .forEach((p) => text(p));
    });

    const slug = resume.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    doc.save(`${slug || 'resume'}.pdf`);
}
