// src/pages/tools/ComprasTool.jsx
// Herramienta completa de Control de Compras conectada a Supabase

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabaseClient'

// ─── DESIGN TOKENS ────────────────────────────────────────────
const C = {
  bg:'#F4F6F9', card:'#FFFFFF', border:'#E2E6EA', borderDark:'#2A2D35',
  text:'#1A1D23', textSub:'#6B7280', textMuted:'#9CA3AF',
  accent:'#2563EB', accentHover:'#1D4ED8', accentLight:'#EFF6FF',
  success:'#16A34A', successLight:'#F0FDF4',
  warning:'#D97706', warningLight:'#FFFBEB',
  danger:'#DC2626', dangerLight:'#FEF2F2',
}

// ─── UTILS ────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10)
const daysDiff = (from) => { if (!from) return 0; return Math.floor((new Date() - new Date(from)) / 86400000) }
const fmt = (d) => d ? new Date(d).toLocaleDateString('es-MX') : '—'
const detectTipo = (f) => { if (!f) return ''; if (f.toUpperCase().startsWith('C') || f.toUpperCase().startsWith('OC')) return 'OC STOCK'; if (f.toUpperCase().startsWith('RC')) return 'RC'; return '' }
const getFlow = (cfg, te) => cfg.filter(r => r.tipo_envio === te).sort((a, b) => a.secuencia - b.secuencia)
const isFinal = (cfg, te, es) => {
  if (es === 'Rechazado') return true
  const f = getFlow(cfg, te).filter(r => r.estatus !== 'Rechazado')
  return f.length ? es === f[f.length - 1].estatus : false
}
const calcAlerta = (o, cfg) => {
  if (!o.estatus_actual || !o.tipo_envio || !o.fecha_estatus_actual) return null
  if (isFinal(cfg, o.tipo_envio, o.estatus_actual)) return null
  const r = cfg.find(x => x.tipo_envio === o.tipo_envio && x.estatus === o.estatus_actual)
  if (!r) return null
  const dias = daysDiff(o.fecha_estatus_actual)
  let extra = 0
  if (r.usa_prod) extra += Number(o.dias_produccion_orden) || 0
  if (r.usa_trans) extra += Number(o.dias_transito_orden) || 0
  const limPrev = r.sla_prev + extra, limCrit = r.sla_crit + extra
  const nivel = dias >= limCrit ? 'CRITICO' : dias >= limPrev ? 'PREVENTIVO' : 'OK'
  return { dias, limPrev, limCrit, nivel, regla: r }
}

// ─── SHARED COMPONENTS ────────────────────────────────────────
const Badge = ({ level }) => {
  const cfg = { CRITICO:[C.danger,'#fff'], PREVENTIVO:[C.warning,'#fff'], OK:[C.success,'#fff'], CERRADA:['#7C3AED','#fff'] }
  const [bg, fg] = cfg[level] || ['#E5E7EB', C.text]
  return <span style={{ background:bg, color:fg, borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:700, letterSpacing:.5 }}>{level}</span>
}

const Card = ({ children, style, padding=20, onClick }) => (
  <div onClick={onClick} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding, ...style }}>{children}</div>
)

const inputStyle = (err) => ({
  background:'#fff', border:`1.5px solid ${err ? C.danger : C.border}`, borderRadius:6,
  color:C.text, padding:'8px 12px', fontSize:13, width:'100%', outline:'none',
  fontFamily:'inherit', transition:'border-color .15s', boxSizing:'border-box'
})

const Input = ({ value, onChange, type='text', error, placeholder, disabled }) => (
  <input type={type} value={value||''} onChange={e=>onChange(e.target.value)}
    placeholder={placeholder} disabled={disabled} style={{ ...inputStyle(error), opacity:disabled?.6:1 }}
    onFocus={e=>{ if(!disabled) e.target.style.borderColor=C.accent }}
    onBlur={e=>e.target.style.borderColor=error?C.danger:C.border}/>
)

const Select = ({ value, onChange, options, placeholder, error, disabled }) => (
  <select value={value||''} onChange={e=>onChange(e.target.value)} disabled={disabled}
    style={{ ...inputStyle(error), cursor:disabled?'not-allowed':'pointer', opacity:disabled?.6:1 }}>
    {placeholder && <option value=''>{placeholder}</option>}
    {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
  </select>
)

const Btn = ({ onClick, children, variant='primary', size='md', disabled, style }) => {
  const variants = {
    primary:{ background:C.accent, color:'#fff', border:'none' },
    secondary:{ background:'#fff', color:C.text, border:`1.5px solid ${C.border}` },
    danger:{ background:C.danger, color:'#fff', border:'none' },
  }
  const sizes = { sm:{ padding:'5px 10px', fontSize:12 }, md:{ padding:'8px 16px', fontSize:13 } }
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...variants[variant], ...sizes[size], borderRadius:6, fontWeight:600, cursor:disabled?'not-allowed':'pointer', display:'inline-flex', alignItems:'center', gap:6, fontFamily:'inherit', opacity:disabled?.6:1, ...style }}>
      {children}
    </button>
  )
}

const FormField = ({ label, error, children }) => (
  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
    <label style={{ fontSize:12, fontWeight:600, color:C.textSub, textTransform:'uppercase', letterSpacing:.5 }}>{label}</label>
    {children}
    {error && <span style={{ fontSize:11, color:C.danger }}>{error}</span>}
  </div>
)

const Th = ({ children }) => <th style={{ padding:'10px 14px', textAlign:'left', fontSize:11, color:C.textSub, fontWeight:700, background:'#F8FAFC', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:.5 }}>{children}</th>
const Td = ({ children, style }) => <td style={{ padding:'10px 14px', fontSize:13, color:C.text, borderBottom:`1px solid ${C.border}`, verticalAlign:'middle', ...style }}>{children}</td>

