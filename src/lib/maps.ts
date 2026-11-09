/* eslint-disable @typescript-eslint/no-explicit-any */
const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
let loader: Promise<any> | null = null;

export const mapsEnabled = !!KEY;

// Loaded lazily, only when a location field is focused, to keep initial JS small.
export function loadMaps(): Promise<any> {
  if (!KEY) return Promise.reject(new Error('Maps key missing'));
  if ((window as any).google?.maps?.places) return Promise.resolve((window as any).google);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places&region=IN`;
      s.async = true;
      s.onload = () => resolve((window as any).google);
      s.onerror = () => { loader = null; reject(new Error('Maps failed to load')); };
      document.head.appendChild(s);
    });
  }
  return loader;
}

export async function routeDistanceKm(origin: string, destination: string): Promise<number> {
  const g = await loadMaps();
  const svc = new g.maps.DistanceMatrixService();
  const res: any = await new Promise((resolve, reject) =>
    svc.getDistanceMatrix(
      { origins: [origin], destinations: [destination], travelMode: 'DRIVING', region: 'IN' },
      (r: any, status: string) => (status === 'OK' ? resolve(r) : reject(new Error(status))),
    ),
  );
  const el = res.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK') throw new Error('No route found');
  return Math.round((el.distance.value / 1000) * 10) / 10;
}

const STATE_ALIASES: Record<string, string> = { Pondicherry: 'Puducherry', Orissa: 'Odisha', 'NCT of Delhi': 'Delhi' };

// Every state the driving route passes through, in order. The full route is requested from Google Directions,
// its path is sampled about every 40 km and each sample is reverse-geocoded to its state.
export async function routeStates(points: string[]): Promise<string[]> {
  const g = await loadMaps();
  const dir = await new Promise<any>((resolve, reject) =>
    new g.maps.DirectionsService().route(
      { origin: points[0], destination: points[points.length - 1], waypoints: points.slice(1, -1).map((location) => ({ location, stopover: true })), travelMode: 'DRIVING', region: 'IN' },
      (r: any, status: string) => (status === 'OK' ? resolve(r) : reject(new Error(status))),
    ),
  );
  const path: any[] = dir.routes[0].overview_path;
  const km = (dir.routes[0].legs as any[]).reduce((s, l) => s + l.distance.value, 0) / 1000;
  const wanted = Math.min(60, Math.max(8, Math.ceil(km / 40)));
  const step = Math.max(1, Math.floor(path.length / wanted));
  const samples = path.filter((_, i) => i % step === 0);
  samples.push(path[path.length - 1]);
  const geocoder = new g.maps.Geocoder();
  const names: (string | null)[] = new Array(samples.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < samples.length) {
      const i = next++;
      try {
        const res: any = await new Promise((resolve, reject) =>
          geocoder.geocode({ location: samples[i] }, (r: any, status: string) => (status === 'OK' ? resolve(r) : status === 'ZERO_RESULTS' ? resolve([]) : reject(new Error(status)))),
        );
        const comp = (res as any[]).flatMap((x) => x.address_components).find((c: any) => c.types.includes('administrative_area_level_1'));
        if (comp) names[i] = STATE_ALIASES[comp.long_name] ?? comp.long_name;
      } catch { /* a missed sample is covered by its neighbours */ }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (names.every((n) => !n)) throw new Error('Could not determine route states');
  return [...new Set(names.filter((n): n is string => !!n))];
}
