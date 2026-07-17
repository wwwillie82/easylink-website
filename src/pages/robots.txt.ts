import { getPublicSiteSettings } from '@/lib/content/settings';

export const prerender = true;

export async function GET() {
  const settings = await getPublicSiteSettings();
  const body = settings.searchVisibility === 'indexable'
    ? 'User-agent: *\nAllow: /\n'
    : 'User-agent: *\nDisallow: /\nX-Robots-Tag: noindex, nofollow\n';
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
