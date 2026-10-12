// Public reference coordinates from OurAirports' open airport dataset.
// These coordinates are only used to suggest a nearby origin; airport IDs and
// all searchable airport data must still come from the Airport API.
const AIRPORT_COORDINATES = Object.freeze({
  BMV: [12.6683, 108.12],
  VCL: [15.4033, 108.706001],
  HPH: [20.817428, 106.724315],
  CAH: [9.177667, 105.177778],
  CXR: [11.9982, 109.219002],
  VCS: [8.73183, 106.633003],
  VCA: [10.083397, 105.709371],
  DIN: [21.397499, 103.008003],
  VDH: [17.515, 106.590556],
  DLI: [11.750556, 108.366997],
  DAD: [16.0439, 108.198997],
  HAN: [21.221201, 105.806999],
  HUI: [16.400581, 107.704094],
  UIH: [13.955, 109.042],
  PXU: [14.0045, 108.016998],
  PQC: [10.169783, 103.99353],
  VKG: [9.95803, 105.13238],
  TBB: [13.0496, 109.334],
  SGN: [10.8188, 106.652],
  THD: [19.901667, 105.467778],
  VDO: [21.120693, 107.41539],
  VII: [18.7376, 105.670998],
});

export const MAX_GEOLOCATION_ACCURACY_METERS = 25_000;
export const MAX_AIRPORT_DISTANCE_KM = 250;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

export function distanceBetweenCoordinatesKm(latitude, longitude, airportLatitude, airportLongitude) {
  const values = [latitude, longitude, airportLatitude, airportLongitude].map(Number);
  if (!values.every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  const [lat1, lon1, lat2, lon2] = values.map(toRadians);
  const latitudeDelta = lat2 - lat1;
  const longitudeDelta = lon2 - lon1;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(longitudeDelta / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

const isVietnam = (country) => ['vietnam', 'viet nam', 'việt nam']
  .includes(String(country || '').trim().toLowerCase().replace(/\s+/g, ' '));

export function findNearestSupportedAirport(position, airports) {
  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);
  const accuracy = Number(position?.coords?.accuracy);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || !Number.isFinite(accuracy) || accuracy < 0
    || accuracy > MAX_GEOLOCATION_ACCURACY_METERS || !Array.isArray(airports)) return null;

  let nearest = null;
  for (const airport of airports) {
    const code = String(airport?.iata_code || '').trim().toUpperCase();
    const coordinates = AIRPORT_COORDINATES[code];
    if (!coordinates || !isVietnam(airport?.country) || airport?.id == null) continue;

    const distanceKm = distanceBetweenCoordinatesKm(latitude, longitude, coordinates[0], coordinates[1]);
    if (distanceKm <= MAX_AIRPORT_DISTANCE_KM && (!nearest || distanceKm < nearest.distanceKm)) {
      nearest = { airport, distanceKm };
    }
  }

  return nearest;
}
