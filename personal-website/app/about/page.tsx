export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8 tracking-tight">About Me</h1>

      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p className="text-lg text-muted-foreground mb-6">
          Welcome! I'm Matthew Coleman, and this is my personal space on the web.
        </p>

        <h2 className="text-2xl font-semibold mb-4 mt-8">What I Do</h2>
        <p className="text-muted-foreground mb-4">
          I'm passionate about technology, AI, and sometimes random information. This blog serves as a
          platform where I share my thoughts, experiences, and knowledge with whoever stumbled upon this super cool blog site.
        </p>

        <h2 className="text-2xl font-semibold mb-4 mt-8">This Website</h2>
        <p className="text-muted-foreground mb-4">
          This site is built with modern web technologies including Next.js, React,
          TypeScript, and Tailwind CSS. It's hosted on GitHub Pages and features a
          blog powered by Notion for easy content management.
        </p>
      </div>
    </div>
  );
}
