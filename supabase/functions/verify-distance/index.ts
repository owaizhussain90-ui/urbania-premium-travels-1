// Supabase Edge Function: verify-distance
// Runs in the background after a booking is created and re-measures every leg of the trip with the
// Google Maps Distance Matrix API (server-side key), so the distance a customer was billed for is checked
// independently of the browser.
// Wire it up with a Database Webhook: table `bookings`, event INSERT -> this function, header x-webhook-secret.
// Secrets: GOOGLE_MAPS_SERVER_KEY, WEBHOOK_SECRET (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase)
// Deploy: supabase functions deploy verify-distance --no-verify-jwt
// Result is written to bookings.verified_km / verified_leg_km / distance_check ('verified' | 'mismatch' | 'unavailable').

const TOLERANCE_PCT = 3;  // a difference up to 3% (or 5 km, whichever is larger) counts as verified
const TOLERANCE_KM = 5;

async function legKm(from: string, to: string, key: string): Promise<number> {
  const u = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  u.searchParams.set('origins', from); u.searchParams.set('destinations', to);
  u.searchParams.set('mode', 'driving'); u.searchParams.set('region', 'in'); u.searchParams.set('key', key);
  const j = await (await fetch(u)).json();
  const el = j?.rows?.[0]?.elements?.[0];
  if (j?.status !== 'OK' || el?.status !== 'OK') throw new Error(`No route ${from} -> ${to}: ${j?.status}/${el?.status}`);
  return Math.round((el.distance.value / 1000) * 10) / 10;
}


// ── States on the route (so the permit tax can be checked too) ──
function decodePolyline(str: string): [number, number][] {
  const out: [number, number][] = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d; else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}
const ALIAS: Record<string, string> = { Pondicherry: 'Puducherry', Orissa: 'Odisha', 'NCT of Delhi': 'Delhi' };

async function routeStates(pts: string[], key: string): Promise<string[]> {
  const u = new URL('https://maps.googleapis.com/maps/api/directions/json');
  u.searchParams.set('origin', pts[0]); u.searchParams.set('destination', pts[pts.length - 1]);
  if (pts.length > 2) u.searchParams.set('waypoints', pts.slice(1, -1).join('|'));
  u.searchParams.set('mode', 'driving'); u.searchParams.set('region', 'in'); u.searchParams.set('key', key);
  const j = await (await fetch(u)).json();
  if (j?.status !== 'OK') throw new Error(`Directions: ${j?.status}`);
  const path = decodePolyline(j.routes[0].overview_polyline.points);
  const km = j.routes[0].legs.reduce((s: number, l: { distance: { value: number } }) => s + l.distance.value, 0) / 1000;
  const step = Math.max(1, Math.floor(path.length / Math.min(60, Math.max(8, Math.ceil(km / 40)))));
  const samples = path.filter((_, i) => i % step === 0); samples.push(path[path.length - 1]);
  const names: (string | null)[] = [];
  for (const [lat, lng] of samples) {
    const g = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    g.searchParams.set('latlng', `${lat},${lng}`); g.searchParams.set('result_type', 'administrative_area_level_1'); g.searchParams.set('key', key);
    const r = await (await fetch(g)).json();
    const n = r?.results?.[0]?.address_components?.find((c: { types: string[] }) => c.types.includes('administrative_area_level_1'))?.long_name;
    names.push(n ? ALIAS[n] ?? n : null);
  }
  return [...new Set(names.filter((n): n is string => !!n))];
}

async function patch(id: string, body: Record<string, unknown>) {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/bookings?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ...body, verified_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(await res.text());
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });
  const { record: b } = await req.json();
  if (!b?.id) return new Response('No booking', { status: 200 });
  const key = Deno.env.get('GOOGLE_MAPS_SERVER_KEY');
  try {
    if (!key) throw new Error('GOOGLE_MAPS_SERVER_KEY not set');
    // Same route as the booking: one way A-B, round trip A-B-A, multi-city A-stops-B.
    const stops: string[] = Array.isArray(b.stops) ? b.stops : [];
    const pts = b.trip_type === 'round_trip' ? [b.pickup, b.dropoff, b.pickup] : b.trip_type === 'multi_city' ? [b.pickup, ...stops, b.dropoff] : [b.pickup, b.dropoff];
    const legs: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) legs.push(await legKm(pts[i], pts[i + 1], key));
    const total = Math.round(legs.reduce((a, c) => a + c, 0) * 10) / 10;
    const billed = Number(b.billed_km);
    const ok = Math.abs(total - billed) <= Math.max(TOLERANCE_KM, (billed * TOLERANCE_PCT) / 100);
    const states = await routeStates(pts, key).catch(() => null);
    await patch(b.id, { verified_km: total, verified_leg_km: legs, verified_states: states, distance_check: ok ? 'verified' : 'mismatch' });
    return new Response(ok ? 'verified' : 'mismatch');
  } catch (e) {
    await patch(b.id, { distance_check: 'unavailable' }).catch(() => {});
    return new Response(`unavailable: ${(e as Error).message}`, { status: 200 });
  }
});
