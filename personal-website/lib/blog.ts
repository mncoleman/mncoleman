import { getPublishedPosts, getPostBySlug as getNotionPostBySlug, NotionPost } from './notion';

export type Post = NotionPost;

export async function getAllPosts(): Promise<Post[]> {
  const posts = await getPublishedPosts();
  return posts;
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  return await getNotionPostBySlug(slug);
}
