import { GET as apiHealthGet } from '@/app/api/health/route';

/**
 * Webuzo/Passenger-style health probes may request /health directly.
 * Keep /api/health as the canonical implementation and expose this thin alias
 * so infrastructure probes do not produce avoidable 404s.
 */
export async function GET() {
  return apiHealthGet();
}
