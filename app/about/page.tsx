'use client';

import { FallInText } from '@/components/ui/fall-in-text';
import { TextType } from '@/components/ui/text-type';
import { BlurText } from '@/components/ui/blur-text';
import { ProfileCard } from '@/components/ui/profile-card';
import { User, Cpu, Code2, Sparkles } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-6xl">
      <header className="mb-12 text-center text-balance">
        <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
          <FallInText text="About Me" duration={800} className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60" />
        </h1>
        <div className="h-1 w-20 bg-primary/20 mx-auto rounded-full" />
      </header>

      <div className="space-y-8 lg:space-y-0">
        {/* On mobile: stack everything, On desktop: bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Intro Card - Wide */}
          <div className="md:col-span-2 p-8 rounded-3xl border border-border/50 bg-background/50 backdrop-blur-sm shadow-sm hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 relative overflow-hidden group">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-2xl font-bold tracking-tight">
                  <TextType text="Introduction" speed={80} />
                </h2>
              </div>
              <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl">
                <BlurText
                  text="Welcome! I'm Matthew Coleman, and this is my small corner of the internet. You'll find a collection of my thoughts, projects, and experiences here. I hope you enjoy your stay!"
                  duration={1200}
                />
              </p>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1">
              <div className="h-full w-0 bg-primary group-hover:w-full transition-all duration-500 mx-auto" />
            </div>
          </div>

          {/* Profile Card - Hidden on mobile, shown on desktop in bento grid */}
          <div className="hidden lg:flex lg:row-span-2 items-start justify-center">
            <ProfileCard
              name="Matthew Coleman"
              avatarUrl="/profile.jpg"
              showUserInfo={true}
              enableTilt={true}
              enableMobileTilt={true}
              linkedinUrl="https://www.linkedin.com/in/matthew-coleman-15a66b233/"
              instagramUrl="https://www.instagram.com/mncoleman_/"
              xUrl="https://x.com/mtthwc003"
              githubUrl="https://github.com/mncoleman"
              className="w-full"
            />
          </div>

          {/* What I Do Card */}
          <div className="p-8 rounded-3xl border border-border/50 bg-background/50 backdrop-blur-sm shadow-sm hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 relative overflow-hidden group">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Cpu size={24} />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                <TextType text="What I Do" speed={80} />
              </h2>
            </div>
            <div className="text-muted-foreground leading-relaxed">
              <BlurText
                text="I'm deeply passionate about technology, AI, and exploring the vast world of digital possibilities. This site serves as my platform to share thoughts, experiences, and technical knowledge."
                duration={1200}
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1">
              <div className="h-full w-0 bg-primary group-hover:w-full transition-all duration-500 mx-auto" />
            </div>
          </div>

          {/* This Website Card */}
          <div className="p-8 rounded-3xl border border-border/50 bg-background/50 backdrop-blur-sm shadow-sm hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 relative overflow-hidden group">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Code2 size={24} />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                <TextType text="This Website" speed={80} />
              </h2>
            </div>
            <div className="text-muted-foreground leading-relaxed">
              <BlurText
                text="Built primarily with AI (Claude Sonnet 4.5), this site reflects my interest in rapid development. It's hosted on GitHub Pages and powered by a custom Notion integration for content management."
                duration={1200}
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1">
              <div className="h-full w-0 bg-primary group-hover:w-full transition-all duration-500 mx-auto" />
            </div>
          </div>
        </div>

        {/* Profile Card - Centered Below on Mobile Only */}
        <div className="flex justify-center pt-8 lg:hidden">
          <ProfileCard
            name="Matthew Coleman"
            avatarUrl="/profile.jpg"
            showUserInfo={true}
            enableTilt={true}
            enableMobileTilt={true}
            linkedinUrl="https://www.linkedin.com/in/matthew-coleman-15a66b233/"
            instagramUrl="https://www.instagram.com/mncoleman_/"
            xUrl="https://x.com/mtthwc003"
            githubUrl="https://github.com/mncoleman"
          />
        </div>
      </div>
    </div>
  );
}
