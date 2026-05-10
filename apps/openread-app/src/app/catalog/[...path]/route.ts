import { proxyCatalogRequest } from '@/app/api/_catalogProxy';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  return proxyCatalogRequest(request, params, '/catalog');
}
