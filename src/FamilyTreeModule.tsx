import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Users, GitBranch, Pencil, Trash2, X, CalendarDays, Mail, Phone } from 'lucide-react'
import { supabase } from './lib/supabase'

type Tree = { id: string; owner_id: string; name: string; description: string; created_at: string }
type Member = { id: string; tree_id: string; owner_id: string; full_name: string; relationship: string; phone: string; email: string; birth_date: string | null; death_date: string | null; notes: string; parent_member_id: string | null }

export function FamilyTreeModule({ userId }: { userId: string }) {
  const [trees, setTrees] = useState<Tree[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [treeId, setTreeId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [treeName, setTreeName] = useState('')
  const [treeDescription, setTreeDescription] = useState('')
  const [memberOpen, setMemberOpen] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [fullName, setFullName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [parentId, setParentId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (preferredId?: string) => {
    if (!supabase) { setError('Secure database connection is unavailable.'); setLoading(false); return }
    setError('')
    try {
      const { data: treeRows, error: treeError } = await supabase.from('family_trees').select('id,owner_id,name,description,created_at').eq('owner_id', userId).order('created_at', { ascending: true })
      if (treeError) throw treeError
      const nextTrees = (treeRows ?? []) as Tree[]
      setTrees(nextTrees)
      const nextId = preferredId && nextTrees.some(t => t.id === preferredId) ? preferredId : (treeId && nextTrees.some(t => t.id === treeId) ? treeId : nextTrees[0]?.id ?? '')
      setTreeId(nextId)
      if (nextId) {
        const { data, error: memberError } = await supabase.from('family_tree_members').select('id,tree_id,owner_id,full_name,relationship,phone,email,birth_date,death_date,notes,parent_member_id').eq('owner_id', userId).eq('tree_id', nextId).order('full_name')
        if (memberError) throw memberError
        setMembers((data ?? []) as Member[])
      } else setMembers([])
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load family tree.') }
    finally { setLoading(false) }
  }, [userId, treeId])

  useEffect(() => { void load() }, [userId])

  const openMember = (member?: Member) => {
    setEditing(member ?? null)
    setFullName(member?.full_name ?? '')
    setRelationship(member?.relationship ?? '')
    setPhone(member?.phone ?? '')
    setEmail(member?.email ?? '')
    setBirthDate(member?.birth_date ?? '')
    setParentId(member?.parent_member_id ?? '')
    setNotes(member?.notes ?? '')
    setMemberOpen(true)
    setError('')
  }

  async function createTree(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || saving) return
    setSaving(true); setError(''); setNotice('')
    try {
      const { data, error: insertError } = await supabase.from('family_trees').insert({ owner_id: userId, name: treeName.trim(), description: treeDescription.trim() }).select('id').single()
      if (insertError) throw insertError
      setTreeName(''); setTreeDescription('')
      await load(data.id)
      setNotice('Your family tree has been created.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create this family tree.') }
    finally { setSaving(false) }
  }

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || saving || !treeId) return
    if (parentId && parentId === editing?.id) { setError('A person cannot be their own parent.'); return }
    setSaving(true); setError(''); setNotice('')
    const payload = { tree_id: treeId, owner_id: userId, full_name: fullName.trim(), relationship: relationship.trim(), phone: phone.trim(), email: email.trim().toLowerCase(), birth_date: birthDate || null, parent_member_id: parentId || null, notes: notes.trim() }
    try {
      const result = editing
        ? await supabase.from('family_tree_members').update(payload).eq('id', editing.id).eq('owner_id', userId)
        : await supabase.from('family_tree_members').insert(payload)
      if (result.error) throw result.error
      setMemberOpen(false)
      await load(treeId)
      setNotice(editing ? 'Family member updated.' : 'Family member added.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save family member.') }
    finally { setSaving(false) }
  }

  async function removeMember(member: Member) {
    if (!supabase || !window.confirm(`Remove ${member.full_name} from this family tree?`)) return
    setError(''); setNotice('')
    const { error: deleteError } = await supabase.from('family_tree_members').delete().eq('id', member.id).eq('owner_id', userId)
    if (deleteError) { setError(deleteError.message); return }
    await load(treeId)
    setNotice('Family member removed.')
  }

  const generations = useMemo(() => {
    const byId = new Map(members.map(m => [m.id, m]))
    const depthOf = (member: Member) => {
      let depth = 0, current = member, seen = new Set<string>()
      while (current.parent_member_id && byId.has(current.parent_member_id) && !seen.has(current.id)) {
        seen.add(current.id); current = byId.get(current.parent_member_id)!; depth++
        if (depth > 12) break
      }
      return depth
    }
    const grouped = new Map<number, Member[]>()
    members.forEach(m => { const d = depthOf(m); grouped.set(d, [...(grouped.get(d) ?? []), m]) })
    return [...grouped.entries()].sort((a,b) => a[0]-b[0])
  }, [members])

  return <section className="family-tree-module">
    <header className="family-tree-heading">
      <div><span className="eyebrow"><GitBranch size={14}/> YOUR FAMILY STORY</span><h2>Family Tree</h2><p>Bring generations together. Add relatives and connect each person to the people who came before them.</p></div>
      {treeId && <button className="dashboard-primary" type="button" onClick={() => openMember()}><Plus size={16}/> Add family member</button>}
    </header>

    {error && <p className="form-feedback form-error" role="alert">{error}</p>}
    {notice && <p className="form-feedback form-success" role="status">{notice}</p>}

    {trees.length > 0 && <div className="family-tree-toolbar">
      <label htmlFor="family-tree-select">Choose a family tree</label>
      <select id="family-tree-select" className="story-field" value={treeId} onChange={e => { setTreeId(e.target.value); void load(e.target.value) }}>
        {trees.map(tree => <option key={tree.id} value={tree.id}>{tree.name}</option>)}
      </select>
      <span>{members.length} {members.length === 1 ? 'person' : 'people'}</span>
    </div>}

    {trees.length === 0 && !loading && <form className="family-tree-create" onSubmit={createTree}>
      <span className="family-tree-icon"><Users size={25}/></span>
      <h3>Create your first family tree</h3>
      <p>Start with your family name, then add parents, children, siblings and other relatives.</p>
      <label htmlFor="family-tree-name">Family tree name</label>
      <input id="family-tree-name" className="story-field" required maxLength={120} value={treeName} onChange={e => setTreeName(e.target.value)} placeholder="e.g. The Kamara Family"/>
      <label htmlFor="family-tree-description">Description <span className="optional-label">Optional</span></label>
      <textarea id="family-tree-description" className="story-field" rows={2} maxLength={500} value={treeDescription} onChange={e => setTreeDescription(e.target.value)} placeholder="A short note about this family"/>
      <button className="dashboard-primary" disabled={saving} type="submit"><Plus size={16}/> {saving ? 'Creating…' : 'Create family tree'}</button>
    </form>}

    {trees.length > 0 && <div className="family-tree-canvas">
      <div className="family-tree-canvas-head"><div><span className="eyebrow">GENERATIONS</span><h3>{trees.find(t => t.id === treeId)?.name ?? 'Your family'}</h3></div><span className="family-tree-count">{members.length} members</span></div>
      {members.length === 0 ? <div className="family-tree-empty"><Users size={30}/><h3>Your family story starts here</h3><p>Add the first person, then connect relatives to build your family tree.</p><button className="dashboard-primary" type="button" onClick={() => openMember()}><Plus size={16}/> Add first person</button></div> :
        <div className="family-generation-list">{generations.map(([generation, people]) => <section className="family-generation" key={generation}>
          <div className="family-generation-label">GENERATION {generation + 1}</div>
          <div className="family-generation-people">{people.map(person => <article className="family-person-card" key={person.id}>
            <div className="family-person-avatar">{person.full_name.split(/\s+/).map(n => n[0]).slice(0,2).join('').toUpperCase()}</div>
            <div className="family-person-info"><h4>{person.full_name}</h4><span>{person.relationship || 'Family member'}</span>{person.birth_date && <small><CalendarDays size={12}/> {new Date(person.birth_date + 'T12:00:00').toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}</small>}{person.phone && <small><Phone size={12}/> {person.phone}</small>}{person.email && <small><Mail size={12}/> {person.email}</small>}</div>
            <div className="family-person-actions"><button type="button" aria-label={`Edit ${person.full_name}`} onClick={() => openMember(person)}><Pencil size={14}/></button><button type="button" aria-label={`Remove ${person.full_name}`} onClick={() => void removeMember(person)}><Trash2 size={14}/></button></div>
            {person.parent_member_id && byParentName(person.parent_member_id, members) && <span className="family-parent-link">Child of {byParentName(person.parent_member_id, members)}</span>}
          </article>)}</div>
        </section>)}</div>}
    </div>}

    <form className="family-tree-create family-tree-create-secondary" onSubmit={createTree}>
      <h3>Create another family tree</h3><div className="family-tree-inline"><input className="story-field" aria-label="New family tree name" required maxLength={120} value={treeName} onChange={e => setTreeName(e.target.value)} placeholder="Family tree name"/><button className="account-secondary-button" disabled={saving} type="submit"><Plus size={15}/> Create</button></div>
    </form>

    {memberOpen && <div className="family-tree-modal" onMouseDown={e => { if(e.target === e.currentTarget) setMemberOpen(false) }}><section className="family-tree-modal-panel" role="dialog" aria-modal="true" aria-labelledby="family-member-title">
      <button className="icon-button family-tree-close" type="button" onClick={() => setMemberOpen(false)} aria-label="Close"><X size={18}/></button>
      <span className="eyebrow">FAMILY DETAILS</span><h3 id="family-member-title">{editing ? 'Edit family member' : 'Add family member'}</h3>
      <form className="family-tree-form" onSubmit={saveMember}>
        <label htmlFor="family-person-name">Full name</label><input id="family-person-name" className="story-field" required maxLength={160} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Full name"/>
        <label htmlFor="family-person-relationship">Relationship</label><input id="family-person-relationship" className="story-field" maxLength={100} value={relationship} onChange={e => setRelationship(e.target.value)} placeholder="e.g. Mother, Grandfather, Daughter"/>
        <label htmlFor="family-person-parent">Connected to (parent)</label><select id="family-person-parent" className="story-field" value={parentId} onChange={e => setParentId(e.target.value)}><option value="">No parent selected / first generation</option>{members.filter(m => m.id !== editing?.id).map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select>
        <label htmlFor="family-person-phone">Mobile number</label><input id="family-person-phone" className="story-field" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+232…"/>
        <label htmlFor="family-person-email">Email address</label><input id="family-person-email" className="story-field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com"/>
        <label htmlFor="family-person-birth">Date of birth <span className="optional-label">Optional</span></label><input id="family-person-birth" className="story-field" type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}/>
        <label htmlFor="family-person-notes">Notes <span className="optional-label">Optional</span></label><textarea id="family-person-notes" className="story-field" rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything you'd like to remember about this person"/>
        <button className="dashboard-primary" disabled={saving} type="submit">{saving ? 'Saving…' : editing ? 'Save changes' : 'Add to family tree'}</button>
      </form>
    </section></div>}
  </section>
}

function byParentName(id: string, members: Member[]) { return members.find(m => m.id === id)?.full_name ?? '' }
