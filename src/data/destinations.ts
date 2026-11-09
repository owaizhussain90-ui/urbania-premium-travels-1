// Suggested getaways shown on the home page. Images live in /public/images/destinations.
// To change a photo, replace the .jpg with the same name (about 720x480 works well).
// Distances are approximate road distances from Mysuru, shown for inspiration only. The booking fare
// always uses the route distance measured when the customer books.
export interface Destination { id: string; name: string; place: string; tagline: string; km: number; image: string }

export const DESTINATIONS: Destination[] = [
  { id: 'coorg', name: 'Coorg', place: 'Madikeri, Karnataka', tagline: 'Hill fort, coffee estates and mist', km: 120, image: '/images/destinations/coorg.jpg' },
  { id: 'pondicherry', name: 'Pondicherry', place: 'Pondicherry', tagline: 'Sea promenade, French quarter and cafes', km: 452, image: '/images/destinations/pondicherry.jpg' },
  { id: 'munnar', name: 'Munnar', place: 'Munnar, Kerala', tagline: 'Tea hills, waterfalls and cool air', km: 400, image: '/images/destinations/munnar.jpg' },
  { id: 'kabini', name: 'Kabini', place: 'Kabini, Karnataka', tagline: 'Boat safari and elephants by the river', km: 80, image: '/images/destinations/kabini.jpg' },
  { id: 'hampi', name: 'Hampi', place: 'Hampi, Karnataka', tagline: 'Ancient temples among boulders', km: 380, image: '/images/destinations/hampi.jpg' },
  { id: 'kodaikanal', name: 'Kodaikanal', place: 'Kodaikanal, Tamil Nadu', tagline: 'Misty cliffs, pine forests and a lake', km: 440, image: '/images/destinations/kodaikanal.jpg' },
  { id: 'wayanad', name: 'Wayanad', place: 'Wayanad, Kerala', tagline: 'Ghat roads, waterfalls and spice forests', km: 120, image: '/images/destinations/wayanad.jpg' },
  { id: 'ooty', name: 'Ooty', place: 'Ooty, Tamil Nadu', tagline: 'Nilgiri hills, tea gardens and a lake', km: 125, image: '/images/destinations/ooty.jpg' },
];
