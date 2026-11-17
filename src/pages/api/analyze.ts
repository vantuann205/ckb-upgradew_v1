import type { APIRoute } from 'astro'
import { analyzeScript, InspectError } from '../../server/ckb-inspector'

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.text()
    if (body.length > 16_384) throw new InspectError('Request is too large.', 413)
    const payload = JSON.parse(body)
    return Response.json(await analyzeScript(payload))
  } catch (error) {
    const status = error instanceof InspectError ? error.status : error instanceof SyntaxError ? 400 : 502
    const message = error instanceof InspectError ? error.message : error instanceof SyntaxError ? 'The analysis request must be valid JSON.' : 'The analysis could not be completed.'
    return Response.json({ error: message }, { status })
  }
}
