import { getPublishedPosts, getPostBySlug as getPostFromFiles } from './posts';
import type { NotionPost } from './notion';

// Posts live in git (data/posts/*.md, see lib/posts.ts). The type keeps its
// historical name so app/blog/** is untouched.
export type Post = NotionPost;

export async function getAllPosts(): Promise<Post[]> {
  return getPublishedPosts();
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  return getPostFromFiles(slug);
}

export async function getAllTags(): Promise<string[]> {
  const posts = await getPublishedPosts();
  const tagsSet = new Set<string>();

  posts.forEach(post => {
    post.tags?.forEach(tag => tagsSet.add(tag));
  });

  return Array.from(tagsSet).sort();
}
