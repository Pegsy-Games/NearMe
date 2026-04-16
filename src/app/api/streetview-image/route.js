import { NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';

export async function GET(request) {
  if (!rateLimit(request, { limit: 200, windowMs: 60000 })) {
    return new NextResponse('Rate limited', { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const lat  = searchParams.get('lat');
  const lng  = searchParams.get('lng');
  const size = searchParams.get('size') || '600x400';
  const fov  = searchParams.get('fov') || '90';

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  const key = process.env.GOOGLE_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${lat},${lng}&fov=${fov}&source=outdoor&key=${key}`;

  const res = await fetch(url);
  const buffer = await res.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
