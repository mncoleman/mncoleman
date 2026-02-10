'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Palette,
    Type,
    Layout,
    Layers,
    Download,
    Copy,
    Check,
    Zap,
    Shield,
    Heart
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import DarkVeil from '@/components/ui/dark-veil';
import { BlurText } from '@/components/ui/blur-text';
import { FallInText } from '@/components/ui/fall-in-text';
import { TextType } from '@/components/ui/text-type';


export default function BrandKitClient() {
    const [copiedColor, setCopiedColor] = useState<string | null>(null);
    const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
    const [cursorPos, setCursorPos] = useState({ x: 50, y: 50 }); // percentage positions
    const cursorPreviewRef = useRef<HTMLDivElement>(null);
    const targetPosRef = useRef({ x: 50, y: 50 });
    const currentPosRef = useRef({ x: 50, y: 50 });

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopiedColor(label);
        setTimeout(() => setCopiedColor(null), 2000);
    };

    // Track global mouse movement for cursor preview with smooth lerping
    useEffect(() => {
        if (selectedComponent !== 'Custom Cursor' || !cursorPreviewRef.current) return;

        let animationFrameId: number;

        const handleMouseMove = (e: MouseEvent) => {
            const preview = cursorPreviewRef.current;
            if (!preview) return;

            const rect = preview.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            // Update target position with clamping
            targetPosRef.current = {
                x: Math.max(0, Math.min(100, x)),
                y: Math.max(0, Math.min(100, y))
            };
        };

        // Smooth animation loop
        const animate = () => {
            // Lerp current position towards target
            const lerpFactor = 0.15;
            currentPosRef.current.x += (targetPosRef.current.x - currentPosRef.current.x) * lerpFactor;
            currentPosRef.current.y += (targetPosRef.current.y - currentPosRef.current.y) * lerpFactor;

            setCursorPos({
                x: currentPosRef.current.x,
                y: currentPosRef.current.y
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        window.addEventListener('mousemove', handleMouseMove);
        animationFrameId = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, [selectedComponent]);

    const reactBitsComponents = [
        {
            name: 'Dark Veil',
            description: 'Dynamic animated background system.',
            file: '/components/ui/dark-veil.tsx',
            preview: 'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent animate-pulse'
        },
        {
            name: 'Custom Cursor',
            description: 'Smooth, directional interactive cursor.',
            file: '/components/ui/CustomCursor.tsx',
            preview: 'cursor-default'
        },
        {
            name: 'Blur Text',
            description: 'Sophisticated typography blur animation.',
            file: '/components/ui/blur-text.tsx',
            preview: 'blur-sm hover:blur-none transition-all'
        },
        {
            name: 'Fall In Text',
            description: 'Text entrance animation effect.',
            file: '/components/ui/fall-in-text.tsx',
            preview: 'animate-bounce'
        },
        {
            name: 'Text Type',
            description: 'Typewriter text animation.',
            file: '/components/ui/text-type.tsx',
            preview: 'font-mono'
        }
    ];

    const colors = [
        { name: 'Background', hsl: '0 0% 100%', hex: '#FFFFFF', usage: 'Light mode background' },
        { name: 'Foreground', hsl: '0 0% 3.9%', hex: '#0A0A0A', usage: 'Light mode text' },
        { name: 'Primary', hsl: '0 0% 9%', hex: '#171717', usage: 'Primary brand elements' },
        { name: 'Muted', hsl: '0 0% 96.1%', hex: '#F5F5F5', usage: 'Muted backgrounds' },
        { name: 'Border', hsl: '0 0% 89.8%', hex: '#E5E5E5', usage: 'Dividers and borders' },
        { name: 'Dark Background', hsl: '0 0% 3.9%', hex: '#0A0A0A', usage: 'Dark mode background' },
        { name: 'Dark Foreground', hsl: '0 0% 98%', hex: '#FAFAFA', usage: 'Dark mode text' },
        { name: 'Dark Secondary', hsl: '0 0% 14.9%', hex: '#262626', usage: 'Dark mode surfaces' },
    ];

    const typography = [
        { level: 'H1', class: 'text-4xl md:text-6xl font-black mb-4', sample: 'Matthew Coleman' },
        { level: 'H2', class: 'text-3xl md:text-4xl font-bold mb-3', sample: 'Personal Information Hub' },
        { level: 'H3', class: 'text-2xl md:text-3xl font-semibold mb-2', sample: 'Brand Guidelines' },
        { level: 'Body', class: 'text-base text-muted-foreground', sample: 'Transparent, minimalist, and functional.' },
    ];

    return (
        <div className="space-y-12">
            {/* Introduction */}
            <section className="text-center space-y-4 pt-8">
                <Badge variant="outline" className="px-4 py-1 border-primary/20 bg-primary/5 text-primary animate-pulse">
                    Design System v1.0
                </Badge>
                <h1 className="text-5xl md:text-7xl font-black tracking-tight bg-gradient-to-r from-primary via-primary/50 to-primary bg-clip-text text-transparent">
                    BRAND KIT
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto backdrop-blur-sm">
                    A collection of design assets and guidelines for the Matthew Coleman brand.
                    Minimalist, high-performance, and elegant.
                </p>
            </section>

            {/* Logo Section */}
            <Card className="border-border/40 bg-background/60 backdrop-blur-xl overflow-hidden group">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                            <Layers className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl">The Logo</CardTitle>
                            <CardDescription>Official "MC" monogram and typography.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="relative aspect-video rounded-2xl bg-black flex items-center justify-center border border-white/10 group/logo">
                            <div className="w-24 h-24 rounded-2xl bg-[#18181b] flex items-center justify-center text-4xl font-bold text-white border border-white/20 shadow-2xl transition-transform group-hover/logo:scale-110">
                                MC
                            </div>
                            <div className="absolute inset-x-0 bottom-4 text-center">
                                <span className="text-xs text-white/40 font-mono tracking-widest uppercase">Dark Version</span>
                            </div>
                        </div>
                        <div className="relative aspect-video rounded-2xl bg-white flex items-center justify-center border border-black/5 group/logo">
                            <div className="w-24 h-24 rounded-2xl bg-white flex items-center justify-center text-4xl font-bold text-black border border-black/10 shadow-xl transition-transform group-hover/logo:scale-110">
                                MC
                            </div>
                            <div className="absolute inset-x-0 bottom-4 text-center">
                                <span className="text-xs text-black/40 font-mono tracking-widest uppercase">Light Version</span>
                            </div>
                        </div>
                    </div>
                    <div className="mt-8 flex flex-wrap gap-4">
                        <Button className="rounded-full px-6 transition-all hover:scale-105" variant="secondary" asChild>
                            <a href="/icon.svg" download="mncoleman-logo.svg">
                                <Download className="mr-2 h-4 w-4" />
                                Download SVG
                            </a>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="colors" className="w-full">
                <TabsList className="grid w-full h-auto grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 bg-muted/50 p-1 rounded-2xl xl:rounded-full border border-border/40">
                    <TabsTrigger value="colors" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Palette className="h-4 w-4 mr-2" />
                        Colors
                    </TabsTrigger>
                    <TabsTrigger value="typography" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Type className="h-4 w-4 mr-2" />
                        Type
                    </TabsTrigger>
                    <TabsTrigger value="spacing" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Layout className="h-4 w-4 mr-2" />
                        System
                    </TabsTrigger>
                    <TabsTrigger value="ui-components" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Layers className="h-4 w-4 mr-2" />
                        UI Kit
                    </TabsTrigger>
                    <TabsTrigger value="react-bits" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Zap className="h-4 w-4 mr-2" />
                        Effects
                    </TabsTrigger>
                    <TabsTrigger value="values" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Heart className="h-4 w-4 mr-2" />
                        Values
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="colors" className="mt-8">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {colors.map((color) => (
                            <div key={color.name} className="group relative">
                                <div
                                    className="h-40 rounded-3xl border border-border shadow-inner transition-all group-hover:scale-[1.02] group-hover:shadow-lg cursor-pointer flex flex-col justify-end p-4 overflow-hidden"
                                    style={{ backgroundColor: color.hex }}
                                    onClick={() => copyToClipboard(color.hex, color.name)}
                                >
                                    <div className={`p-2 rounded-xl backdrop-blur-md flex items-center justify-between ${parseInt(color.hsl.split(' ')[2]) > 50 ? 'bg-black/5 text-black' : 'bg-white/5 text-white'}`}>
                                        <span className="text-xs font-mono font-medium">{color.hex}</span>
                                        {copiedColor === color.name ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-40" />}
                                    </div>
                                </div>
                                <div className="mt-3 px-1">
                                    <h4 className="font-bold text-sm">{color.name}</h4>
                                    <p className="text-xs text-muted-foreground">{color.usage}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="typography" className="mt-8">
                    <div className="space-y-6">
                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Font Stack</CardTitle>
                                <CardDescription>System font stack for optimal performance and native feel.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-4 rounded-xl bg-muted/50 border border-border/40">
                                    <code className="text-xs break-all">
                                        -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
                                        'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif
                                    </code>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    We use a system font stack that prioritizes native fonts for each platform, ensuring
                                    fast load times, excellent readability, and a familiar feel for users.
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Typography Scale</CardTitle>
                                <CardDescription>Hierarchical text styles for consistent visual rhythm.</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-8 space-y-10">
                                {typography.map((type) => (
                                    <div key={type.level} className="relative group">
                                        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-2 border-b border-border/20 pb-6 transition-colors group-hover:border-primary/20">
                                            <span className={type.class}>{type.sample}</span>
                                            <Badge variant="secondary" className="w-fit">{type.level}</Badge>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="spacing" className="mt-8">
                    <div className="grid md:grid-cols-2 gap-8">
                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Rounding</CardTitle>
                                <CardDescription>Bento-style corner radii.</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-wrap gap-6">
                                <div className="space-y-3">
                                    <div className="w-20 h-20 bg-primary/10 rounded-2xl border border-primary/20 flex items-center justify-center text-xs font-mono">1rem</div>
                                    <p className="text-center font-bold text-xs uppercase">Bento</p>
                                </div>
                                <div className="space-y-3">
                                    <div className="w-20 h-20 bg-primary/10 rounded-full border border-primary/20 flex items-center justify-center text-xs font-mono">Full</div>
                                    <p className="text-center font-bold text-xs uppercase">Pill</p>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Glassmorphism</CardTitle>
                                <CardDescription>The core design language.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl">
                                    <p className="text-sm italic opacity-80">"Design is not just what it looks like and feels like. Design is how it works."</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="ui-components" className="mt-8">
                    <div className="grid md:grid-cols-2 gap-6">
                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Shadcn UI</CardTitle>
                                <CardDescription>Core components built with Radix UI and Tailwind CSS.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant="outline">Button</Badge>
                                    <Badge variant="outline">Card</Badge>
                                    <Badge variant="outline">Badge</Badge>
                                    <Badge variant="outline">Tabs</Badge>
                                    <Badge variant="outline">Separator</Badge>
                                    <Badge variant="outline">Tooltip</Badge>
                                    <Badge variant="outline">Dialog</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    We use Shadcn UI for its accessibility, reliability, and ease of customization. It provides the foundational building blocks for our interface.
                                </p>
                                <Button variant="link" className="px-0 text-primary" asChild>
                                    <a href="https://ui.shadcn.com" target="_blank" rel="noopener noreferrer">shadcn/ui documentation →</a>
                                </Button>
                            </CardContent>
                        </Card>
                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Component Preview</CardTitle>
                                <CardDescription>Live look at our base components.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <Button size="sm">Primary</Button>
                                    <Button size="sm" variant="secondary">Secondary</Button>
                                    <Button size="sm" variant="outline">Outline</Button>
                                </div>
                                <Separator />
                                <div className="flex items-center gap-4">
                                    <Badge>Default</Badge>
                                    <Badge variant="secondary">Secondary</Badge>
                                    <Badge variant="outline">Outline</Badge>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="react-bits" className="mt-8">
                    <div className="grid md:grid-cols-2 gap-6">
                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>React Bits Components</CardTitle>
                                <CardDescription>Click a component to view details and preview.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-3">
                                    {reactBitsComponents.map((component) => (
                                        <button
                                            key={component.name}
                                            onClick={() => setSelectedComponent(component.name)}
                                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer text-left ${selectedComponent === component.name
                                                ? 'bg-primary/10 border-primary/30 ring-2 ring-primary/20'
                                                : 'bg-primary/5 border-primary/10 hover:bg-primary/8 hover:border-primary/20'
                                                }`}
                                        >
                                            <div className="bg-primary/10 p-2 rounded-lg">
                                                <Zap className="h-4 w-4 text-primary" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-bold">{component.name}</p>
                                                <p className="text-xs text-muted-foreground">{component.description}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <Separator />
                                <Button variant="link" className="px-0 text-primary" asChild>
                                    <a href="https://www.reactbits.dev" target="_blank" rel="noopener noreferrer">
                                        React Bits documentation →
                                    </a>
                                </Button>
                            </CardContent>
                        </Card>
                        <Card className={`border-border/40 overflow-hidden ${selectedComponent === 'Dark Veil' ? 'bg-transparent shadow-none border-none' : 'bg-background/60 backdrop-blur-xl'}`}>
                            <CardHeader>
                                <CardTitle>
                                    {selectedComponent || 'Component Preview'}
                                </CardTitle>
                                <CardDescription>
                                    {selectedComponent
                                        ? reactBitsComponents.find(c => c.name === selectedComponent)?.description
                                        : 'Select a component to see it in action'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {selectedComponent ? (
                                    <>
                                        <div className="relative h-32 rounded-xl overflow-hidden border border-border/40 bg-transparent">
                                            {selectedComponent === 'Dark Veil' && (
                                                <div className="relative w-full h-full" />
                                            )}
                                            {selectedComponent === 'Custom Cursor' && (
                                                <div
                                                    ref={cursorPreviewRef}
                                                    className="relative flex items-center justify-center h-full bg-muted/30"
                                                >
                                                    <div className="absolute inset-0 overflow-hidden">
                                                        <div
                                                            className="cursor-demo-dot"
                                                            style={{
                                                                left: `${cursorPos.x}%`,
                                                                top: `${cursorPos.y}%`,
                                                            }}
                                                        />
                                                        <div
                                                            className="cursor-demo-ring"
                                                            style={{
                                                                left: `${cursorPos.x}%`,
                                                                top: `${cursorPos.y}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <p className="text-xs text-muted-foreground z-10 pointer-events-none">
                                                        Move your cursor to interact
                                                    </p>
                                                    <style jsx>{`
                                                        .cursor-demo-dot {
                                                            position: absolute;
                                                            width: 8px;
                                                            height: 8px;
                                                            background: hsl(var(--primary));
                                                            border-radius: 50%;
                                                            pointer-events: none;
                                                            transform: translate(-50%, -50%);
                                                            z-index: 20;
                                                        }
                                                        .cursor-demo-ring {
                                                            position: absolute;
                                                            width: 32px;
                                                            height: 32px;
                                                            border: 2px solid hsl(var(--primary));
                                                            border-radius: 50%;
                                                            pointer-events: none;
                                                            transform: translate(-50%, -50%);
                                                            opacity: 0.6;
                                                        }
                                                    `}</style>
                                                </div>
                                            )}
                                            {selectedComponent === 'Blur Text' && (
                                                <div className="flex items-center justify-center h-full">
                                                    <BlurText
                                                        text="Blur Text Effect"
                                                        className="text-xl font-bold"
                                                        key={Date.now()}
                                                    />
                                                </div>
                                            )}
                                            {selectedComponent === 'Fall In Text' && (
                                                <div className="flex items-center justify-center h-full">
                                                    <FallInText
                                                        text="Fall In Effect"
                                                        className="text-xl font-bold"
                                                        key={Date.now()}
                                                    />
                                                </div>
                                            )}
                                            {selectedComponent === 'Text Type' && (
                                                <div className="flex items-center justify-center h-full">
                                                    <TextType
                                                        text="Typewriter Effect..."
                                                        className="text-lg font-mono"
                                                        speed={80}
                                                        key={Date.now()}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <Separator />
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                Component Path
                                            </p>
                                            <code className="text-xs bg-muted/50 px-3 py-2 rounded-lg block border border-border/40">
                                                {reactBitsComponents.find(c => c.name === selectedComponent)?.file}
                                            </code>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full"
                                            asChild
                                        >
                                            <a
                                                href={`https://github.com/mncoleman/mncoleman/blob/main${reactBitsComponents.find(c => c.name === selectedComponent)?.file}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                View on GitHub →
                                            </a>
                                        </Button>
                                    </>
                                ) : (
                                    <div className="h-48 flex flex-col items-center justify-center text-center space-y-3 opacity-50">
                                        <Zap className="h-12 w-12 text-primary animate-pulse" />
                                        <div>
                                            <h4 className="text-lg font-bold mb-1">Interactive Preview</h4>
                                            <p className="text-sm text-muted-foreground">
                                                Click a component to see it animate
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="values" className="mt-8">
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="p-8 rounded-3xl bg-primary/5 border border-primary/10 space-y-4 hover:bg-primary/10 transition-colors">
                            <Zap className="h-8 w-8 text-primary" />
                            <h3 className="text-xl font-bold">Performance</h3>
                            <p className="text-sm text-muted-foreground">Every interaction should be instant. No unnecessary bloat, minimal dependencies.</p>
                        </div>
                        <div className="p-8 rounded-3xl bg-primary/5 border border-primary/10 space-y-4 hover:bg-primary/10 transition-colors">
                            <Shield className="h-8 w-8 text-primary" />
                            <h3 className="text-xl font-bold">Consistency</h3>
                            <p className="text-sm text-muted-foreground">Predictable layouts and components that follow a strict design system.</p>
                        </div>
                        <div className="p-8 rounded-3xl bg-primary/5 border border-primary/10 space-y-4 hover:bg-primary/10 transition-colors">
                            <Heart className="h-8 w-8 text-primary" />
                            <h3 className="text-xl font-bold">Innovation</h3>
                            <p className="text-sm text-muted-foreground">Pushing boundaries with AI-assisted development and modern web tech.</p>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
