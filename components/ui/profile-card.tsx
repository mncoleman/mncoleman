'use client';

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { LinkedinIcon, type LinkedinIconHandle } from '@/components/ui/linkedin';
import { InstagramIcon, type InstagramIconHandle } from '@/components/ui/instagram';
import { GithubIcon, type GithubIconHandle } from '@/components/ui/github';
import { XTwitterIcon, type XTwitterIconHandle } from '@/components/ui/x-twitter';
import './profile-card.css';

const DEFAULT_INNER_GRADIENT = 'linear-gradient(145deg,#60496e8c 0%,#71C4FF44 100%)';

const ANIMATION_CONFIG = {
    INITIAL_DURATION: 1200,
    INITIAL_X_OFFSET: 70,
    INITIAL_Y_OFFSET: 60,
    DEVICE_BETA_OFFSET: 20,
    ENTER_TRANSITION_MS: 180
};

const clamp = (v: number, min = 0, max = 100) => Math.min(Math.max(v, min), max);
const round = (v: number, precision = 3) => parseFloat(v.toFixed(precision));
const adjust = (v: number, fMin: number, fMax: number, tMin: number, tMax: number) =>
    round(tMin + ((tMax - tMin) * (v - fMin)) / (fMax - fMin));

interface ProfileCardProps {
    avatarUrl: string;
    innerGradient?: string;
    className?: string;
    enableTilt?: boolean;
    enableMobileTilt?: boolean;
    mobileTiltSensitivity?: number;
    miniAvatarUrl?: string;
    name: string;
    title?: string;
    handle?: string;
    status?: string;
    showUserInfo?: boolean;
    linkedinUrl?: string;
    instagramUrl?: string;
    xUrl?: string;
    githubUrl?: string;
}

