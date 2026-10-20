import { useState } from 'react'
import { availableSlots, dateKey, reserve, services, type Booking } from './booking'
import './App.css'
const storageKey = 'slotiva.demo.v1'
function readBookings(): Booking[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(value) ? value.filter((b): b is Booking => b && ['id','serviceId','date','time','name','email'].every(k => typeof b[k] === 'string')) : []
  } catch { return [] }
}
const formatDate = (date: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`))
function App() {
  const [view, setView] = useState<'booking' | 'admin'>('booking')
  const [serviceId, setServiceId] = useState(services[0].id)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [bookings, setBookings] = useState<Booking[]>(readBookings)
  const [confirmed, setConfirmed] = useState<Booking | null>(null)
  const [error, setError] = useState('')
  const service = services.find(s => s.id === serviceId)!
  const [days] = useState(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i + 1); return d }).filter(d => ![0,6].includes(d.getDay())))
  function save(next: Booking[]) { localStorage.setItem(storageKey, JSON.stringify(next)); setBookings(next) }
  function cancel(id: string) { try { save(readBookings().filter(b => b.id !== id)); setConfirmed(null); setTime(''); setError('') } catch { setError('Não foi possível salvar. Verifique o armazenamento do navegador.') } }
  return <>
    <a className="skip" href="#main">Pular para o conteúdo</a>
    <header><a className="brand" href="#" onClick={() => setView('booking')}><span className="brand-icon">s</span>slotiva<span className="brand-dot">.</span></a><nav aria-label="Principal"><button aria-current={view === 'booking' ? 'page' : undefined} onClick={() => setView('booking')}>Agendar</button><button aria-current={view === 'admin' ? 'page' : undefined} onClick={() => { setBookings(readBookings()); setView('admin') }}>Minha agenda</button></nav><span className="demo">DEMONSTRAÇÃO</span></header>
    <main id="main">
      <section className="intro"><div className="eyebrow"><span /> SEU TEMPO, BEM CUIDADO</div><h1>Um espaço na agenda.<br /><span>Um passo à frente.</span></h1><p>Encontre o melhor momento para sua próxima conversa.<br />Simples de marcar. Fácil de organizar.</p></section>
      {error && <p className="error" role="alert">{error}</p>}
      {view === 'admin' ? <section className="panel admin"><div className="section-heading"><div><span className="eyebrow">ÁREA DE DEMONSTRAÇÃO</span><h2>Minha agenda</h2></div><span>{bookings.length} reservas</span></div><p>Dados fictícios, salvos apenas neste navegador. Sem autenticação nesta versão.</p>{bookings.length === 0 ? <div className="empty">Sua agenda está livre.<br /><button onClick={() => setView('booking')}>Criar uma reserva</button></div> : [...bookings].sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map(b => <article className="appointment" key={b.id}><div><strong>{formatDate(b.date)} · {b.time}</strong><p>{services.find(s => s.id === b.serviceId)?.name} · {b.name}</p></div><button className="text-button" onClick={() => cancel(b.id)}>Cancelar reserva</button></article>)}</section>
      : confirmed ? <section className="panel confirmation" aria-live="polite"><div className="check">✓</div><span className="eyebrow">TUDO COMBINADO</span><h2>Seu próximo passo está marcado.</h2><p>{confirmed.name}, sua reserva de demonstração foi salva.</p><div className="receipt"><strong>{services.find(s => s.id === confirmed.serviceId)?.name}</strong><p>{formatDate(confirmed.date)} às {confirmed.time}</p><small>Fuso: America/Sao_Paulo · Nenhum e-mail foi enviado.</small></div><button className="primary" onClick={() => { setConfirmed(null); setTime('') }}>Fazer outro agendamento</button><button className="text-button" onClick={() => cancel(confirmed.id)}>Cancelar esta reserva</button></section>
      : <div className="workspace"><aside className="profile"><div className="avatar">AC<span /></div><span className="eyebrow">PROFISSIONAL DEMONSTRATIVO</span><h2>Ana Costa</h2><p className="role">Consultora de carreira</p><p>Conversas com propósito para construir o seu próximo capítulo.</p><div className="profile-details"><span>◷ &nbsp; {service.duration} minutos</span><span>↗ &nbsp; Atendimento on-line</span><span>◎ &nbsp; Horário de Brasília</span></div><div className="note"><strong>Feito para acolher.</strong><p>Você pode navegar por toda a reserva usando o teclado.</p></div></aside>
      <section className="panel booking"><div className="section-heading"><h2>Reserve seu momento</h2><span className="step-label">3 PASSOS SIMPLES</span></div>
      <fieldset><legend><b>1</b> Escolha o serviço</legend><div className="services">{services.map(s => <label className={`service ${s.id === serviceId ? 'selected' : ''}`} key={s.id}><input type="radio" name="service" checked={s.id === serviceId} onChange={() => { setServiceId(s.id); setTime('') }} /><span><strong>{s.name}</strong><small>{s.duration} min · {s.price ? `R$ ${s.price},00` : 'Gratuito'}</small></span></label>)}</div><p className="hint">{service.description}</p></fieldset>
      <fieldset><legend><b>2</b> Encontre um horário</legend><div className="days" aria-label="Dias disponíveis">{days.map(d => { const key = dateKey(d); return <button type="button" key={key} aria-pressed={date === key} onClick={() => { setDate(key); setTime(''); setError('') }}><small>{d.toLocaleDateString('pt-BR',{weekday:'short'})}</small><strong>{d.getDate()}</strong><small>{d.toLocaleDateString('pt-BR',{month:'short'})}</small></button> })}</div>{date ? <div className="slots" aria-label="Horários disponíveis">{availableSlots(bookings,date).length ? availableSlots(bookings,date).map(t => <button key={t} type="button" aria-pressed={time === t} onClick={() => setTime(t)}>{t}</button>) : <p role="status">Este dia está completo. Escolha outro dia.</p>}</div> : <p className="hint">Selecione um dia para ver os horários disponíveis.</p>}</fieldset>
      <form onSubmit={event => { event.preventDefault(); setError(''); if (!date || !time) { setError('Selecione um dia e um horário antes de confirmar.'); return } const data = new FormData(event.currentTarget); const booking: Booking = { id: crypto.randomUUID(), serviceId, date, time, name: String(data.get('name')).trim(), email: String(data.get('email')).trim() }; try { save(reserve(readBookings(),booking)); setConfirmed(booking) } catch(e) { setBookings(readBookings()); setError(e instanceof Error ? e.message : 'Não foi possível salvar a reserva.') } }}><fieldset><legend><b>3</b> Seus dados</legend><div className="fields"><label>Nome<input name="name" autoComplete="name" placeholder="Como podemos chamar você?" required maxLength={100} /></label><label>E-mail<input name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" required maxLength={200} /></label></div></fieldset><div className="submit-row"><p>{date && time ? `${formatDate(date)} · ${time}` : 'Seu próximo passo começa aqui.'}<small>Use dados fictícios nesta demonstração.</small></p><button className="primary" type="submit">Confirmar reserva <span>↗</span></button></div></form>
      </section></div>}
    </main><footer><span>slotiva. <span className="footer-muted">Agendamento simples, acesso para todos.</span></span><span>React + TypeScript · Demo local</span></footer>
  </>
}
export default App
