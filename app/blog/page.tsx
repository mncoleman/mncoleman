import { getAllPosts, getAllTags } from '@/lib/blog';
import { getDatabaseId } from '@/lib/notion';
import BlogPageClient from './BlogPageClient';

export const revalidate = 3600;

export default async function BlogListPage() {
  const posts = await getAllPosts();
  const tags = await getAllTags();
  const databaseId = getDatabaseId();

  return <BlogPageClient initialPosts={posts} allTags={tags} databaseId={databaseId} />;
}
