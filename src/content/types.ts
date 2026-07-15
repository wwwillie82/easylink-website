export type ContentStatus = 'draft' | 'published' | 'archived';

export type VideoConfig = { sourceType: 'media' | 'youtube'; mediaPath?: string; youtubeUrl?: string; poster?: string; autoplay: boolean; muted: boolean; loop: boolean; controls: boolean; preload: 'none' | 'metadata' | 'auto'; objectFit: 'cover' | 'contain'; aspectRatio: 'auto' | '16/9' | '4/3' | '1/1' | '9/16'; youtubeId?: string };

export type ContentBlock = {
  type: 'text' | 'feature-list' | 'list' | 'cards' | 'card-grid' | 'cta' | 'image-text' | 'faq' | 'ai-preview' | 'network-visual' | 'video' | string;
  blockKey?: string;
  title: string;
  body?: string;
  items?: Array<string | { title?: string; text?: string; url?: string; label?: string; secondaryLabel?: string; secondaryUrl?: string; eyebrow?: string; presentationRole?: string; role?: string; question?: string; answer?: string; image?: string; position?: 'left' | 'right'; [key: string]: unknown }>;
};

export type MediaPlaceholder = {
  path: string;
  alt: string;
  todo: string;
};

export type PublicContentItem = {
  title: string;
  slug: string;
  shortDescription: string;
  order: number;
  seoTitle: string;
  seoDescription: string;
  heroTitle: string;
  heroDescription: string;
  blocks: ContentBlock[];
  media: MediaPlaceholder;
  status: ContentStatus;
};
