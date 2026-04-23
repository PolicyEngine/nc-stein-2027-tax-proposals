import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://policyengine.org/us/nc-stein-2027-tax-proposals/sitemap.xml',
  };
}
