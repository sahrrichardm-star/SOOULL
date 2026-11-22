import { useEffect, useState, type FormEvent } from 'react'
import { BrainCircuit, CheckCircle2, LockKeyhole, Save } from 'lucide-react'
import { supabase } from './lib/supabase'

type Source = { id: string; title: string; source_type: 'story' | 'legacy_entry' }
type ChatMessage = { role: 'user' | 'assistant'; content: string; sources?: { id: string; type: string; title: string }[] }
type Conversation = { id: string; title: string; updated_at: string }

export function PersonaModule({ userId }: { userId: string }) {
  const [name, setName] = useState('')
  const [biography, setBiography] = useState('')
  const [style, setStyle] = useState('warm and thoughtful')
  const [sources, setSources] = useState<Source[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [consented, setConsented] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatPrompt, setChatPrompt] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [chatBusy, setChatBusy] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) { setError('Supabase is not configured.'); setLoading(false); return }
      setLoading(true)
      setError('')
      try {
        const [profile, stories, legacy, approvals, consent, conversationList] = await Promise.all([
          supabase.from('persona_profiles').select('display_name,biography,response_style,is_enabled').eq('user_id', userId).maybeSingle(),
          supabase.from('stories').select('id,title').eq('user_id', userId).order('created_at', { ascending: false }),
          supabase.from('legacy_entries').select('id,title').eq('user_id', userId).order('created_at', { ascending: false }),
          supabase.from('persona_sources').select('source_type,source_id').eq('user_id', userId).eq('is_enabled', true),
          supabase.from('persona_consents').select('id').eq('user_id', userId).eq('consent_type', 'text_persona').is('revoked_at', null).limit(1),
          supabase.from('persona_conversations').select('id,title,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(20),
        ])
        const failed = profile.error || stories.error || legacy.error || approvals.error || consent.error || conversationList.error
        if (failed) throw failed
        if (!active) return
        setName(profile.data?.display_name ?? '')
        setBiography(profile.data?.biography ?? '')
        setStyle(profile.data?.response_style ?? 'warm and thoughtful')
        setEnabled(profile.data?.is_enabled ?? false)
        setSources([
          ...(stories.data ?? []).map(item => ({ ...item, source_type: 'story' as const })),
          ...(legacy.data ?? []).map(item => ({ ...item, source_type: 'legacy_entry' as const })),
        ])
        setSelected((approvals.data ?? []).map(item => item.source_id))
        setConsented((consent.data ?? []).length > 0)
        setConversations((conversationList.data ?? []) as Conversation[])
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load persona settings.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [userId])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || saving) return
    if (!name.trim()) {
      setError('Enter a name for this persona before saving.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const approvedSources = sources.filter(source => selected.includes(source.id)).map(source => ({
        source_type: source.source_type,
        source_id: source.id,
      }))
      const { data, error: saveError } = await supabase.rpc('save_persona_configuration', {
        p_display_name: name.trim(),
        p_biography: biography.trim(),
        p_response_style: style,
        p_sources: approvedSources,
        p_consent: consented,
      })
      if (saveError) throw saveError
      const isEnabled = Boolean(data?.enabled)
      setEnabled(isEnabled)
      setMessage(isEnabled
        ? 'Persona profile, approved sources and consent saved successfully.'
        : 'Persona draft saved. To activate AI Legacy, select at least one story or legacy entry and grant text-processing consent.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save persona settings.')
    } finally {
      setSaving(false)
    }
  }

  async function revoke() {
    if (!supabase || !window.confirm('Disable your text persona and revoke its processing consent?')) return
    setSaving(true)
    setError('')
    try {
      const now = new Date().toISOString()
      const [profile, consent] = await Promise.all([
        supabase.from('persona_profiles').update({ is_enabled: false, updated_at: now }).eq('user_id', userId),
        supabase.from('persona_consents').update({ revoked_at: now }).eq('user_id', userId).eq('consent_type', 'text_persona').is('revoked_at', null),
      ])
      if (profile.error) throw profile.error
      if (consent.error) throw consent.error
      setEnabled(false)
      setConsented(false)
      setMessage('Text persona disabled and consent revoked. Your original stories remain unchanged.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke consent.')
    } finally {
      setSaving(false)
    }
  }

  async function openConversation(id: string) {
    if (!supabase || historyLoading) return
    setHistoryLoading(true)
    setError('')
    try {
      const { data, error: readError } = await supabase.from('persona_messages')
        .select('role,content,source_refs').eq('user_id', userId).eq('conversation_id', id)
        .order('created_at', { ascending: true }).limit(100)
      if (readError) throw readError
      setConversationId(id)
      setChatMessages((data ?? []).map(item => ({
        role: item.role as 'user' | 'assistant',
        content: item.content,
        sources: Array.isArray(item.source_refs) ? item.source_refs as ChatMessage['sources'] : [],
      })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that conversation.')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function deleteConversation() {
    if (!supabase || !conversationId || historyLoading || chatBusy) return
    if (!window.confirm('Delete this AI conversation and its messages permanently?')) return
    setHistoryLoading(true)
    setError('')
    try {
      const { error: deleteError } = await supabase.from('persona_conversations')
        .delete().eq('id', conversationId).eq('user_id', userId)
      if (deleteError) throw deleteError
      setConversations(current => current.filter(item => item.id !== conversationId))
      setConversationId(null)
      setChatMessages([])
      setMessage('Conversation deleted.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete this conversation.')
    } finally {
      setHistoryLoading(false)
    }
  }

  function startNewConversation() {
    setConversationId(null)
    setChatMessages([])
    setError('')
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !chatPrompt.trim() || chatBusy) return
    const prompt = chatPrompt.trim()
    setChatPrompt('')
    setChatBusy(true)
    setError('')
    setChatMessages(current => [...current, { role: 'user', content: prompt }])
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('sooull-api', { body: { prompt, conversationId } })
      if (invokeError) throw invokeError
      if (!data?.answer) throw new Error(data?.error || 'AI response is unavailable.')
      setConversationId(data.conversationId)
      const { data: list } = await supabase.from('persona_conversations').select('id,title,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(20)
      if (list) setConversations(list as Conversation[])
      setChatMessages(current => [...current, { role: 'assistant', content: data.answer, sources: data.sources ?? [] }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The AI conversation could not be completed.')
    } finally {
      setChatBusy(false)
    }
  }

  if (loading) return <section className="stories-empty"><span className="loading-ring" />Loading AI legacy settings…</section>

  return <section className="stories-section">
    <div className="stories-toolbar">
      <div><span className="eyebrow">YOUR LEGACY, YOUR CONTROL</span><h2>AI legacy persona</h2></div>
      <span className="stat-icon"><BrainCircuit size={20} /></span>
    </div>
    <p className="vault-intro">Prepare a text-based AI representation grounded only in the memories and legacy entries you approve. This does not clone your voice or generate your likeness.</p>
    <div className="vault-security-note"><LockKeyhole size={17} /><span>Your source material stays private. Only entries you select below are approved for future persona responses.</span></div>
    {error && <p className="form-feedback form-error" role="alert">{error}</p>}
    {message && <p className="form-feedback form-success" role="status">{message}</p>}
    <form className="vault-form" onSubmit={save}>
      <label>Persona name<input value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Name shown to family" required /></label>
      <label>About this person<textarea value={biography} onChange={e => setBiography(e.target.value)} maxLength={4000} rows={4} placeholder="A short introduction, values and background" /></label>
      <label>Response style<select value={style} onChange={e => setStyle(e.target.value)}><option value="warm and thoughtful">Warm and thoughtful</option><option value="direct and practical">Direct and practical</option><option value="gentle and encouraging">Gentle and encouraging</option><option value="formal and reflective">Formal and reflective</option></select></label>
      <div className="vault-form-section"><h3>Approved source material</h3><p>Select exactly which stories and legacy entries may inform this persona.</p>
        {sources.length === 0 ? <p>No stories or legacy entries yet. Add them first, then return here.</p> : sources.map(source => {
          const key = source.id
          return <label className="vault-check-row" key={source.source_type + key}><input type="checkbox" checked={selected.includes(key)} onChange={e => setSelected(current => e.target.checked ? [...current, key] : current.filter(id => id !== key))} /><span><strong>{source.title}</strong><small>{source.source_type === 'story' ? 'Life story' : 'Legacy entry'}</small></span></label>
        })}
      </div>
      <label className="vault-check-row"><input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)} /><span><strong>I consent to text-based AI processing</strong><small>I understand only selected entries may be processed to generate AI responses. I can revoke this consent at any time. This consent does not cover voice or likeness generation.</small></span></label>
      <button className="dashboard-primary" type="submit" disabled={saving || !name.trim()}><Save size={16} />{saving ? 'Saving…' : 'Save persona settings'}</button>
    </form>
    {enabled && <div className="vault-security-note"><CheckCircle2 size={17} /><span>Persona profile is configured. AI chat requires the secure model service credentials to be configured.</span><button type="button" className="text-button" onClick={() => void revoke()} disabled={saving}>Revoke consent and disable</button></div>}
    {enabled && <section className="persona-chat-panel">
      <h3>Talk with the AI legacy companion</h3>
      <p>Responses are AI-generated and based only on the entries you approved. The companion does not claim to be the real person.</p>
      <div className="persona-chat-controls"><label>Saved conversations<select value={conversationId ?? ''} onChange={e => e.target.value ? void openConversation(e.target.value) : startNewConversation()}><option value="">New conversation</option>{conversations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className="persona-chat-actions"><button type="button" className="text-button" onClick={startNewConversation}>New chat</button>{conversationId && <button type="button" className="text-button" onClick={() => void deleteConversation()} disabled={historyLoading || chatBusy}>Delete conversation</button>}</div></div>
      <div className="persona-chat-history" aria-live="polite">
        {historyLoading ? <p>Loading conversation…</p> : chatMessages.length === 0 ? <p>Your conversation will appear here once the AI model service is configured.</p> : chatMessages.map((item, index) => <article className={item.role === 'user' ? 'persona-chat-user' : 'persona-chat-assistant'} key={index}><strong>{item.role === 'user' ? 'You' : 'SOOULL AI'}</strong><p>{item.content}</p>{item.sources?.length ? <small>Sources: {item.sources.map(source => source.title).join(', ')}</small> : null}</article>)}
      </div>
      <form className="persona-chat-compose" onSubmit={sendMessage}><textarea value={chatPrompt} onChange={e => setChatPrompt(e.target.value)} rows={2} maxLength={4000} placeholder="Ask about the memories you approved…" /><button className="dashboard-primary" type="submit" disabled={chatBusy || !chatPrompt.trim()}>{chatBusy ? 'Thinking…' : 'Send'}</button></form>
    </section>}
  </section>
}
