'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ChatSession {
  id: string
  title: string
  is_favorite: boolean
  created_at: string
  updated_at: string
  /** SDK-only sessions have their sessionId here for resume */
  sdkSessionId?: string
  /** True if this session comes from SDK (Claude Code CLI) and has no Supabase entry */
  isSDKOnly?: boolean
}

export interface PersistedMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  audio_url?: string | null
  image_url?: string | null
  metadata?: { source?: string; jobId?: string; jobLabel?: string } | null
}

function sessionSort(a: ChatSession, b: ChatSession): number {
  const aIsAuto = a.title === 'Automations'
  const bIsAuto = b.title === 'Automations'
  if (aIsAuto !== bIsAuto) return aIsAuto ? -1 : 1
  if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
  return b.updated_at.localeCompare(a.updated_at)
}

export function useChatHistory() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)

  // Load session list on mount
  useEffect(() => {
    loadSessions()
  }, [])

  // Noise patterns: cron jobs, /status, system commands — not real conversations
  const SDK_NOISE = /^(Unknown skill:|\/status|\/compact|\/context|\/model|testing$)/i

  const loadSessions = useCallback(async () => {
    setLoading(true)

    // 1. Load MC sessions first (fast — Supabase edge)
    const supabase = createClient()
    const { data } = await supabase
      .from('chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(30)
    const mcSessions = ((data as ChatSession[]) ?? [])

    // Show MC sessions immediately — don't wait for SDK
    setSessions(mcSessions.sort(sessionSort))
    setLoading(false)

    // 2. Fetch SDK sessions in background (slower — disk I/O via agent server)
    try {
      const res = await fetch('/api/chat/sessions?limit=20')
      if (!res.ok) return
      const { sessions: sdkSessions } = await res.json() as {
        sessions: Array<{
          sessionId: string
          summary: string
          lastModified: number
          fileSize: number
          customTitle?: string
          firstPrompt?: string
          linkedChatSessionId: string | null
        }>
      }

      const mcIds = new Set(mcSessions.map((s) => s.id))
      const sdkOnlySessions: ChatSession[] = sdkSessions
        // Filter out sessions already linked to MC
        .filter((s) => !s.linkedChatSessionId || !mcIds.has(s.linkedChatSessionId))
        // Filter out noise (cron jobs, /status, system commands)
        .filter((s) => {
          const title = s.customTitle || s.summary || s.firstPrompt || ''
          return !SDK_NOISE.test(title) && title.length > 5 && s.fileSize > 500
        })
        .map((s) => ({
          id: `sdk:${s.sessionId}`,
          title: s.customTitle || s.summary || s.firstPrompt?.slice(0, 60) || 'Claude Code session',
          is_favorite: false,
          created_at: new Date(s.lastModified).toISOString(),
          updated_at: new Date(s.lastModified).toISOString(),
          sdkSessionId: s.sessionId,
          isSDKOnly: true,
        }))

      if (sdkOnlySessions.length > 0) {
        setSessions((prev) => [...prev.filter((s) => !s.isSDKOnly), ...sdkOnlySessions].sort(sessionSort))
      }
    } catch { /* Agent server offline — MC sessions only, no error */ }
  }, [])

  const createSession = useCallback(async (firstMessage: string): Promise<ChatSession> => {
    const supabase = createClient()
    // Optimistic title while AI generates
    const fallbackTitle = firstMessage.slice(0, 55) + (firstMessage.length > 55 ? '...' : '')

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({ title: fallbackTitle })
      .select()
      .single()
    if (error || !data) throw new Error(error?.message ?? 'Failed to create session')
    const session = data as ChatSession
    setSessions((prev) => [session, ...prev])

    // Generate AI title in background
    fetch('/api/chat/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: firstMessage }),
    })
      .then((r) => r.json())
      .then(({ title }: { title?: string }) => {
        if (!title || title === fallbackTitle) return
        supabase.from('chat_sessions').update({ title }).eq('id', session.id)
        setSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, title } : s))
      })
      .catch(() => { /* silent */ })

    return session
  }, [])

  const updateSessionTimestamp = useCallback(async (sessionId: string) => {
    const supabase = createClient()
    const now = new Date().toISOString()
    await supabase
      .from('chat_sessions')
      .update({ updated_at: now })
      .eq('id', sessionId)
    setSessions((prev) =>
      prev
        .map((s) => (s.id === sessionId ? { ...s, updated_at: now } : s))
        .sort(sessionSort),
    )
  }, [])

  const saveMessages = useCallback(
    async (
      sessionId: string,
      messages: Array<{ role: 'user' | 'assistant'; content: string; audioUrl?: string; imageUrl?: string }>,
    ) => {
      const supabase = createClient()
      await supabase.from('chat_messages').insert(
        messages.map((m) => ({
          session_id: sessionId,
          role: m.role,
          content: m.content,
          audio_url: m.audioUrl ?? null,
          image_url: m.imageUrl ?? null,
        })),
      )
      await updateSessionTimestamp(sessionId)
    },
    [updateSessionTimestamp],
  )

  const loadMessages = useCallback(async (sessionId: string): Promise<PersistedMessage[]> => {
    // SDK-only sessions: load from agent server endpoint
    if (sessionId.startsWith('sdk:')) {
      const sdkId = sessionId.slice(4)
      try {
        const res = await fetch(`/api/chat/sessions/${sdkId}/messages`)
        if (!res.ok) return []
        const { messages: rawMsgs } = await res.json() as {
          messages: Array<{
            type: string
            uuid?: string
            message?: {
              role?: string
              content?: Array<{ type: string; text?: string; thinking?: string }>
            }
          }>
        }

        // Build messages: attach thinking to the next text response (not as separate bubbles)
        const result: PersistedMessage[] = []
        let pendingThinking: string[] = []

        for (const m of rawMsgs) {
          const role = m.type === 'user' ? 'user' : m.type === 'assistant' ? 'assistant' : null
          if (!role) continue

          const blocks = m.message?.content
          if (!Array.isArray(blocks)) continue

          // Collect thinking blocks
          for (const b of blocks) {
            if (b.type === 'thinking' && b.thinking) {
              pendingThinking.push(`<!--thinking-->${b.thinking}<!--/thinking-->`)
            }
          }

          // Extract text blocks
          const textParts = blocks
            .filter((b) => b.type === 'text' && b.text)
            .map((b) => b.text!)

          // Only create a message if there's actual text
          if (textParts.length === 0) continue

          // Prepend any pending thinking to this message
          const allParts = [...pendingThinking, ...textParts]
          pendingThinking = []

          result.push({
            id: m.uuid ?? `sdk-${result.length}`,
            session_id: sessionId,
            role,
            content: allParts.join('\n\n'),
            created_at: new Date().toISOString(),
          })
        }

        return result
      } catch { return [] }
    }

    // MC sessions: load from Supabase
    const supabase = createClient()
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    return (data as PersistedMessage[]) ?? []
  }, [])

  const deleteSession = useCallback(async (sessionId: string) => {
    const supabase = createClient()
    await supabase.from('chat_sessions').delete().eq('id', sessionId)
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
  }, [])

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    const supabase = createClient()
    await supabase.from('chat_sessions').update({ title: trimmed }).eq('id', sessionId)
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, title: trimmed } : s))
  }, [])

  const toggleFavorite = useCallback(async (sessionId: string) => {
    const supabase = createClient()
    const target = sessions.find((s) => s.id === sessionId)
    if (!target) return
    const next = !target.is_favorite
    await supabase.from('chat_sessions').update({ is_favorite: next }).eq('id', sessionId)
    setSessions((prev) =>
      prev
        .map((s) => (s.id === sessionId ? { ...s, is_favorite: next } : s))
        .sort(sessionSort),
    )
  }, [sessions])

  return {
    sessions,
    loading,
    loadSessions,
    createSession,
    saveMessages,
    loadMessages,
    deleteSession,
    renameSession,
    toggleFavorite,
  }
}
