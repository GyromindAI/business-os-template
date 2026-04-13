import { createClient } from '@/lib/supabase/server'
import { hasRole } from '@/lib/auth-utils'

const AGENT_URL = process.env.AGENT_URL ?? 'http://localhost:3099'
const AGENT_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? ''

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!(await hasRole(user.id, 'owner', 'admin'))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sessionId } = await params

  try {
    const res = await fetch(`${AGENT_URL}/sessions/${sessionId}/messages`, {
      headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
    })
    if (!res.ok) throw new Error(`Agent server ${res.status}`)
    const data = await res.json()
    return Response.json(data)
  } catch {
    return Response.json({ error: 'Agent server unreachable' }, { status: 503 })
  }
}
