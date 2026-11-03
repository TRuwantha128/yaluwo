// Put your key in frontend/.env.local as:  VITE_GOOGLE_MAPS_API_KEY=your-key
// Without a key the site still works: search uses the built-in place list and
// maps use Google's free embedded map.
export const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''

export const SRI_LANKA_CENTER = { lat: 7.8731, lng: 80.7718 }
