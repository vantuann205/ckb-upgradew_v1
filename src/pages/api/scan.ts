import type { APIRoute } from 'astro'
import { InspectError, scanAddress } from '../../server/ckb-inspector'

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.text()
    if (body.length > 16_384) throw new InspectError('Request is too large.', 413)
    const payload = JSON.parse(body)
    return Response.json(await scanAddress(payload))
  } catch (error) {
    const status = error instanceof InspectError ? error.status : error instanceof SyntaxError ? 400 : 502
    const message = error instanceof InspectError ? error.message : error instanceof SyntaxError ? 'The scan request must be valid JSON.' : 'The scan could not be completed.'
    return Response.json({ error: message }, { status })
  }
}
