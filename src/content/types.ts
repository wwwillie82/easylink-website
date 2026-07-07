export type ContentStatus = 'draft' | 'published' | 'archived';

export type ContentBlock = {
  type: 'text' | 'feature-list' | 'ai-preview' | 'network-visual';
  title: string;
  body?: string;
  items?: string[];
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