const ProfileCardComponent = ({
    avatarUrl,
    innerGradient,
    className = '',
    enableTilt = true,
    enableMobileTilt = false,
    mobileTiltSensitivity = 5,
    miniAvatarUrl,
    name,
    title,
    handle,
    status = 'Online',
    showUserInfo = true,
    linkedinUrl,
    instagramUrl,
    xUrl,
    githubUrl
}: ProfileCardProps) => {
    const wrapRef = useRef<HTMLDivElement>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const linkedinRef = useRef<LinkedinIconHandle>(null);
    const instagramRef = useRef<InstagramIconHandle>(null);
    const githubRef = useRef<GithubIconHandle>(null);
    const xRef = useRef<XTwitterIconHandle>(null);

    const enterTimerRef = useRef<number | null>(null);
    const leaveRafRef = useRef<number | null>(null);

    const tiltEngine = useMemo(() => {
        if (!enableTilt) return null;

        let rafId: number | null = null;
        let running = false;
        let lastTs = 0;

        let currentX = 0;
        let currentY = 0;
        let targetX = 0;
        let targetY = 0;

        const DEFAULT_TAU = 0.14;
        const INITIAL_TAU = 0.6;
        let initialUntil = 0;

        // The shell's size is cached here (fed by a ResizeObserver in the effect
        // below) rather than read off `clientWidth` every frame. Reading it after
        // the previous frame wrote nine custom properties forced a full style
        // recalc per frame — it was the single hottest thing on /about.
        let width = 1;
        let height = 1;

        const setVarsFromXY = (x: number, y: number) => {
            const wrap = wrapRef.current;
            if (!wrap) return;

            const percentX = clamp((100 / width) * x);
            const percentY = clamp((100 / height) * y);

            const centerX = percentX - 50;
            const centerY = percentY - 50;

            const properties: Record<string, string> = {
                '--pointer-x': `${percentX}%`,
                '--pointer-y': `${percentY}%`,
                '--background-x': `${adjust(percentX, 0, 100, 35, 65)}%`,
                '--background-y': `${adjust(percentY, 0, 100, 35, 65)}%`,
                '--pointer-from-center': `${clamp(Math.hypot(percentY - 50, percentX - 50) / 50, 0, 1)}`,
                '--pointer-from-top': `${percentY / 100}`,
                '--pointer-from-left': `${percentX / 100}`,
                '--rotate-x': `${round(-(centerX / 5))}deg`,
                '--rotate-y': `${round(centerY / 4)}deg`
            };

            for (const [k, v] of Object.entries(properties)) wrap.style.setProperty(k, v);
        };

        const step = (ts: number) => {
            if (!running) return;
            if (lastTs === 0) lastTs = ts;
            const dt = (ts - lastTs) / 1000;
            lastTs = ts;

            const tau = ts < initialUntil ? INITIAL_TAU : DEFAULT_TAU;
            const k = 1 - Math.exp(-dt / tau);

            currentX += (targetX - currentX) * k;
            currentY += (targetY - currentY) * k;

            setVarsFromXY(currentX, currentY);

            const stillFar = Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05;

            // Demand-driven: only while there is distance left to cover. This used
            // to also continue while `document.hasFocus()`, which meant the loop
            // never stopped for as long as the window was focused — and there are
            // two of these mounted on /about (one per breakpoint), so the hidden one
            // was burning frames too. Every input path calls `start()` again.
            if (stillFar) {
                rafId = requestAnimationFrame(step);
            } else {
                running = false;
                lastTs = 0;
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
            }
        };

        const start = () => {
            if (running) return;
            // `display: none` on the other breakpoint's copy — nothing to animate.
            if (shellRef.current && shellRef.current.offsetParent === null) return;
            running = true;
            lastTs = 0;
            rafId = requestAnimationFrame(step);
        };

        return {
            setSize(w: number, h: number) {
                width = w || 1;
                height = h || 1;
            },
            setImmediate(x: number, y: number) {
                currentX = x;
                currentY = y;
                setVarsFromXY(currentX, currentY);
            },
            setTarget(x: number, y: number) {
                targetX = x;
                targetY = y;
                start();
            },
            toCenter() {
                this.setTarget(width / 2, height / 2);
            },
            beginInitial(durationMs: number) {
                initialUntil = performance.now() + durationMs;
                start();
            },
            getCurrent() {
                return { x: currentX, y: currentY, tx: targetX, ty: targetY };
            },
            cancel() {
                if (rafId) cancelAnimationFrame(rafId);
                rafId = null;
                running = false;
                lastTs = 0;
            }
        };
    }, [enableTilt]);

    const getOffsets = (evt: React.PointerEvent | PointerEvent, el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    };

    const handlePointerMove = useCallback(
        (event: PointerEvent) => {
            const shell = shellRef.current;
            if (!shell || !tiltEngine) return;
            const { x, y } = getOffsets(event, shell);
            tiltEngine.setTarget(x, y);
        },
        [tiltEngine]
    );

    const handlePointerEnter = useCallback(
        (event: PointerEvent) => {
            const shell = shellRef.current;
            if (!shell || !tiltEngine) return;

            shell.classList.add('active');
            shell.classList.add('entering');
            if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
            enterTimerRef.current = window.setTimeout(() => {
                shell.classList.remove('entering');
            }, ANIMATION_CONFIG.ENTER_TRANSITION_MS);

            const { x, y } = getOffsets(event, shell);
            tiltEngine.setTarget(x, y);
        },
        [tiltEngine]
    );

    const handlePointerLeave = useCallback(() => {
        const shell = shellRef.current;
        if (!shell || !tiltEngine) return;

        tiltEngine.toCenter();

        const checkSettle = () => {
            const { x, y, tx, ty } = tiltEngine.getCurrent();
            const settled = Math.hypot(tx - x, ty - y) < 0.6;
            if (settled) {
                shell.classList.remove('active');
                leaveRafRef.current = null;
            } else {
                leaveRafRef.current = requestAnimationFrame(checkSettle);
            }
        };
        if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
        leaveRafRef.current = requestAnimationFrame(checkSettle);
    }, [tiltEngine]);

    const handleDeviceOrientation = useCallback(
        (event: DeviceOrientationEvent) => {
            const shell = shellRef.current;
            if (!shell || !tiltEngine) return;

            const { beta, gamma } = event;
            if (beta == null || gamma == null) return;

            // Event-driven (not per frame), so a direct read here is fine.
            const w = shell.clientWidth;
            const h = shell.clientHeight;
            const x = clamp(w / 2 + gamma * mobileTiltSensitivity, 0, w);
            const y = clamp(
                h / 2 + (beta - ANIMATION_CONFIG.DEVICE_BETA_OFFSET) * mobileTiltSensitivity,
                0,
                h
            );

            tiltEngine.setTarget(x, y);
        },
        [tiltEngine, mobileTiltSensitivity]
    );

    useEffect(() => {
        if (!enableTilt || !tiltEngine) return;

        const shell = shellRef.current;
        if (!shell) return;

        const pointerMoveHandler = handlePointerMove;
        const pointerEnterHandler = handlePointerEnter;
        const pointerLeaveHandler = handlePointerLeave;
        const deviceOrientationHandler = handleDeviceOrientation;

        shell.addEventListener('pointerenter', pointerEnterHandler as EventListener);
        shell.addEventListener('pointermove', pointerMoveHandler as EventListener);
        shell.addEventListener('pointerleave', pointerLeaveHandler as EventListener);

        const handleClick = () => {
            if (!enableMobileTilt || location.protocol !== 'https:') return;
            const anyMotion = window.DeviceMotionEvent as any;
            if (anyMotion && typeof anyMotion.requestPermission === 'function') {
                anyMotion
                    .requestPermission()
                    .then((state: string) => {
                        if (state === 'granted') {
                            window.addEventListener('deviceorientation', deviceOrientationHandler as EventListener);
                        }
                    })
                    .catch(console.error);
            } else {
                window.addEventListener('deviceorientation', deviceOrientationHandler as EventListener);
            }
        };
        shell.addEventListener('click', handleClick);

        // Keep the engine's cached size current without per-frame DOM reads.
        tiltEngine.setSize(shell.clientWidth, shell.clientHeight);
        const ro = new ResizeObserver((entries) => {
            const box = entries[0]?.contentRect;
            if (box) tiltEngine.setSize(box.width, box.height);
        });
        ro.observe(shell);

        const initialX = (shell.clientWidth || 0) - ANIMATION_CONFIG.INITIAL_X_OFFSET;
        const initialY = ANIMATION_CONFIG.INITIAL_Y_OFFSET;
        tiltEngine.setImmediate(initialX, initialY);
        tiltEngine.toCenter();
        tiltEngine.beginInitial(ANIMATION_CONFIG.INITIAL_DURATION);

        return () => {
            shell.removeEventListener('pointerenter', pointerEnterHandler as EventListener);
            shell.removeEventListener('pointermove', pointerMoveHandler as EventListener);
            shell.removeEventListener('pointerleave', pointerLeaveHandler as EventListener);
            shell.removeEventListener('click', handleClick);
            ro.disconnect();
            window.removeEventListener('deviceorientation', deviceOrientationHandler as EventListener);
            if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
            if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
            tiltEngine.cancel();
            shell.classList.remove('entering');
        };
    }, [
        enableTilt,
        enableMobileTilt,
        tiltEngine,
        handlePointerMove,
        handlePointerEnter,
        handlePointerLeave,
        handleDeviceOrientation
    ]);

    const cardStyle = useMemo(
        () => ({
            '--inner-gradient': innerGradient ?? DEFAULT_INNER_GRADIENT
        } as React.CSSProperties),
        [innerGradient]
    );

    return (
        <div ref={wrapRef} className={`pc-card-wrapper ${className}`.trim()} style={cardStyle}>
            <div ref={shellRef} className="pc-card-shell">
                <section className="pc-card">
                    <div className="pc-inside">
                        <div className="pc-glare" />
                        <div className="pc-content pc-avatar-content">
                            <picture>
                                <source srcSet={avatarUrl.replace(/\.(jpe?g|png)$/i, '.webp')} type="image/webp" />
                                <img
                                    className="avatar"
                                    src={avatarUrl}
                                    alt={`${name} avatar`}
                                    fetchPriority="high"
                                    decoding="async"
                                    // Replicates next/image `fill` + objectFit so layout is unchanged.
                                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </picture>
                            {showUserInfo && (
                                <div className="pc-user-info">
                                    <div className="pc-social-icons">
                                        {linkedinUrl && (
                                            <a
                                                href={linkedinUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="pc-social-icon"
                                                aria-label="LinkedIn"
                                                style={{ pointerEvents: 'auto' }}
                                                onMouseEnter={() => linkedinRef.current?.startAnimation()}
                                                onMouseLeave={() => linkedinRef.current?.stopAnimation()}
                                            >
                                                <LinkedinIcon ref={linkedinRef} />
                                            </a>
                                        )}
                                        {instagramUrl && (
                                            <a
                                                href={instagramUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="pc-social-icon"
                                                aria-label="Instagram"
                                                style={{ pointerEvents: 'auto' }}
                                                onMouseEnter={() => instagramRef.current?.startAnimation()}
                                                onMouseLeave={() => instagramRef.current?.stopAnimation()}
                                            >
                                                <InstagramIcon ref={instagramRef} />
                                            </a>
                                        )}
                                        {xUrl && (
                                            <a
                                                href={xUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="pc-social-icon"
                                                aria-label="X (Twitter)"
                                                style={{ pointerEvents: 'auto' }}
                                                onMouseEnter={() => xRef.current?.startAnimation()}
                                                onMouseLeave={() => xRef.current?.stopAnimation()}
                                            >
                                                <XTwitterIcon ref={xRef} />
                                            </a>
                                        )}
                                        {githubUrl && (
                                            <a
                                                href={githubUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="pc-social-icon"
                                                aria-label="GitHub"
                                                style={{ pointerEvents: 'auto' }}
                                                onMouseEnter={() => githubRef.current?.startAnimation()}
                                                onMouseLeave={() => githubRef.current?.stopAnimation()}
                                            >
                                                <GithubIcon ref={githubRef} />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="pc-content">
                            <div className="pc-details">
                                <h3>{name}</h3>
                                {title && <p>{title}</p>}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export const ProfileCard = React.memo(ProfileCardComponent);
