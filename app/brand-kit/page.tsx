import { HomeBackdrop } from '@/components/home-backdrop';
import BrandKitClient from '@/components/brand-kit/BrandKitClient';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Brand Kit | Matthew Coleman',
    description: 'Official brand guidelines and assets for Matthew Coleman.',
};

export default function BrandKit() {
    return (
        <>
            {/* Same theme-aware backdrop as the home page: Dark Veil in dark, Waves in
                light. Rendering Dark Veil unconditionally (as this did) left light-mode
                text sitting invisibly on a dark backdrop. */}
            <HomeBackdrop />

            <main className="min-h-screen py-16 px-4 relative z-10">
                <div className="max-w-5xl mx-auto">
                    <BrandKitClient />
                </div>
            </main>
        </>
    );
}
