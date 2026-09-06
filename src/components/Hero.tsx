import { motion } from 'framer-motion';
import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function Hero({ isLight, isLoading }: { isLight?: boolean; isLoading?: boolean }) {
  const strokeColor = isLight ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)';
  const firstNameRef = useRef<HTMLHeadingElement>(null);
  const lastNameRef = useRef<HTMLHeadingElement>(null);
  const firstNameInnerRef = useRef<HTMLSpanElement>(null);
  const lastNameInnerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#main-scroll-container',
        start: 'top top',
        end: '+=100%', // Animate quickly as we scroll past the first screen (Hero section)
        scrub: 1,
      }
    });

    // Exit continues the same diagonal each name arrived from — reads as driving back
    // out the way it came in, rather than just sliding sideways.
    if (firstNameRef.current) {
      tl.to(firstNameRef.current, { x: -1500, y: -800, ease: 'power1.inOut' }, 0);
    }
    if (lastNameRef.current) {
      tl.to(lastNameRef.current, { x: 1500, y: 800, ease: 'power1.inOut' }, 0);
    }

    return () => {
      tl.kill();
      tl.scrollTrigger?.kill();
    };
  }, []);

  // First name drives in from the top-left corner, last name from the bottom-right —
  // a straight positional slide with hard deceleration (no scale/blur morph), so it
  // reads like a car arriving and braking to a stop rather than materializing in place.
  useLayoutEffect(() => {
    if (isLoading) return;

    const anims: gsap.core.Tween[] = [];

    if (firstNameInnerRef.current) {
      anims.push(
        gsap.fromTo(firstNameInnerRef.current,
          { x: -window.innerWidth, y: -window.innerHeight * 0.6 },
          {
            x: 0,
            y: 0,
            duration: 1.3,
            delay: 2, // arrives first, 2s after the home section is reached
            ease: 'power4.out',
          }
        )
      );
    }

    if (lastNameInnerRef.current) {
      anims.push(
        gsap.fromTo(lastNameInnerRef.current,
          { x: window.innerWidth, y: window.innerHeight * 0.6 },
          {
            x: 0,
            y: 0,
            duration: 1.3,
            delay: 2.6, // arrives after the first name
            ease: 'power4.out',
          }
        )
      );
    }

    return () => {
      anims.forEach(anim => anim.kill());
    };
  }, [isLoading]);
  
  return (
    <section className="relative w-full h-full pointer-events-none z-10">
      <motion.div
        initial={{ opacity: 0 }}
        animate={!isLoading ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 1 }}
        className="w-full h-full"
      >
        {/* Top Left First Name (Outline) */}
        <h1
          ref={firstNameRef}
          className="absolute top-10 md:top-14 left-8 md:left-24 text-[64px] md:text-[140px] lg:text-[176px] tracking-normal leading-none text-transparent z-20"
          style={{ WebkitTextStroke: `2px ${strokeColor}`, fontFamily: '"Pacifico", cursive' }}
        >
          <span ref={firstNameInnerRef} className="inline-block origin-center select-none">
            Krishan
          </span>
        </h1>

        {/* Bottom Right Last Name (Filled) */}
        <h1
          ref={lastNameRef}
          className={`absolute bottom-10 md:bottom-14 right-8 md:right-24 text-[64px] md:text-[140px] lg:text-[176px] tracking-normal leading-none z-20 ${isLight ? 'text-black drop-shadow-[0_4px_20px_rgba(0,0,0,0.1)]' : 'text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]'}`}
          style={{ fontFamily: '"Pacifico", cursive' }}
        >
          <span ref={lastNameInnerRef} className="inline-block origin-center select-none">
            Murari
          </span>
        </h1>
      </motion.div>
    </section>
  );
}

