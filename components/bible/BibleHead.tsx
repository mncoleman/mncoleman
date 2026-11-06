/**
 * Server component. Emits the CSS that switches KJV/WEB text and a pre-paint script that
 * restores the saved choice, so a WEB reader never sees a flash of KJV. Without JS the
 * default is KJV and both toggles are simply inert.
 */
const CSS = `
html:not([data-bible-tr="web"]) .tr-web{display:none}
html[data-bible-tr="web"] .tr-kjv{display:none}
.bible-verse{scroll-margin-top:6rem}
.bible-ch{display:flex;flex-wrap:wrap;gap:.375rem}
.bible-ch a{display:inline-flex;height:1.75rem;min-width:1.75rem;align-items:center;justify-content:center;padding:0 .375rem;border:1px solid hsl(var(--border));border-radius:.25rem;font-size:.75rem;color:hsl(var(--muted-foreground))}
.bible-ch a:hover{background:hsl(var(--accent));color:hsl(var(--foreground))}
.bible-p{line-height:1.625}.bible-p sup{margin-right:.375rem;font-size:.75rem;font-weight:600;color:hsl(var(--muted-foreground))}
.bible-x{margin-top:.25rem;font-size:.75rem;color:hsl(var(--muted-foreground))}.bible-x a:hover{color:hsl(var(--foreground))}
.bible-det{margin-top:.25rem;font-size:.75rem}
.bible-det>summary{cursor:pointer;user-select:none;color:hsl(var(--muted-foreground))}
.bible-det>summary:hover{color:hsl(var(--foreground))}
.bible-rel{margin-top:.5rem;padding-left:.75rem;border-left:1px solid hsl(var(--border));font-size:13px;line-height:1.35}
.bible-rel>li+li{margin-top:.5rem}
.bible-rel a{font-weight:500;text-decoration:underline;text-underline-offset:2px}
.bible-rel a:hover{text-decoration:none}
.bible-verse:target,.bible-verse[data-hl="1"]{background:rgba(56,152,200,.14);box-shadow:-0.75rem 0 0 rgba(56,152,200,.14),0.75rem 0 0 rgba(56,152,200,.14)}
`;
const SCRIPT = `try{var t=localStorage.getItem('bible-translation');if(t==='web'||t==='kjv')document.documentElement.dataset.bibleTr=t}catch(e){}`;

export function BibleHead() {
    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
        </>
    );
}
