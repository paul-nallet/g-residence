import { apiHandler } from './server/Http.ts'

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api')
      return Response.json({ error: 'Route inconnue.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    if (pathname.startsWith('/api/')) return apiHandler(request, env)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
