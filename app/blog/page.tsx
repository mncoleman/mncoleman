import { getAllPosts, getAllTags } from '@/lib/blog';
import BlogPageClient from './BlogPageClient';

export const revalidate = 3600;

export default async function BlogPage() {
  const posts = await getAllPosts();
  const tags = await getAllTags();

  return <BlogPageClient initialPosts={posts} allTags={tags} />;
}
