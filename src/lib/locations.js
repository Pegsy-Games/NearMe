import { CONFIG } from './config';
import { generateRandomPointNearby, getCoordinateHash } from './geo';
import { checkStreetViewCoverage, getStreetName, analyzeImageQuality } from './api';
import { fetchFromSupabase, saveToSupabase } from './supabase';

async function processPoint(point, hash) {
  try {
    const meta = await checkStreetViewCoverage(point.lat, point.lng);
    if (meta.status !== 'OK') return null;

    const streetName = await getStreetName(point.lat, point.lng);
    if (!streetName) return null;

    const imageUrl = `/api/streetview-image?lat=${point.lat}&lng=${point.lng}`;
    const visionResult = await analyzeImageQuality(point.lat, point.lng);

    if (!visionResult.accept) {
      console.log(`\u2717 ${streetName} — score ${visionResult.score} (${visionResult.reason})`);
      return null;
    }

    console.log(`\u2713 ${streetName} — score ${visionResult.score} (${visionResult.reason})`);
    return {
      coordinate_hash:   hash,
      location_name:     streetName,
      latitude:          point.lat,
      longitude:         point.lng,
      image_url:         imageUrl,
      quality_score:     visionResult.score,
      vision_labels:     visionResult.labels,
      quality_flag:      'good',
      familiarity_score: 5,
      times_used:        0,
      types:             'random_street_view',
    };
  } catch (err) {
    console.warn('Point skipped (error):', err.message);
    return null;
  }
}

function bandsForRadius(radiusMeters) {
  return [
    { minDist: 0.10 * radiusMeters, maxDist: 0.30 * radiusMeters, count: 20 },
    { minDist: 0.30 * radiusMeters, maxDist: 0.50 * radiusMeters, count: 20 },
    { minDist: 0.50 * radiusMeters, maxDist: 0.70 * radiusMeters, count: 30 },
    { minDist: 0.70 * radiusMeters, maxDist: 0.90 * radiusMeters, count: 30 },
  ];
}

/**
 * Fetch cached locations or generate new ones.
 * @param {number} lat
 * @param {number} lng
 * @param {function} onProgress - callback(percent, text) for UI updates
 * @param {number} [radiusMeters] - search radius in metres; defaults to CONFIG.radius
 */
export async function getPointsForCoordinate(lat, lng, onProgress = () => {}, radiusMeters = CONFIG.radius) {
  const hash = getCoordinateHash(lat, lng, radiusMeters);

  onProgress(10, 'Checking for cached locations...');

  const cached = await fetchFromSupabase(hash);
  if (cached.length >= CONFIG.minCachedLocations) {
    onProgress(30, `Found ${cached.length} cached locations!`);
    console.log('Cache HIT:', hash, cached.length, 'rows');
    return cached;
  }

  console.log('Cache MISS:', hash, 'radius', radiusMeters);
  onProgress(15, 'Finding places to explore...');

  const bands = bandsForRadius(radiusMeters);
  const randomPoints = bands.flatMap(b =>
    Array.from({ length: b.count }, () =>
      generateRandomPointNearby(lat, lng, b.minDist, b.maxDist)
    )
  );

  const totalBatches   = Math.ceil(randomPoints.length / CONFIG.batchSize);
  const validLocations = [];
  let processed        = 0;

  onProgress(20, 'Checking what we can find...');

  for (let i = 0; i < randomPoints.length; i += CONFIG.batchSize) {
    if (validLocations.length >= CONFIG.targetLocations) {
      console.log(`Reached target of ${CONFIG.targetLocations} — stopping early.`);
      break;
    }

    const batchNum = Math.floor(i / CONFIG.batchSize) + 1;
    const batch    = randomPoints.slice(i, i + CONFIG.batchSize);

    const results = await Promise.all(batch.map(p => processPoint(p, hash)));
    validLocations.push(...results.filter(r => r !== null));
    processed += batch.length;

    onProgress(
      20 + (processed / randomPoints.length) * 38,
      `Checking ${batchNum}/${totalBatches} — ${validLocations.length} places so far`
    );
  }

  onProgress(62, `Found ${validLocations.length} places`);

  if (!validLocations.length) {
    return [];
  }

  onProgress(72, 'Saving what we found...');
  const saved = await saveToSupabase(validLocations);
  onProgress(82, 'Saved!');
  return saved;
}
