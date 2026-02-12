import React, { useEffect, useMemo, useRef, ReactNode, RefObject } from 'react';
import { gsap } from 'gsap';

interface ScrollFloatProps {
  children: ReactNode;
  triggerRef?: RefObject<HTMLElement>;
  containerClassName?: string;
  textClassName?: string;
  animationDuration?: number;
  ease?: string;
  stagger?: number;
  threshold?: number;
}

const ScrollFloat: React.FC<ScrollFloatProps> = ({
  children,
  triggerRef,
  containerClassName = '',
  textClassName = '',
  animationDuration = 1,
  ease = 'back.inOut(2)',
  stagger = 0.03,
  threshold = 0.01,
}) => {
  const containerRef = useRef<HTMLHeadingElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const hasPlayedRef = useRef(false);

  const splitText = useMemo(() => {
    const text = typeof children === 'string' ? children : '';
    return text.split('').map((char, index) => (
      <span className="inline-block word" key={index}>
        {char === ' ' ? '\u00A0' : char}
      </span>
    ));
  }, [children]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const charElements = el.querySelectorAll('.inline-block');

    // Set initial hidden state
    gsap.set(charElements, {
      opacity: 0,
      yPercent: 120,
      scaleY: 2.3,
      scaleX: 0.7,
      transformOrigin: '50% 0%',
    });

    const animateIn = () => {
      tweenRef.current?.kill();
      hasPlayedRef.current = true;
      tweenRef.current = gsap.to(charElements, {
        duration: animationDuration,
        ease,
        opacity: 1,
        yPercent: 0,
        scaleY: 1,
        scaleX: 1,
        stagger,
      });
    };

    const animateOut = () => {
      tweenRef.current?.kill();
      hasPlayedRef.current = false;
      tweenRef.current = gsap.to(charElements, {
        duration: animationDuration,
        ease,
        opacity: 0,
        yPercent: 120,
        scaleY: 2.3,
        scaleX: 0.7,
        stagger,
      });
    };

    const observeTarget = triggerRef?.current || el;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateIn();
          } else if (hasPlayedRef.current) {
            animateOut();
          }
        });
      },
      { threshold }
    );

    observer.observe(observeTarget);

    return () => {
      observer.disconnect();
      tweenRef.current?.kill();
    };
  }, [triggerRef, animationDuration, ease, stagger, threshold]);

  return (
    <h2 ref={containerRef} className={`my-5 overflow-hidden ${containerClassName}`}>
      <span className={`inline-block leading-[1.5] ${textClassName}`}>{splitText}</span>
    </h2>
  );
};

export default ScrollFloat;
