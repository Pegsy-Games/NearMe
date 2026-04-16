import { NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';

export async function POST(request) {
  if (!rateLimit(request, { limit: 100, windowMs: 60000 })) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
  }

  const body = await request.json();
  const { lat, lng } = body;

  if (lat == null || lng == null) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  const key = process.env.GOOGLE_API_KEY;

  // Build the Google Street View URL server-side so the API key never reaches the client
  const imageUri = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&fov=90&source=outdoor&key=${key}`;

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { source: { imageUri } },
          features: [{ type: 'LABEL_DETECTION', maxResults: 20 }]
        }]
      })
    }
  );
  const data = await res.json();
  return NextResponse.json(data);
}
