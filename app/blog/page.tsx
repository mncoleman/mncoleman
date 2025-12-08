import { getAllPosts, getAllTags } from '@/lib/blog';
import BlogList from '@/components/blog-list';

export const revalidate = 3600; // Revalidate every hour if using ISR, though GitHub Pages is static export

export default async function BlogPage() {
  const posts = await getAllPosts();
  const tags = await getAllTags();

  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8 tracking-tight">Blog</h1>

      {posts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-lg">
            No posts yet. Check back soon!
          </p>
        </div>
      ) : (
        <BlogList posts={posts} tags={tags} />
      )}
    </div>
  );
}
