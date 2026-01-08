'use client';

export function HamburgerButton() {
    const handleClick = () => {
        const event = new CustomEvent('toggle-mobile-nav');
        window.dispatchEvent(event);
    };

    return (
        <button
            onClick={handleClick}
            className="p-2 hover:bg-accent rounded-lg transition-colors md:hidden"
            aria-label="Toggle menu"
        >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
        </button>
    );
}