// ─── MAIN COMPONENT ───────────────────────────────────────────
export default function ComprasTool() {
  const [tab, setTab] = useState('ordenes')
  const [cfg, setCfg] = useState({ estatus:[], proveedores:[], transito:[], usuarios:[] })
  const [ordenes, setOrdenes] = useState([])
  const [logEstatus, setLogEstatus] = useState([])
  const [logVariables, setLogVariables] = useState([])
  const [logNotif, setLogNotif] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Cargar datos desde Supabase ──────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [est, prov, trans, usu, ords, logEst, logVar, logN] = await Promise.all([
        supabase.from('cfg_estatus').select('*').order('tipo_envio').order('secuencia'),
        supabase.from('cfg_proveedores').select('*').eq('activo', true),
        supabase.from('cfg_transito').select('*').eq('activo', true),
        supabase.from('cfg_usuarios').select('*').eq('activo', true),
        supabase.from('ordenes').select('*').order('created_at', { ascending:false }),
        supabase.from('log_estatus').select('*').order('created_at', { ascending:false }).limit(200),
        supabase.from('log_variables').select('*').order('created_at', { ascending:false }).limit(200),
        supabase.from('log_notificaciones').select('*').order('created_at', { ascending:false }).limit(200),
      ])
      setCfg({ estatus: est.data||[], proveedores: prov.data||[], transito: trans.data||[], usuarios: usu.data||[] })
      setOrdenes(ords.data||[])
      setLogEstatus(logEst.data||[])
      setLogVariables(logVar.data||[])
      setLogNotif(logN.data||[])
    } catch(e) {
      setError('Error al cargar datos: ' + e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const alertCount = ordenes.filter(o => { const a = calcAlerta(o, cfg.estatus); return a && a.nivel !== 'OK' }).length

  const tabs = [
    { id:'ordenes', label:'Órdenes' },
    { id:'alertas', label:`Alertas${alertCount>0?` (${alertCount})`:''}` },
    { id:'dashboard', label:'Dashboard' },
    { id:'logs', label:'Registros' },
    { id:'config', label:'Configuración' },
  ]

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:C.textMuted, fontSize:14 }}>
      Cargando datos...
    </div>
  )

  if (error) return (
    <div style={{ background:C.dangerLight, border:`1px solid #FECACA`, borderRadius:8, padding:20, color:C.danger, fontSize:13 }}>
      {error} — <button onClick={fetchAll} style={{ color:C.accent, background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Reintentar</button>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ margin:'0 0 4px', fontSize:20, fontWeight:800, color:C.text }}>Control de Compras</h1>
          <div style={{ fontSize:13, color:C.textSub }}>{ordenes.length} órdenes · actualizado {fmt(today())}</div>
        </div>
        <Btn onClick={fetchAll} variant='secondary' size='sm'>↻ Actualizar</Btn>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, borderBottom:`1px solid ${C.border}`, marginBottom:24 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'9px 16px', border:'none', background:'transparent',
            color: tab===t.id ? C.accent : C.textSub,
            fontWeight: tab===t.id ? 700 : 400,
            borderBottom: tab===t.id ? `2px solid ${C.accent}` : '2px solid transparent',
            cursor:'pointer', fontSize:13, fontFamily:'inherit'
          }}>{t.label}</button>
        ))}
      </div>

      {tab==='ordenes'   && <TabOrdenes cfg={cfg} ordenes={ordenes} onRefresh={fetchAll}/>}
      {tab==='alertas'   && <TabAlertas cfg={cfg} ordenes={ordenes} logNotif={logNotif} onRefresh={fetchAll}/>}
      {tab==='dashboard' && <TabDashboard cfg={cfg} ordenes={ordenes}/>}
      {tab==='logs'      && <TabLogs logEstatus={logEstatus} logVariables={logVariables} logNotif={logNotif}/>}
      {tab==='config'    && <TabConfig cfg={cfg} onRefresh={fetchAll}/>}
    </div>
  )
}

