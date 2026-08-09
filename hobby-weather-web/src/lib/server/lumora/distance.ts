function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMiles({
  fromLat,
  fromLon,
  toLat,
  toLon,
}: {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
}) {
  const earthRadiusMiles = 3958.8;

  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);

  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
}

export function roundedDistanceMiles({
  fromLat,
  fromLon,
  toLat,
  toLon,
  decimals = 1,
}: {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  decimals?: number;
}) {
  return Number(
    distanceMiles({
      fromLat,
      fromLon,
      toLat,
      toLon,
    }).toFixed(decimals)
  );
}

export function hasValidCoordinates(location: {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}) {
  return (
    location.latitude !== null &&
    location.latitude !== undefined &&
    location.longitude !== null &&
    location.longitude !== undefined &&
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude))
  );
}