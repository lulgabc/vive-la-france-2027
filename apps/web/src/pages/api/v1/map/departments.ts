import type { APIRoute } from 'astro';
import { jsonResponse, readMap } from '../../../../lib/api';

export const GET: APIRoute = async ({ request }) => {
  return jsonResponse(readMap(), {}, request);
};
