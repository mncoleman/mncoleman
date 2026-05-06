import Link from 'next/link';
import { Home, ArrowLeft } from 'lucide-react';

export const metadata = {
    title: 'Not found | Matthew Coleman',
    description: "The page you're looking for doesn't exist.",
};

export default function NotFound() {
    return (
        <>
            <style>{`
                @keyframes mnc404-orbit {
                    0%   { transform: rotate(0deg)   translateX(120px) rotate(0deg); opacity: 0.6; }
                    50%  { opacity: 1; }
                    100% { transform: rotate(360deg) translateX(120px) rotate(-360deg); opacity: 0.6; }
                }
                @keyframes mnc404-pulse {
                    0%   { transform: scale(0.95); opacity: 0.55; }
                    70%  { transform: scale(1.18); opacity: 0; }
                    100% { transform: scale(1.18); opacity: 0; }
                }
                @keyframes mnc404-glitch {
                    0%, 100% { text-shadow: 0 0 0 transparent, 0 0 0 transparent; }
                    45%      { text-shadow: -2px 0 #016b72, 2px 0 #ff5d8f; }
                    55%      { text-shadow:  2px 0 #016b72, -2px 0 #ff5d8f; }
                }
                .mnc404-core {
                    background: linear-gradient(120deg, var(--foreground) 0%, var(--muted-foreground) 60%, #016b72 100%);
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                    animation: mnc404-glitch 4.2s infinite;
                }
                .mnc404-ring {
                    position: absolute;
                    inset: 50% 50%;
                    width: 200px;
                    height: 200px;
                    margin: -100px 0 0 -100px;
                    border-radius: 50%;
                    border: 1px solid rgba(1, 107, 114, 0.4);
                    animation: mnc404-pulse 2.8s ease-out infinite;
                }
                .mnc404-ring.delay { animation-delay: 1.4s; }
                .mnc404-dot {
                    position: absolute;
                    top: 50%; left: 50%;
                    width: 8px; height: 8px;
                    border-radius: 50%;
                    margin: -4px 0 0 -4px;
                    animation: mnc404-orbit 6s linear infinite;
                }
                .mnc404-dot.a { background: #016b72; box-shadow: 0 0 12px #016b72; }
                .mnc404-dot.b { background: #ff5d8f; box-shadow: 0 0 12px #ff5d8f; animation-delay: -2s; }
                .mnc404-dot.c { background: var(--foreground); box-shadow: 0 0 12px rgba(255,255,255,0.5); animation-delay: -4s; }
            `}</style>

            <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
                <div className="w-full max-w-lg rounded-3xl border border-border/50 bg-background/60 backdrop-blur-xl p-10 md:p-12 text-center shadow-xl">
                    <div className="relative h-56 flex items-center justify-center mb-4">
                        <span className="mnc404-ring" />
                        <span className="mnc404-ring delay" />
                        <span className="mnc404-dot a" />
                        <span className="mnc404-dot b" />
                        <span className="mnc404-dot c" />
                        <span className="mnc404-core text-[112px] md:text-[128px] font-bold leading-none tracking-tighter relative z-10">
                            404
                        </span>
                    </div>

                    <p className="text-xs uppercase tracking-[0.18em] text-[#016b72] mb-3 font-medium">
                        Page not found
                    </p>
                    <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
                        This page is off the map.
                    </h1>
                    <p className="text-muted-foreground leading-relaxed mb-8">
                        The link may be broken, the page may have moved, or you may have just made it up. Either way, here are some places that do exist.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-sm font-medium"
                        >
                            <Home className="h-4 w-4" />
                            Home
                        </Link>
                        <Link
                            href="/blog"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border/60 hover:border-primary/40 hover:bg-accent/40 transition-colors text-sm font-medium"
                        >
                            Blog
                        </Link>
                        <Link
                            href="/artifacts"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border/60 hover:border-primary/40 hover:bg-accent/40 transition-colors text-sm font-medium"
                        >
                            Artifacts
                        </Link>
                        <Link
                            href="/about"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border/60 hover:border-primary/40 hover:bg-accent/40 transition-colors text-sm font-medium"
                        >
                            About
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
