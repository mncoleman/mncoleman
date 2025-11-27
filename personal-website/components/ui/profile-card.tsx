'use client';

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Linkedin, Instagram } from 'lucide-react';
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
    xUrl
}: ProfileCardProps) => {
    const wrapRef = useRef<HTMLDivElement>(null);
    const shellRef = useRef<HTMLDivElement>(null);

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

        const setVarsFromXY = (x: number, y: number) => {
            const shell = shellRef.current;
            const wrap = wrapRef.current;
            if (!shell || !wrap) return;

            const width = shell.clientWidth || 1;
            const height = shell.clientHeight || 1;

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

            if (stillFar || document.hasFocus()) {
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
            running = true;
            lastTs = 0;
            rafId = requestAnimationFrame(step);
        };

        return {
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
                const shell = shellRef.current;
                if (!shell) return;
                this.setTarget(shell.clientWidth / 2, shell.clientHeight / 2);
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

            const centerX = shell.clientWidth / 2;
            const centerY = shell.clientHeight / 2;
            const x = clamp(centerX + gamma * mobileTiltSensitivity, 0, shell.clientWidth);
            const y = clamp(
                centerY + (beta - ANIMATION_CONFIG.DEVICE_BETA_OFFSET) * mobileTiltSensitivity,
                0,
                shell.clientHeight
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
                            <Image
                                className="avatar"
                                src={avatarUrl}
                                alt={`${name} avatar`}
                                fill
                                style={{ objectFit: 'cover' }}
                                priority
                            />
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
                                            >
                                                <Linkedin strokeWidth={2} />
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
                                            >
                                                <Instagram strokeWidth={2} />
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
                                            >
                                                <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ background: 'none', border: 'none' }}>
                                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                                </svg>
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
