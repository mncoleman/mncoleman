'use client';

import { TextType } from '@/components/ui/text-type';
import { BlurText } from '@/components/ui/blur-text';
import { ProfileCard } from '@/components/ui/profile-card';

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
        {/* Left Column - Text Content */}
        <div className="lg:col-span-2">
          <h1 className="text-4xl font-bold mb-8 tracking-tight">
            <TextType text="About Me" speed={80} />
          </h1>

          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <p className="text-lg text-muted-foreground mb-6">
              <BlurText
                text="Welcome! I'm Matthew Coleman, and this is my personal space on the web."
                duration={1200}
              />
            </p>

            <h2 className="text-2xl font-semibold mb-4 mt-8">
              <TextType text="What I Do" speed={80} />
            </h2>
            <p className="text-muted-foreground mb-4">
              <BlurText
                text="I'm passionate about technology, AI, and sometimes random information. This blog serves as a platform where I share my thoughts, experiences, and knowledge with whoever stumbles upon this super cool blog site."
                duration={1200}
              />
            </p>

            <h2 className="text-2xl font-semibold mb-4 mt-8">
              <TextType text="This Website" speed={80} />
            </h2>
            <p className="text-muted-foreground mb-4">
              <BlurText
                text="This site is built with modern web technologies including Next.js, React, TypeScript, and Tailwind CSS. It's hosted on GitHub Pages and features a blog powered by Notion for easy content management."
                duration={1200}
              />
            </p>
          </div>
        </div>

        {/* Right Column - Profile Card */}
        <div className="lg:col-span-1 flex items-start justify-center lg:justify-end">
          <ProfileCard
            name="Matthew Coleman"
            avatarUrl={`${process.env.NODE_ENV === 'production' ? '/matthew-coleman' : ''}/profile.jpg`}
            showUserInfo={true}
            enableTilt={true}
            enableMobileTilt={true}
            linkedinUrl="https://www.linkedin.com/in/matthew-coleman-15a66b233/"
            instagramUrl="https://www.instagram.com/mncoleman_/"
            xUrl="https://x.com/mtthwc003"
          />
        </div>
      </div>
    </div>
  );
}
