import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getAllPosts } from '@/lib/blog';
import DarkVeil from '@/components/ui/dark-veil';

export default async function Home() {
  const posts = await getAllPosts();
  const recentPosts = posts.slice(0, 3);

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 -z-10">
        <DarkVeil />
      </div>
      <div className="container mx-auto px-4 py-16 max-w-4xl relative z-10">
      <section className="mb-20">
        <h1 className="text-4xl font-bold mb-4 tracking-tight">
          Hi, I'm Matthew Coleman
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl">
          Welcome to my personal website. I write about technology, software development,
          and other topics that interest me.
        </p>
        <div className="flex gap-4">
          <Link
            href="/blog"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-10 py-2 px-4"
          >
            Read the blog
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <Link
            href="/about"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background border border-input hover:bg-accent hover:text-accent-foreground h-10 py-2 px-4"
          >
            About me
          </Link>
        </div>
      </section>

      {recentPosts.length > 0 && (
        <section>
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold tracking-tight">Recent Posts</h2>
            <Link
              href="/blog"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center"
            >
              View all posts
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-6">
            {recentPosts.map((post) => (
              <article key={post.slug} className="border-b pb-6 last:border-0">
                <Link href={`/blog/${post.slug}`} className="group">
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-muted-foreground transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-muted-foreground mb-2">{post.excerpt}</p>
                  <time className="text-sm text-muted-foreground">
                    {new Date(post.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </time>
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}
