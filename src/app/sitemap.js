const BASE = 'https://nearme.pegsy.uk';

export default function sitemap() {
  const now = new Date();
  return [
    { url: `${BASE}/`,                   lastModified: now, changeFrequency: 'monthly', priority: 1.0 },
    { url: `${BASE}/multiplayer`,        lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/multiplayer/host`,   lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/multiplayer/join`,   lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ];
}
