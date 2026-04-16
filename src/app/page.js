'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// ────────────────────────────────────────────────────────────
// NearMe v0.4.0 — Next.js migration
//
// CHANGES FROM v0.3.0:
//   [SEC]  Google API calls proxied through server-side API routes
//   [SEC]  Rate limiting on all API routes
//   [ARCH] Migrated to Next.js (App Router)
//   [ARCH] Proper environment variable handling via .env.local
//   [ARCH] Street View image URLs no longer embed API key
// ────────────────────────────────────────────────────────────

// Supabase (anon key is public — RLS controls access)
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CONFIG = {
  radius:             500,
  questionsPerGame:   10,
  minCachedLocations: 40,
  batchSize:          8,
  targetLocations:    50,
};

const VISION_CONFIG = {
  enabled:          true,
  minScoreToAccept: 3,
  tier2ForScore7:   3,
  tier2ForScore5:   2,

  tier1Features: [
    'lamp post','street light','light fixture',
    'post box','mailbox','letter box',
    'house number','building number',
    'street sign','traffic sign','road sign',
    'roundabout','traffic circle',
    'bus stop','bus shelter',
    'fire hydrant',
    'bollard','traffic bollard',
    'telephone box','phone box',
  ],

  tier2Features: [
    'utility pole','telegraph pole','power line',
    'fence','gate','railing',
    'wall','brick wall','stone wall','flint wall',
    'sidewalk','pavement','footpath',
    'curb','kerb',
    'road surface','asphalt',
    'driveway','parking',
    'pedestrian crossing','zebra crossing',
    'brick','brickwork',
    'stone','stonework','flint',
    'chimney',
    'roof','roofing',
    'window','door',
    'garage','garage door',
    'bench','park bench',
    'street furniture',
    'bin','litter bin',
  ],
};

// ── Geo utilities ──────────────────────────────────────────

function generateRandomPointNearby(cLat, cLng, minDist, maxDist) {
  const angle = Math.random() * 2 * Math.PI;
  const dist  = minDist + Math.random() * (maxDist - minDist);
  const R     = 6371000;
  const lat1  = cLat * Math.PI / 180;
  const lng1  = cLng * Math.PI / 180;
  const lat2  = Math.asin(
    Math.sin(lat1) * Math.cos(dist / R) +
    Math.cos(lat1) * Math.sin(dist / R) * Math.cos(angle)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(angle) * Math.sin(dist / R) * Math.cos(lat1),
    Math.cos(dist / R) - Math.sin(lat1) * Math.sin(lat2)
  );
  return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R     = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLon  = toRad(lon2 - lon1);
  const a     =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCoordinateHash(lat, lng, radius) {
  return `${lat.toFixed(4)}_${lng.toFixed(4)}_${radius}`;
}

// ── API calls (now proxied through our server) ─────────────

async function checkStreetViewCoverage(lat, lng) {
  const res = await fetch(`/api/streetview-meta?lat=${lat}&lng=${lng}`);
  return res.json();
}

function isValidLocationName(name) {
  if (!name || name === 'Street View') return false;
  const t = name.trim();
  if (/^\d+$/.test(t))        return false;
  if (/^\d/.test(t))           return false;
  if (/\b[A-Z]\d+\b/.test(t)) return false;
  if (t.length < 3)            return false;
  if (t.replace(/\s/g,'').length < 3) return false;
  if (!/[a-zA-Z]/.test(t))    return false;
  return true;
}

async function getStreetName(lat, lng) {
  const res  = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
  const data = await res.json();

  if (data.status !== 'OK' || !data.results?.length) return null;

  const parts = data.results[0].address_components;
  const route = parts.find(c => c.types.includes('route'));
  if (route && isValidLocationName(route.long_name)) return route.long_name;

  const hood = parts.find(c => c.types.includes('neighborhood'));
  if (hood && isValidLocationName(hood.long_name)) return hood.long_name;

  const first = data.results[0].formatted_address.split(',')[0];
  if (
    isValidLocationName(first) &&
    /\b(Road|Street|Avenue|Lane|Drive|Close|Way|Court|Place|Crescent|Gardens|Rise|Grove|Terrace|Hill|Walk)\b/i.test(first)
  ) return first;

  return null;
}

async function analyzeImageQuality(lat, lng) {
  if (!VISION_CONFIG.enabled) return { accept: true, score: 5, reason: 'Disabled' };

  try {
    const res  = await fetch('/api/vision', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ lat, lng }),
    });
    const data = await res.json();

    if (!data.responses?.[0]?.labelAnnotations) {
      return { accept: false, score: 0, reason: 'No labels', labels: '' };
    }

    const labels = data.responses[0].labelAnnotations.map(l => l.description.toLowerCase());

    const tier1 = VISION_CONFIG.tier1Features.filter(f =>
      labels.some(l => l.includes(f) || f.includes(l))
    );
    if (tier1.length) {
      return { accept: true, score: 10, reason: `Tier1: ${tier1[0]}`, labels: labels.join(',') };
    }

    const tier2 = VISION_CONFIG.tier2Features.filter(f =>
      labels.some(l => l.includes(f) || f.includes(l))
    );
    const score =
      tier2.length >= VISION_CONFIG.tier2ForScore7 ? 7 :
      tier2.length >= VISION_CONFIG.tier2ForScore5 ? 5 :
      tier2.length >= 1                            ? 3 : 0;
    const reason = score > 0 ? `${tier2.length} Tier2 feature(s)` : 'No usable features';

    return { accept: score >= VISION_CONFIG.minScoreToAccept, score, reason, labels: labels.join(',') };

  } catch (err) {
    console.warn('Vision API error — accepting by default:', err);
    return { accept: true, score: 5, reason: 'Vision error (fail open)', labels: '' };
  }
}

