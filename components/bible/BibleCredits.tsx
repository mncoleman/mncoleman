export function BibleCredits({ xrefs = false }: { xrefs?: boolean }) {
    return (
        <footer className="mt-12 space-y-1 border-t border-border pt-6 text-xs text-muted-foreground">
            <p>
                Bible text: KJV (public domain), WEB (public domain; World English Bible is a trademark of eBible.org).
            </p>
            {xrefs && (
                <p>
                    Related passages: cross-references from the Treasury of Scripture Knowledge via{' '}
                    <a href="https://www.openbible.info/labs/cross-references/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                        OpenBible.info
                    </a>
                    , licensed{' '}
                    <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                        CC BY 4.0
                    </a>
                    . Cross-reference list trimmed to the top 8 per verse.
                </p>
            )}
        </footer>
    );
}
