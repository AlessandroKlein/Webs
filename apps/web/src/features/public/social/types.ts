export interface MediaItem {
  url: string;
  type?: string;
  caption?: string;
}

export interface PollOption {
  id: string;
  label: string;
}

export interface PollVote {
  id: string;
  pollId: string;
  userId: string;
  optionId: string;
}

export interface SocialPoll {
  id: string;
  postId: string;
  question: string;
  options: PollOption[];
  endsAt: string | null;
  votes?: PollVote[];
}

export interface LinkPreview {
  url?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

export interface SocialPost {
  id: string;
  author: string;
  text: string;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaUrls?: MediaItem[];
  visibility?: string;
  preview?: LinkPreview | null;
  likes: number;
  createdAt: string;
}

/** Galería derivada: mediaUrls[] (nuevo) o, por retrocompat, mediaUrl único. */
export function postMedia(post: SocialPost): MediaItem[] {
  if (Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0) {
    return post.mediaUrls.filter((m) => typeof m?.url === 'string' && m.url.length > 0);
  }
  if (post.mediaUrl) {
    return [{ url: post.mediaUrl, type: post.mediaType === 'video' ? 'video' : 'image' }];
  }
  return [];
}