// ── Supabase data layer ────────────────────────────────────

async function fetchFromSupabase(hash) {
  const { data, error } = await db
    .from('location_library')
    .select('*')
    .eq('coordinate_hash', hash);
  if (error) { console.error('Supabase fetch error:', error); return []; }
  return data || [];
}

async function saveToSupabase(locations) {
  const { data, error } = await db
    .from('location_library')
    .insert(locations)
    .select();
  if (error) throw new Error(`Database save failed: ${error.message}`);
  return data || [];
}

// ── Point processing ───────────────────────────────────────

async function processPoint(point, hash) {
  try {
    const meta = await checkStreetViewCoverage(point.lat, point.lng);
    if (meta.status !== 'OK') return null;

    const streetName = await getStreetName(point.lat, point.lng);
    if (!streetName) return null;

    // Image URL uses our proxy — no API key exposed to client
    const imageUrl = `/api/streetview-image?lat=${point.lat}&lng=${point.lng}`;

    // Vision analysis goes through our server-side proxy (lat/lng, not URL)
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

// ── Question generation ────────────────────────────────────

function generateQuestions(locationRecords, userLat, userLng) {
  const places = locationRecords
    .filter(r => r.latitude && r.longitude)
    .map(r => ({
      id:        r.id,
      name:      r.location_name,
      image_url: r.image_url,
      latitude:  r.latitude,
      longitude: r.longitude,
      distance:  Math.round(haversineDistance(userLat, userLng, r.latitude, r.longitude)),
    }))
    .filter(p => p.distance > 0 && p.distance <= CONFIG.radius);

  const questions = [];
  const usedIds   = new Set();

  for (let attempt = 0; attempt < 100 && questions.length < CONFIG.questionsPerGame; attempt++) {
    const available = places.filter(p => !usedIds.has(p.id));
    if (!available.length) break;

    const correct   = available[Math.floor(Math.random() * available.length)];
    const minDist   = correct.distance * 0.5;
    const maxDist   = correct.distance * 1.5;
    const usedNames = new Set([correct.name]);

    const decoys = [];
    const pool   = places
      .filter(p =>
        p.distance >= minDist && p.distance <= maxDist &&
        p.id !== correct.id && !usedIds.has(p.id)
      )
      .sort(() => Math.random() - 0.5);

    for (const c of pool) {
      if (!usedNames.has(c.name)) {
        decoys.push(c);
        usedNames.add(c.name);
      }
      if (decoys.length === 3) break;
    }

    if (decoys.length < 3) continue;

    const options = [
      { name: correct.name, distance: correct.distance, isCorrect: true },
      ...decoys.map(d => ({ name: d.name, distance: d.distance, isCorrect: false })),
    ].sort(() => Math.random() - 0.5);

    questions.push({
      question_number: questions.length + 1,
      image_url:       correct.image_url,
      options,
    });

    usedIds.add(correct.id);
    decoys.forEach(d => usedIds.add(d.id));
  }

  console.log(`Generated ${questions.length} questions from ${places.length} locations`);
  return questions;
}

// ── React component ────────────────────────────────────────

export default function NearMe() {
  const [screen, setScreen]         = useState('start');    // start | loading | game | results | error
  const [errorMsg, setErrorMsg]     = useState('');
  const [progress, setProgress]     = useState(0);
  const [loadingText, setLoadingText] = useState('Initialising...');
  const [address, setAddress]       = useState('');
  const [startBtnEnabled, setStartBtnEnabled] = useState(false);

  // Game state
  const [questions, setQuestions]           = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore]                   = useState(0);
  const [answered, setAnswered]             = useState(false);
  const [selectedIdx, setSelectedIdx]       = useState(-1);
  const [correctIdx, setCorrectIdx]         = useState(-1);
  const [nextEnabled, setNextEnabled]       = useState(false);

  const selectedPlaceRef = useRef(null);
  const addressInputRef  = useRef(null);

  // Initialise Google Places Autocomplete
  useEffect(() => {
    if (typeof google === 'undefined') return;

    const autocomplete = new google.maps.places.Autocomplete(addressInputRef.current);
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const valid = !!(place && place.geometry);
      selectedPlaceRef.current = valid ? place : null;
      setStartBtnEnabled(valid);
      if (!valid) alert('Please select a valid address from the suggestions');
    });
  }, []);

  function updateProgress(pct, text) {
    setProgress(pct);
    setLoadingText(text);
  }

  async function getPointsForCoordinate(lat, lng) {
    const hash = getCoordinateHash(lat, lng, CONFIG.radius);

    updateProgress(10, 'Checking for cached locations...');

    const cached = await fetchFromSupabase(hash);
    if (cached.length >= CONFIG.minCachedLocations) {
      updateProgress(30, `Found ${cached.length} cached locations!`);
      console.log('Cache HIT:', hash, cached.length, 'rows');
      return cached;
    }

    console.log('Cache MISS:', hash);
    updateProgress(15, 'Generating random points...');

    const bands = [
      { minDist:  50, maxDist: 150, count: 20 },
      { minDist: 150, maxDist: 250, count: 20 },
      { minDist: 250, maxDist: 350, count: 30 },
      { minDist: 350, maxDist: 450, count: 30 },
    ];
    const randomPoints = bands.flatMap(b =>
      Array.from({ length: b.count }, () =>
        generateRandomPointNearby(lat, lng, b.minDist, b.maxDist)
      )
    );

    const totalBatches   = Math.ceil(randomPoints.length / CONFIG.batchSize);
    const validLocations = [];
    let processed        = 0;

    updateProgress(20, `Checking ${randomPoints.length} points in ${totalBatches} batches...`);

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

      updateProgress(
        20 + (processed / randomPoints.length) * 38,
        `Batch ${batchNum}/${totalBatches} done — ${validLocations.length} locations found`
      );
    }

    updateProgress(62, `Found ${validLocations.length} quality locations`);

    if (!validLocations.length) {
      throw new Error('No usable Street View images found. Try a different address.');
    }

    updateProgress(72, `Saving ${validLocations.length} locations to database...`);
    const saved = await saveToSupabase(validLocations);
    updateProgress(82, 'Saved!');
    return saved;
  }

  async function startGame() {
    const place = selectedPlaceRef.current;
    if (!place?.geometry) {
      alert('Please select an address first');
      return;
    }

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    setAddress(place.formatted_address);
    setScreen('loading');

    try {
      const records = await getPointsForCoordinate(lat, lng);

      updateProgress(86, 'Building questions...');
      const qs = generateQuestions(records, lat, lng);

      if (!qs.length) {
        throw new Error('Could not generate enough questions. Try a different address.');
      }

      updateProgress(92, 'Preloading images...');
      qs.forEach(q => { const img = new Image(); img.src = q.image_url; });

      updateProgress(100, 'Ready!');

      setQuestions(qs);
      setCurrentQuestion(0);
      setScore(0);
      setAnswered(false);
      setSelectedIdx(-1);
      setCorrectIdx(qs[0].options.findIndex(o => o.isCorrect));
      setNextEnabled(false);

      await new Promise(r => setTimeout(r, 400));
      setScreen('game');

    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
      setScreen('error');
    }
  }

  function selectOption(idx) {
    if (answered) return;
    setAnswered(true);
    setSelectedIdx(idx);

    const q = questions[currentQuestion];
    const ci = q.options.findIndex(o => o.isCorrect);
    setCorrectIdx(ci);

    if (idx === ci) setScore(s => s + 1);

    setTimeout(() => setNextEnabled(true), 800);
  }

  function nextQuestionHandler() {
    const next = currentQuestion + 1;
    if (next >= questions.length) {
      setScreen('results');
      return;
    }
    setCurrentQuestion(next);
    setAnswered(false);
    setSelectedIdx(-1);
    setCorrectIdx(questions[next].options.findIndex(o => o.isCorrect));
    setNextEnabled(false);
  }

  // ── Render ─────────────────────────────────────────────

  const q   = questions[currentQuestion];
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;

  return (
    <div className="container">

      {/* Start Screen */}
      {screen === 'start' && (
        <div className="screen">
          <h1>NearMe <span style={{ fontSize: 14, color: '#999', fontWeight: 'normal' }}>v0.4.0</span></h1>
          <p className="subtitle">Test your local knowledge with 10 nearby images.</p>
          <label htmlFor="addressInput" style={{ display: 'block', marginBottom: 10, color: '#333', fontWeight: 'bold' }}>
            Enter your address:
          </label>
          <input
            ref={addressInputRef}
            id="addressInput"
            type="text"
            placeholder="Start typing your address..."
          />
          <button disabled={!startBtnEnabled} onClick={startGame}>
            Let&apos;s go!
          </button>
        </div>
      )}

      {/* Loading Screen */}
      {screen === 'loading' && (
        <div className="screen">
          <h2 style={{ textAlign: 'center', marginBottom: 20 }}>Generating Your Quiz...</h2>
          <div className="loading-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="loading-text">{loadingText}</div>
          </div>
          <p style={{ textAlign: 'center', color: '#666', marginTop: 30 }}>
            Playing from: {address}
          </p>
        </div>
      )}

      {/* Game Screen */}
      {screen === 'game' && q && (
        <div className="screen">
          <div className="progress-text">Question {currentQuestion + 1} of {questions.length}</div>
          <div className="score">Score: {score}/{answered ? currentQuestion + 1 : currentQuestion}</div>

          <div style={{ textAlign: 'center', margin: '20px 0' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={q.image_url}
              alt="Street View"
              style={{ maxWidth: 600, width: '100%', borderRadius: 8, boxShadow: '0 4px 8px rgba(0,0,0,0.2)' }}
            />
          </div>

          <h3 style={{ textAlign: 'center', margin: '20px 0', color: '#333' }}>Where are you?!</h3>

          <div style={{ maxWidth: 500, margin: '0 auto' }}>
            {q.options.map((opt, idx) => {
              let cls = 'option';
              if (answered) {
                cls += ' answered';
                if (opt.isCorrect) cls += ' correct';
                else if (idx === selectedIdx) cls += ' incorrect';
              }

              return (
                <label key={idx} className={cls} onClick={() => selectOption(idx)}>
                  <input type="radio" name="location" value={idx} checked={idx === selectedIdx} readOnly />
                  <span className="option-text">{opt.name} ({opt.distance}m away)</span>
                  {answered && opt.isCorrect && (
                    <span className="result-marker correct">{'\u2713'}</span>
                  )}
                  {answered && !opt.isCorrect && idx === selectedIdx && (
                    <span className="result-marker incorrect">{'\u2717'}</span>
                  )}
                </label>
              );
            })}
          </div>

          <div className="next-btn-container">
            <button disabled={!nextEnabled} onClick={nextQuestionHandler}>
              {currentQuestion === questions.length - 1 ? 'See Results' : 'Next Question \u2192'}
            </button>
          </div>
        </div>
      )}

      {/* Results Screen */}
      {screen === 'results' && (
        <div className="screen">
          <div className="results-screen">
            <h1>{'\uD83C\uDF89'} Game Complete!</h1>
            <div className="final-score">{score}/{questions.length}</div>
            <div className="results-message">
              {pct >= 90
                ? '\uD83C\uDFC6 Amazing! You really know your local area!'
                : pct >= 70
                ? '\uD83D\uDC4F Great job! You know your neighbourhood well!'
                : pct >= 50
                ? '\uD83D\uDC4D Not bad! Time to explore more!'
                : '\uD83D\uDDFA\uFE0F Maybe take a walk around your area!'}
            </div>
            <button onClick={() => window.location.reload()}>Play Again</button>
          </div>
        </div>
      )}

      {/* Error Screen */}
      {screen === 'error' && (
        <div className="screen">
          <div className="error">
            <h2>{'\u26A0\uFE0F'} Error</h2>
            <p>{errorMsg}</p>
            <button onClick={() => window.location.reload()} style={{ marginTop: 20 }}>Try Again</button>
          </div>
        </div>
      )}
    </div>
  );
}
