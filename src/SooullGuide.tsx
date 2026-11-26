import { useState } from 'react'
import { Bot, X, BookOpen, Users, ShieldCheck, FolderLock, Sparkles } from 'lucide-react'

const guidance = [
  { title: 'Write and preserve a story', icon: BookOpen, answer: 'Open Stories, choose “Write a story”, add a title and category, then write or dictate your memory. Save it when you are ready.' },
  { title: 'Build a family tree', icon: Users, answer: 'Open Family Tree and create a tree for your family. Add each person with their relationship and contact details. Choose a parent to connect generations.' },
  { title: 'Keep documents safely', icon: FolderLock, answer: 'Open Assets & Wallet to organise private files and personal reference records. Never store passwords, PINs or full card security details.' },
  { title: 'Prepare future access', icon: ShieldCheck, answer: 'Add trusted people first, then open Legacy Access. Choose the trigger and select exactly which eligible items each recipient may request. Access is not automatic; verification and review are required.' },
]
export function SooullGuide() {
  const [open, setOpen] = useState(false)
  const [answer, setAnswer] = useState('')
  return <aside className="sooull-guide" aria-label="SOOULL guide">
    {open && <section className="sooull-guide-panel" aria-label="Guide help panel">
      <header><div className="sooull-guide-avatar"><Bot size={22}/></div><div><strong>SOOULL Guide</strong><small>Your personal product companion</small></div><button type="button" onClick={() => setOpen(false)} aria-label="Close guide"><X size={17}/></button></header>
      <p className="sooull-guide-intro">What would you like help with?</p>
      <div className="sooull-guide-choices">{guidance.map(item => { const Icon=item.icon; return <button type="button" key={item.title} onClick={() => setAnswer(item.answer)}><Icon size={15}/>{item.title}</button> })}</div>
      {answer && <p className="sooull-guide-answer">{answer}</p>}
      <small className="sooull-guide-disclaimer">Guided help · No private account content is sent.</small>
    </section>}
    <button className="sooull-guide-trigger" type="button" aria-expanded={open} onClick={() => setOpen(v => !v)}><span className="sooull-guide-avatar"><Sparkles size={20}/></span><span>SOOULL Guide</span></button>
  </aside>
}