// ─── TAB ÓRDENES ──────────────────────────────────────────────
function TabOrdenes({ cfg, ordenes, onRefresh }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const tiposEnvio = [...new Set(cfg.estatus.map(r => r.tipo_envio))]
  const compradores = cfg.usuarios.filter(u => u.rol === 'Compras').map(u => u.nombre)
  const trafico    = cfg.usuarios.filter(u => u.rol === 'Trafico').map(u => u.nombre)
  const marcas     = cfg.proveedores.map(p => p.marca)
  const origenes   = [...new Set(cfg.transito.filter(r => r.tipo_envio === form.tipo_envio).map(r => r.origen))]
  const flowActual = getFlow(cfg.estatus, form.tipo_envio)
  const estatusOpts = flowActual.map(r => r.estatus)

  const validate = () => {
    const e = {}
    if (!form.folio) e.folio = 'El folio es obligatorio'
    else if (!/^(OC|RC)/i.test(form.folio)) e.folio = 'Debe iniciar con OC o RC'
    if (!form.tipo_envio) e.tipo_envio = 'Selecciona un tipo de envío'
    if (!form.comprador_nombre) e.comprador_nombre = 'Asigna un comprador'
    if (!form.estatus_actual) e.estatus_actual = 'Define el estatus'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const setF = (k, v) => setForm(p => {
    const n = { ...p, [k]: v }
    if (errors[k]) setErrors(pe => ({ ...pe, [k]: undefined }))
    if (k === 'folio') n.tipo_documento = detectTipo(v)
    if (k === 'marca') {
      const prov = cfg.proveedores.find(x => x.marca === v)
      if (prov) { n.dias_produccion_default = prov.dias_produccion_default; if (!n.dias_produccion_orden) n.dias_produccion_orden = prov.dias_produccion_default }
    }
    if (k === 'tipo_envio' || k === 'origen') {
      const te = k==='tipo_envio' ? v : n.tipo_envio
      const or = k==='origen' ? v : n.origen
      const tr = cfg.transito.find(x => x.tipo_envio===te && x.origen===or)
      if (tr) { n.dias_transito_default = tr.dias_trans; if (!n.dias_transito_orden) n.dias_transito_orden = tr.dias_trans }
      if (k==='tipo_envio' && !n.estatus_actual) {
        const fl = getFlow(cfg.estatus, v)
        if (fl.length) { n.estatus_actual = fl[0].estatus; n.fecha_estatus_actual = today() }
      }
    }
    return n
  })

  const openNew = () => { setForm({ fecha_creacion_registro: today() }); setEditing(null); setErrors({}); setShowForm(true) }
  const openEdit = (o) => { setForm({...o}); setEditing(o.id); setErrors({}); setShowForm(true) }
  const cancel = () => { setShowForm(false); setErrors({}) }

  const saveOrden = async () => {
    if (!validate()) return
    setSaving(true)
    const prev = ordenes.find(o => o.id === editing)

    // Validar no retroceso
    if (prev && prev.estatus_actual && prev.estatus_actual !== form.estatus_actual) {
      const ps = flowActual.find(r => r.estatus === prev.estatus_actual)
      const ns = flowActual.find(r => r.estatus === form.estatus_actual)
      if (ps && ns && ns.secuencia < ps.secuencia) { alert('No se permite retroceder el estatus.'); setSaving(false); return }
    }

    // Calcular total días si es estatus final
    const payload = { ...form }
    if (isFinal(cfg.estatus, form.tipo_envio, form.estatus_actual) && form.fecha_creacion_registro) {
      payload.total_dias_orden = daysDiff(form.fecha_creacion_registro)
    }

    // Overrides
    if (prev && Number(form.dias_produccion_orden) > Number(form.dias_produccion_default||0) && Number(form.dias_produccion_orden) !== Number(prev.dias_produccion_orden)) {
      payload.prod_override_count = (Number(prev.prod_override_count)||0) + 1
      payload.diferencia_produccion = Math.max(0, Number(form.dias_produccion_orden) - Number(form.dias_produccion_default))
      await supabase.from('log_variables').insert({ orden_id: editing, folio: form.folio, variable:'Produccion', valor_anterior: String(prev.dias_produccion_orden), valor_nuevo: String(form.dias_produccion_orden), usuario:'Sistema' })
    } else { payload.diferencia_produccion = 0 }

    if (prev && Number(form.dias_transito_orden) > Number(form.dias_transito_default||0) && Number(form.dias_transito_orden) !== Number(prev.dias_transito_orden)) {
      payload.trans_override_count = (Number(prev.trans_override_count)||0) + 1
      payload.diferencia_transito = Math.max(0, Number(form.dias_transito_orden) - Number(form.dias_transito_default))
      await supabase.from('log_variables').insert({ orden_id: editing, folio: form.folio, variable:'Transito', valor_anterior: String(prev.dias_transito_orden), valor_nuevo: String(form.dias_transito_orden), usuario:'Sistema' })
    } else { payload.diferencia_transito = 0 }

    payload.updated_at = new Date().toISOString()

    if (editing) {
      await supabase.from('ordenes').update(payload).eq('id', editing)
    } else {
      const { data } = await supabase.from('ordenes').insert(payload).select().single()
      if (data && form.estatus_actual) {
        await supabase.from('log_estatus').insert({ orden_id: data.id, folio: form.folio, tipo_envio: form.tipo_envio, estatus: form.estatus_actual, usuario:'Sistema' })
      }
    }

    // Log estatus si cambió
    if (editing && prev && prev.estatus_actual !== form.estatus_actual && form.estatus_actual) {
      await supabase.from('log_estatus').insert({ orden_id: editing, folio: form.folio, tipo_envio: form.tipo_envio, estatus: form.estatus_actual, usuario:'Sistema' })
    }

    await onRefresh()
    setSaving(false)
    setShowForm(false)
  }

  const delOrden = async (id) => {
    if (!confirm('¿Eliminar esta orden? Se borrarán también sus logs.')) return
    await supabase.from('ordenes').delete().eq('id', id)
    await onRefresh()
  }

  const filtered = ordenes.filter(o =>
    !search || [o.folio, o.tipo_documento, o.tipo_envio, o.marca, o.estatus_actual, o.comprador_nombre]
      .some(v => v && v.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <span style={{ fontWeight:700, fontSize:15, color:C.text }}>Órdenes ({ordenes.length})</span>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Buscar...'
            style={{ ...inputStyle(false), width:200, padding:'7px 12px' }}/>
          <Btn onClick={openNew}>+ Nueva Orden</Btn>
        </div>
      </div>

      {showForm && (
        <Card style={{ marginBottom:24 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:C.text }}>{editing ? 'Editar Orden' : 'Nueva Orden'}</h3>
            <button onClick={cancel} style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:18, color:C.textSub }}>×</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:16 }}>
            <FormField label='Folio *' error={errors.folio}><Input value={form.folio} onChange={v=>setF('folio',v)} placeholder='OC-001 / RC-001' error={errors.folio}/></FormField>
            <FormField label='Tipo Documento'><Input value={form.tipo_documento} onChange={()=>{}} disabled style={{ color:C.accent, fontWeight:700 }}/></FormField>
            <FormField label='Tipo Envío *' error={errors.tipo_envio}><Select value={form.tipo_envio} onChange={v=>setF('tipo_envio',v)} options={tiposEnvio} placeholder='Selecciona...' error={errors.tipo_envio}/></FormField>
            <FormField label='Origen'><Select value={form.origen} onChange={v=>setF('origen',v)} options={origenes} placeholder='Selecciona...'/></FormField>
            <FormField label='Marca'><Select value={form.marca} onChange={v=>setF('marca',v)} options={marcas} placeholder='Selecciona...'/></FormField>
            <FormField label='Comprador *' error={errors.comprador_nombre}><Select value={form.comprador_nombre} onChange={v=>setF('comprador_nombre',v)} options={compradores} placeholder='Selecciona...' error={errors.comprador_nombre}/></FormField>
            <FormField label='Tráfico'><Select value={form.trafico_nombre} onChange={v=>setF('trafico_nombre',v)} options={trafico} placeholder='Selecciona...'/></FormField>
            <FormField label='Estatus Actual *' error={errors.estatus_actual}><Select value={form.estatus_actual} onChange={v=>setF('estatus_actual',v)} options={estatusOpts} placeholder='Selecciona...' error={errors.estatus_actual}/></FormField>
            <FormField label='Fecha Estatus'><Input type='date' value={form.fecha_estatus_actual} onChange={v=>setF('fecha_estatus_actual',v)}/></FormField>
            <FormField label={`Días Producción (def: ${form.dias_produccion_default||'—'})`}><Input type='number' value={form.dias_produccion_orden} onChange={v=>setF('dias_produccion_orden',v)}/></FormField>
            <FormField label={`Días Tránsito (def: ${form.dias_transito_default||'—'})`}><Input type='number' value={form.dias_transito_orden} onChange={v=>setF('dias_transito_orden',v)}/></FormField>
            <FormField label='Observaciones' style={{ gridColumn:'1/-1' }}><Input value={form.observaciones} onChange={v=>setF('observaciones',v)} placeholder='Notas adicionales...'/></FormField>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:20, paddingTop:16, borderTop:`1px solid ${C.border}` }}>
            <Btn onClick={saveOrden} disabled={saving}>{saving ? 'Guardando...' : '💾 Guardar'}</Btn>
            <Btn onClick={cancel} variant='secondary'>Cancelar</Btn>
          </div>
        </Card>
      )}

      <Card padding={0}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr><Th>Folio</Th><Th>Tipo Doc.</Th><Th>Tipo Envío</Th><Th>Marca</Th><Th>Comprador</Th><Th>Estatus</Th><Th>Días</Th><Th>Alerta</Th><Th>Acciones</Th></tr></thead>
            <tbody>
              {filtered.length===0 && <tr><Td colSpan={9} style={{ textAlign:'center', color:C.textMuted, padding:40 }}>{search ? 'Sin resultados.' : 'No hay órdenes. Crea la primera.'}</Td></tr>}
              {filtered.map(o => {
                const al = calcAlerta(o, cfg.estatus)
                return (
                  <tr key={o.id} onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <Td><span style={{ fontWeight:700, color:C.accent }}>{o.folio}</span></Td>
                    <Td><span style={{ fontSize:11, background:C.accentLight, color:C.accent, borderRadius:4, padding:'2px 6px', fontWeight:600 }}>{o.tipo_documento}</span></Td>
                    <Td>{o.tipo_envio}</Td><Td>{o.marca||'—'}</Td><Td>{o.comprador_nombre||'—'}</Td>
                    <Td style={{ fontSize:12 }}>{o.estatus_actual||'—'}</Td>
                    <Td style={{ fontWeight:600, color:al?(al.nivel==='CRITICO'?C.danger:al.nivel==='PREVENTIVO'?C.warning:C.success):C.textMuted }}>
                      {al ? `${al.dias}d` : o.total_dias_orden ? `✓ ${o.total_dias_orden}d` : '—'}
                    </Td>
                    <Td>{al ? <Badge level={al.nivel}/> : o.total_dias_orden ? <Badge level='OK'/> : '—'}</Td>
                    <Td>
                      <div style={{ display:'flex', gap:6 }}>
                        <Btn onClick={()=>openEdit(o)} variant='secondary' size='sm'>✏️ Editar</Btn>
                        <Btn onClick={()=>delOrden(o.id)} variant='danger' size='sm'>🗑️</Btn>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ─── TAB ALERTAS ──────────────────────────────────────────────
function TabAlertas({ cfg, ordenes, logNotif, onRefresh }) {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const alertas = ordenes.map(o => {
    const al = calcAlerta(o, cfg.estatus)
    if (!al) return null
    const resp = cfg.usuarios.find(u => u.rol === al.regla.rol_responsable)
    return { ...o, ...al, responsable_nombre: resp?.nombre||'—', responsable_email: resp?.email||'', jefe_email: resp?.jefe_email||'' }
  }).filter(Boolean)

  const canSend = (o) => !o.ultima_alerta_fecha || daysDiff(o.ultima_alerta_fecha) >= 2

  const buildHTML = (a) => `<div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #E2E6EA;border-radius:10px;overflow:hidden">
    <div style="background:#1A1D23;padding:20px 24px"><div style="color:#fff;font-weight:700;font-size:16px">ComprasOps — Alerta de Orden</div></div>
    <div style="padding:24px;background:#fff">
      <div style="background:${a.nivel==='CRITICO'?'#FEF2F2':'#FFFBEB'};border-radius:8px;padding:12px 16px;margin-bottom:20px">
        <div style="font-weight:700;color:${a.nivel==='CRITICO'?'#DC2626':'#D97706'}">${a.nivel} — Atención requerida</div>
        <div style="color:#6B7280;font-size:12px;margin-top:4px">Han transcurrido ${a.dias} días en el estatus actual</div>
      </div>
      <p><strong>Folio:</strong> ${a.folio}</p>
      <p><strong>Tipo:</strong> ${a.tipo_documento} · ${a.tipo_envio}</p>
      <p><strong>Estatus:</strong> ${a.estatus_actual}</p>
      <p><strong>Límite preventivo:</strong> ${a.limPrev} días · <strong>Límite crítico:</strong> ${a.limCrit} días</p>
    </div>
    <div style="padding:12px 24px;background:#F8FAFC;font-size:11px;color:#9CA3AF">Sistema de Control de Compras</div></div>`

  const run = async () => {
    setSending(true); setResult(null)
    let sent=0, skipped=0, errors=0
    for (const a of alertas) {
      if (a.nivel==='OK' || !canSend(a)) { skipped++; continue }
      const subj = `[${a.nivel}] Folio ${a.folio} — ${a.estatus_actual}`

      if (!a.responsable_email) { errors++; continue }
      try {
        const res = await fetch('https://ntxzsmlztrmhoxgrxnbc.supabase.co/functions/v1/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
          body: JSON.stringify({
            to: [a.responsable_email],
            cc: a.nivel === 'CRITICO' && a.jefe_email ? [a.jefe_email] : [],
            subject: subj,
            html: buildHTML(a),
          }),
        })
        if (!res.ok) { errors++; continue }
      } catch { errors++; continue }

      await supabase.from('log_notificaciones').insert({
        orden_id: a.id, folio: a.folio, estatus: a.estatus_actual, nivel: a.nivel,
        para: a.responsable_email, cc: a.nivel==='CRITICO' ? a.jefe_email : '', asunto: subj, dry_run: false
      })
      await supabase.from('ordenes').update({ ultima_alerta_fecha: today(), ultima_alerta_nivel: a.nivel }).eq('id', a.id)
      sent++
    }
    await onRefresh()
    setSending(false)
    setResult({ sent, skipped, errors })
  }

  const cnt = { C: alertas.filter(a=>a.nivel==='CRITICO').length, P: alertas.filter(a=>a.nivel==='PREVENTIVO').length, O: alertas.filter(a=>a.nivel==='OK').length }

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:20 }}>
        {[['Críticas',cnt.C,C.danger,C.dangerLight],['Preventivas',cnt.P,C.warning,C.warningLight],['En tiempo',cnt.O,C.success,C.successLight]].map(([l,n,col,bg])=>(
          <Card key={l} style={{ display:'flex', alignItems:'center', gap:14, borderColor:col }}>
            <div style={{ width:44,height:44,borderRadius:10,background:bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22 }}>
              {l==='Críticas'?'🔴':l==='Preventivas'?'🟡':'🟢'}
            </div>
            <div><div style={{ fontSize:28,fontWeight:800,color:col }}>{n}</div><div style={{ fontSize:12,color:C.textSub }}>{l}</div></div>
          </Card>
        ))}
      </div>

      <Card style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
          <Btn onClick={run} disabled={sending}>{sending ? 'Enviando...' : '📧 Enviar correos'}</Btn>
          {result && <span style={{ fontSize:12,color:result.errors?C.danger:C.success,background:'#F8FAFC',border:`1px solid ${result.errors?C.danger:C.border}`,borderRadius:6,padding:'6px 12px' }}>{result.sent} enviadas · {result.skipped} omitidas{result.errors ? ` · ${result.errors} con error` : ''}</span>}
        </div>
      </Card>

      <Card padding={0}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead><tr><Th>Folio</Th><Th>Tipo Envío</Th><Th>Estatus</Th><Th>Días</Th><Th>Lím. Prev.</Th><Th>Lím. Crít.</Th><Th>Nivel</Th><Th>Responsable</Th><Th>Última alerta</Th></tr></thead>
            <tbody>
              {alertas.length===0 && <tr><Td colSpan={9} style={{ textAlign:'center',padding:40,color:C.textMuted }}>Sin alertas activas.</Td></tr>}
              {alertas.map(a=>(
                <tr key={a.id} onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <Td><span style={{ fontWeight:700,color:C.accent }}>{a.folio}</span></Td>
                  <Td>{a.tipo_envio}</Td><Td style={{ fontSize:12 }}>{a.estatus_actual}</Td>
                  <Td><span style={{ fontWeight:700,color:a.nivel==='CRITICO'?C.danger:a.nivel==='PREVENTIVO'?C.warning:C.success }}>{a.dias}d</span></Td>
                  <Td>{a.limPrev}d</Td><Td>{a.limCrit}d</Td>
                  <Td><Badge level={a.nivel}/></Td>
                  <Td>{a.responsable_nombre}</Td>
                  <Td style={{ color:C.textMuted,fontSize:12 }}>{a.ultima_alerta_fecha ? fmt(a.ultima_alerta_fecha) : 'Nunca'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ─── TAB DASHBOARD ────────────────────────────────────────────
function TabDashboard({ cfg, ordenes }) {
  const [filters, setFilters] = useState({ tipo_envio:null, comprador:null, marca:null, nivel:null })
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 8

  const enriched = ordenes.map(o => {
    const al = calcAlerta(o, cfg.estatus)
    return { ...o, nivel: al ? al.nivel : (o.total_dias_orden ? 'CERRADA' : 'OK'), dias: al ? al.dias : 0, limPrev: al ? al.limPrev : 0, limCrit: al ? al.limCrit : 0 }
  })

  const applyFilters = (rows) => rows.filter(o =>
    (!filters.tipo_envio || o.tipo_envio === filters.tipo_envio) &&
    (!filters.comprador  || o.comprador_nombre === filters.comprador) &&
    (!filters.marca      || o.marca === filters.marca) &&
    (!filters.nivel      || o.nivel === filters.nivel)
  )
  const filtered = applyFilters(enriched)
  const toggle = (key, val) => { setFilters(p => ({ ...p, [key]: p[key]===val ? null : val })); setPage(0) }
  const hasFilter = Object.values(filters).some(Boolean)

  const count = (arr, key) => arr.reduce((a,o) => { const v=o[key]||'—'; a[v]=(a[v]||0)+1; return a }, {})
  const byNivel     = count(filtered, 'nivel')
  const byMarca     = count(filtered, 'marca')
  const byTipo      = count(filtered, 'tipo_envio')
  const byComprador = count(filtered, 'comprador_nombre')
  const byEstatus   = count(filtered, 'estatus_actual')

  const NIVEL_COLOR = { CRITICO:C.danger, PREVENTIVO:C.warning, OK:C.success, CERRADA:'#7C3AED' }
  const criticos    = filtered.filter(o=>o.nivel==='CRITICO').length
  const preventivos = filtered.filter(o=>o.nivel==='PREVENTIVO').length
  const cerradas    = filtered.filter(o=>o.nivel==='CERRADA').length
  const tableRows   = filtered.slice(page*PAGE_SIZE, (page+1)*PAGE_SIZE)
  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE)

  return (
    <div>
      {hasFilter && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:C.textSub, fontWeight:600 }}>Filtros:</span>
          {Object.entries(filters).map(([k,v]) => v ? (
            <span key={k} onClick={()=>toggle(k,v)} style={{ display:'flex',alignItems:'center',gap:4,background:C.accentLight,color:C.accent,border:`1px solid #BFDBFE`,borderRadius:20,padding:'3px 10px',fontSize:12,fontWeight:600,cursor:'pointer' }}>
              {v} ×
            </span>
          ) : null)}
          <button onClick={()=>setFilters({tipo_envio:null,comprador:null,marca:null,nivel:null})} style={{ fontSize:12,color:C.danger,background:'transparent',border:'none',cursor:'pointer',fontWeight:600 }}>Limpiar</button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
        {[['Total filtradas',filtered.length,C.accent,C.accentLight,null,null],['Críticas',criticos,C.danger,C.dangerLight,'nivel','CRITICO'],['Preventivas',preventivos,C.warning,C.warningLight,'nivel','PREVENTIVO'],['Cerradas',cerradas,'#7C3AED','#F5F3FF','nivel','CERRADA']].map(([label,value,color,bg,fk,fv])=>(
          <Card key={label} onClick={fk?()=>toggle(fk,fv):undefined} style={{ display:'flex',alignItems:'center',gap:14,cursor:fk?'pointer':'default',border:`1.5px solid ${filters[fk]===fv?color:C.border}`,transition:'all .15s' }}>
            <div style={{ width:44,height:44,borderRadius:10,background:bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20 }}>
              {label==='Total filtradas'?'📦':label==='Críticas'?'🔴':label==='Preventivas'?'🟡':'✅'}
            </div>
            <div><div style={{ fontSize:26,fontWeight:800,color,lineHeight:1 }}>{value}</div><div style={{ fontSize:12,color:C.textSub,marginTop:3 }}>{label}</div></div>
          </Card>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'200px 1fr 1fr', gap:14, marginBottom:14 }}>
        <Card style={{ display:'flex',flexDirection:'column',alignItems:'center' }}>
          <div style={{ fontSize:12,fontWeight:700,color:C.text,marginBottom:12,alignSelf:'flex-start' }}>Por nivel</div>
          {Object.entries(byNivel).map(([k,v])=>(
            <div key={k} onClick={()=>toggle('nivel',k)} style={{ display:'flex',alignItems:'center',gap:6,cursor:'pointer',padding:'4px 6px',borderRadius:5,background:filters.nivel===k?'#F1F5F9':'transparent',width:'100%',marginBottom:4 }}>
              <div style={{ width:10,height:10,borderRadius:'50%',background:NIVEL_COLOR[k]||C.textMuted,flexShrink:0 }}/>
              <span style={{ fontSize:12,color:C.textSub,flex:1 }}>{k}</span>
              <span style={{ fontSize:12,fontWeight:700,color:C.text }}>{v}</span>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{ fontSize:12,fontWeight:700,color:C.text,marginBottom:12 }}>Por Marca</div>
          <HorizBar data={Object.entries(byMarca).map(([k,v])=>({label:k,value:v}))} color={C.accent} onClick={(l)=>toggle('marca',l)} active={filters.marca}/>
        </Card>
        <Card>
          <div style={{ fontSize:12,fontWeight:700,color:C.text,marginBottom:12 }}>Por Tipo de Envío</div>
          <HorizBar data={Object.entries(byTipo).map(([k,v])=>({label:k,value:v}))} color='#7C3AED' onClick={(l)=>toggle('tipo_envio',l)} active={filters.tipo_envio}/>
        </Card>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <Card>
          <div style={{ fontSize:12,fontWeight:700,color:C.text,marginBottom:12 }}>Por Comprador</div>
          <HorizBar data={Object.entries(byComprador).map(([k,v])=>({label:k,value:v}))} color={C.accent} onClick={(l)=>toggle('comprador',l)} active={filters.comprador}/>
        </Card>
        <Card>
          <div style={{ fontSize:12,fontWeight:700,color:C.text,marginBottom:12 }}>Por Estatus</div>
          <HorizBar data={Object.entries(byEstatus).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({label:k,value:v}))} color='#0891B2' onClick={()=>{}} active={null} truncate={30}/>
        </Card>
      </div>

      <Card padding={0}>
        <div style={{ padding:'12px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div style={{ fontSize:12,fontWeight:700,color:C.text }}>Detalle ({filtered.length})</div>
          {totalPages>1 && (
            <div style={{ display:'flex',alignItems:'center',gap:8,fontSize:12,color:C.textSub }}>
              {page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,filtered.length)} de {filtered.length}
              <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} style={{ border:`1px solid ${C.border}`,background:'#fff',borderRadius:4,width:26,height:26,cursor:'pointer' }}>‹</button>
              <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page>=totalPages-1} style={{ border:`1px solid ${C.border}`,background:'#fff',borderRadius:4,width:26,height:26,cursor:'pointer' }}>›</button>
            </div>
          )}
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead><tr><Th>Folio</Th><Th>Estatus</Th><Th>Días</Th><Th>Lím. Prev.</Th><Th>Lím. Crít.</Th><Th>Comprador</Th><Th>Nivel</Th></tr></thead>
            <tbody>
              {tableRows.length===0 && <tr><Td colSpan={7} style={{ textAlign:'center',color:C.textMuted,padding:32 }}>Sin órdenes.</Td></tr>}
              {tableRows.map(o=>(
                <tr key={o.id} onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <Td><span style={{ fontWeight:700,color:C.accent }}>{o.folio}</span></Td>
                  <Td style={{ fontSize:12 }}>{o.estatus_actual||'—'}</Td>
                  <Td style={{ fontWeight:700,color:o.nivel==='CRITICO'?C.danger:o.nivel==='PREVENTIVO'?C.warning:C.text }}>{o.dias}d</Td>
                  <Td>{o.limPrev||'—'}</Td><Td>{o.limCrit||'—'}</Td>
                  <Td style={{ fontSize:12 }}>{o.comprador_nombre||'—'}</Td>
                  <Td><Badge level={o.nivel}/></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function HorizBar({ data, color, onClick, active, truncate=22 }) {
  const max = Math.max(...data.map(d=>d.value), 1)
  if (!data.length) return <div style={{ fontSize:12,color:C.textMuted,textAlign:'center',padding:'16px 0' }}>Sin datos</div>
  return (
    <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
      {data.map(d=>(
        <div key={d.label} onClick={()=>onClick(d.label)} style={{ cursor:'pointer' }}>
          <div style={{ display:'flex',justifyContent:'space-between',marginBottom:3 }}>
            <span style={{ fontSize:11,color:active===d.label?C.accent:C.textSub,fontWeight:active===d.label?700:400,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }} title={d.label}>
              {d.label.length>truncate?d.label.slice(0,truncate)+'…':d.label}
            </span>
            <span style={{ fontSize:11,fontWeight:700,color:C.text,marginLeft:8 }}>{d.value}</span>
          </div>
          <div style={{ height:8,background:'#F1F5F9',borderRadius:4,overflow:'hidden' }}>
            <div style={{ height:'100%',width:`${(d.value/max)*100}%`,background:active===d.label?C.accentHover:color,borderRadius:4,transition:'width .3s' }}/>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── TAB LOGS ─────────────────────────────────────────────────
function TabLogs({ logEstatus, logVariables, logNotif }) {
  const [active, setActive] = useState('estatus')
  const tabs = [['estatus','Log Estatus'],['variables','Log Variables'],['notif','Log Notificaciones']]
  const logs = { estatus:logEstatus, variables:logVariables, notif:logNotif }
  const headers = { estatus:['Fecha','Folio','Tipo Envío','Estatus','Usuario'], variables:['Fecha','Folio','Variable','Valor Anterior','Valor Nuevo'], notif:['Fecha','Folio','Nivel','Para','CC','Modo'] }

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {tabs.map(([k,l])=>(
          <button key={k} onClick={()=>setActive(k)} style={{ padding:'8px 16px',borderRadius:7,border:`1.5px solid ${active===k?C.accent:C.border}`,background:active===k?C.accentLight:'#fff',color:active===k?C.accent:C.textSub,fontWeight:active===k?700:400,cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>
            {l} <span style={{ background:active===k?C.accent:'#E5E7EB',color:active===k?'#fff':C.textSub,borderRadius:10,padding:'1px 7px',fontSize:11,fontWeight:700,marginLeft:4 }}>{logs[k].length}</span>
          </button>
        ))}
      </div>
      <Card padding={0}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead><tr>{headers[active].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
            <tbody>
              {logs[active].length===0 && <tr><Td colSpan={6} style={{ textAlign:'center',padding:40,color:C.textMuted }}>Sin registros.</Td></tr>}
              {logs[active].map((r,i)=>(
                <tr key={i} onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <Td style={{ fontSize:12,color:C.textSub }}>{new Date(r.created_at).toLocaleString('es-MX')}</Td>
                  <Td><span style={{ fontWeight:700,color:C.accent }}>{r.folio}</span></Td>
                  {active==='estatus'  && <><Td>{r.tipo_envio}</Td><Td style={{ fontSize:12 }}>{r.estatus}</Td><Td>{r.usuario}</Td></>}
                  {active==='variables'&& <><Td>{r.variable}</Td><Td>{r.valor_anterior}</Td><Td>{r.valor_nuevo}</Td></>}
                  {active==='notif'    && <><Td><Badge level={r.nivel}/></Td><Td style={{ fontSize:12 }}>{r.para}</Td><Td style={{ fontSize:12 }}>{r.cc||'—'}</Td><Td>{r.dry_run?<span style={{ fontSize:11,background:'#F3F4F6',color:C.textSub,padding:'2px 6px',borderRadius:4 }}>Simulado</span>:<span style={{ fontSize:11,background:C.accentLight,color:C.accent,padding:'2px 6px',borderRadius:4 }}>Enviado</span>}</Td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ─── TAB CONFIG ───────────────────────────────────────────────
function TabConfig({ cfg, onRefresh }) {
  const [sec, setSec] = useState('usuarios')
  const sections = [['usuarios','Usuarios'],['proveedores','Proveedores'],['transito','Tránsito/Origen'],['estatus','Flujo Estatus']]

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {sections.map(([k,l])=>(
          <button key={k} onClick={()=>setSec(k)} style={{ padding:'8px 14px',borderRadius:7,border:`1.5px solid ${sec===k?C.accent:C.border}`,background:sec===k?C.accentLight:'#fff',color:sec===k?C.accent:C.textSub,fontWeight:sec===k?700:400,cursor:'pointer',fontSize:13,fontFamily:'inherit' }}>{l}</button>
        ))}
      </div>
      {sec==='usuarios'   && <SupaCfgTable table='cfg_usuarios'   cols={['nombre','email','jefe_email','rol','activo']} tipos={{ activo:'bool', rol:['Compras','Trafico'] }} title='Usuarios' onRefresh={onRefresh} rows={cfg.usuarios}/>}
      {sec==='proveedores'&& <SupaCfgTable table='cfg_proveedores' cols={['marca','dias_produccion_default','activo']} tipos={{ activo:'bool', dias_produccion_default:'number' }} title='Proveedores' onRefresh={onRefresh} rows={cfg.proveedores}/>}
      {sec==='transito'   && <SupaCfgTable table='cfg_transito'    cols={['tipo_envio','origen','dias_trans','activo']} tipos={{ activo:'bool', dias_trans:'number', tipo_envio:['Maritimo','Aereo','Courier','Nacional'] }} title='Tránsito / Origen' onRefresh={onRefresh} rows={cfg.transito}/>}
      {sec==='estatus'    && <SupaCfgTable table='cfg_estatus'     cols={['tipo_envio','secuencia','estatus','rol_responsable','sla_prev','sla_crit','usa_prod','usa_trans']} tipos={{ secuencia:'number',sla_prev:'number',sla_crit:'number',usa_prod:'bool',usa_trans:'bool',tipo_envio:['Maritimo','Aereo','Courier','Nacional'],rol_responsable:['Compras','Trafico'] }} title='Flujo de Estatus' onRefresh={onRefresh} rows={cfg.estatus}/>}
    </div>
  )
}

// Definido FUERA de SupaCfgTable para evitar re-renders que pierden el foco
function CellEdit({ col, tipos, editRow, setEditRow }) {
  const t = tipos[col]
  if (t === 'bool') return (
    <Select value={editRow[col] ? 'true' : 'false'}
      onChange={v => setEditRow(p => ({ ...p, [col]: v === 'true' }))}
      options={[{ value:'true', label:'Sí' }, { value:'false', label:'No' }]}/>
  )
  if (Array.isArray(t)) return (
    <Select value={editRow[col]} onChange={v => setEditRow(p => ({ ...p, [col]: v }))}
      options={t} placeholder='Selecciona...'/>
  )
  return (
    <Input type={t === 'number' ? 'number' : 'text'} value={editRow[col]}
      onChange={v => setEditRow(p => ({ ...p, [col]: t === 'number' ? Number(v) : v }))}/>
  )
}

function SupaCfgTable({ table, cols, tipos, title, onRefresh, rows }) {
  const [editIdx, setEditIdx] = useState(null)
  const [editRow, setEditRow] = useState({})
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    if (editRow.id) { await supabase.from(table).update(editRow).eq('id', editRow.id) }
    else { await supabase.from(table).insert(editRow) }
    await onRefresh(); setSaving(false); setEditIdx(null)
  }

  const del = async (id) => {
    if (!confirm('¿Eliminar esta fila?')) return
    await supabase.from(table).delete().eq('id', id)
    await onRefresh()
  }

  const addRow = () => {
    const empty = cols.reduce((a,c) => ({ ...a, [c]: tipos[c]==='bool'?false:tipos[c]==='number'?0:'' }), {})
    setEditRow(empty); setEditIdx('new')
  }

  return (
    <Card padding={0}>
      <div style={{ padding:'14px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
        <div style={{ fontWeight:700,fontSize:14,color:C.text }}>{title} ({rows.length})</div>
        <Btn onClick={addRow} size='sm'>+ Agregar</Btn>
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%',borderCollapse:'collapse' }}>
          <thead><tr>{cols.map(c=><Th key={c}>{c}</Th>)}<Th>Acciones</Th></tr></thead>
          <tbody>
            {editIdx==='new' && (
              <tr style={{ background:'#EFF6FF' }}>
                {cols.map(c=><Td key={c}><CellEdit col={c} tipos={tipos} editRow={editRow} setEditRow={setEditRow}/></Td>)}
                <Td>
                  <div style={{ display:'flex',gap:6 }}>
                    <Btn onClick={save} size='sm' disabled={saving}>{saving?'…':'✔ Guardar'}</Btn>
                    <Btn onClick={()=>setEditIdx(null)} variant='secondary' size='sm'>✖</Btn>
                  </div>
                </Td>
              </tr>
            )}
            {rows.map((r,i)=>(
              <tr key={r.id||i} onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'} onMouseLeave={e=>e.currentTarget.style.background=editIdx===i?'#EFF6FF':''} style={{ background:editIdx===i?'#EFF6FF':'' }}>
                {cols.map(c=>(
                  <Td key={c}>
                    {editIdx===i ? <CellEdit col={c} tipos={tipos} editRow={editRow} setEditRow={setEditRow}/> : tipos[c]==='bool' ? <span style={{ color:r[c]?C.success:C.danger,fontWeight:700 }}>{r[c]?'Sí':'No'}</span> : r[c]}
                  </Td>
                ))}
                <Td>
                  {editIdx===i
                    ? <div style={{ display:'flex',gap:6 }}><Btn onClick={save} size='sm' disabled={saving}>{saving?'…':'✔ Guardar'}</Btn><Btn onClick={()=>setEditIdx(null)} variant='secondary' size='sm'>✖</Btn></div>
                    : <div style={{ display:'flex',gap:6 }}><Btn onClick={()=>{setEditIdx(i);setEditRow({...r})}} variant='secondary' size='sm'>✏️</Btn><Btn onClick={()=>del(r.id)} variant='danger' size='sm'>🗑️</Btn></div>
                  }
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}