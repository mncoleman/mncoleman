'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Post } from '@/lib/blog';

interface BlogListProps {
  posts: Post[];
  tags: string[];
}

export default function BlogList({ posts, tags }: BlogListProps) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const filteredPosts = selectedTag
    ? posts.filter(post => post.tags?.includes(selectedTag))
    : posts;

  return (
    <>
      {/* Tag Filter */}
      {tags.length > 0 && (
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedTag === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              All Posts
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedTag === tag
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Posts List */}
      {filteredPosts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-lg">
            No posts found{selectedTag ? ` with tag "${selectedTag}"` : ''}.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {filteredPosts.map((post) => (
            <article key={post.slug} className="border-b pb-8 last:border-0">
              <Link href={`/blog/${post.slug}`} className="group">
                <div className="flex items-start gap-3 mb-3">
                  <h2 className="text-2xl font-semibold group-hover:text-muted-foreground transition-colors flex-1">
                    {post.title}
                  </h2>
                  {post.featured && (
                    <span className="px-2 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded text-xs font-medium whitespace-nowrap">
                      Featured
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mb-3 text-lg">{post.excerpt}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <time>
                    {post.date.split('T')[0]}
                  </time>
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex gap-2">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
