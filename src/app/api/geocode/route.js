import { NextResponse } from 'next/server';
import { rateLimit } from '../rate-limit';

export async function GET(request) {
  if (!rateLimit(request, { limit: 200, windowMs: 60000 })) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  const key = process.env.GOOGLE_API_KEY;
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`
  );
  const data = await res.json();
  return NextResponse.json(data);
}
