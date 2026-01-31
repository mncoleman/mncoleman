import DarkVeil from '@/components/ui/dark-veil';
import BrandKitClient from '@/components/brand-kit/BrandKitClient';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Brand Kit | Matthew Coleman',
    description: 'Official brand guidelines and assets for Matthew Coleman.',
};

export default function BrandKit() {
    return (
        <>
            {/* Dark Veil Background remains consistent with the rest of the site */}
            <DarkVeil hueShift={40} speed={0.5} resolutionScale={0.8} />

            <main className="min-h-screen py-16 px-4 relative z-10">
                <div className="max-w-5xl mx-auto">
                    <BrandKitClient />
                </div>
            </main>
        </>
    );
}
