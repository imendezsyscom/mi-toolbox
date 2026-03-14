// ── ARCHIVO: src/pages/Home.jsx ───────────────────────────────
import { useNavigate } from 'react-router-dom'

const TOOLS = [
  {
    path: '/tools/compras',
    name: 'Control de Compras',
    description: 'Gestión de órdenes de compra, alertas SLA, notificaciones y tráfico.',
    icon: '📦',
    color: '#2563EB',
    bg: '#EFF6FF',
    status: 'active',
  },
  {
    path: null,
    href: 'https://claude.ai/artifacts/ec86abfd-db08-4709-90ad-1635b9d51f96',
    name: 'Extractor DIAN',
    description: 'Extrae datos y seriales de Declaraciones de Importación (formulario 500) en PDF.',
    icon: '📄',
    color: '#7C3AED',
    bg: '#F5F3FF',
    status: 'active',
  },
  // Próximas herramientas — descomenta y llena cuando estén listas:
  // { path:'/tools/inventario', name:'Inventario', description:'...', icon:'🗃️', color:'#16A34A', bg:'#F0FDF4', status:'soon' },
  // { path:'/tools/reportes',   name:'Reportes',   description:'...', icon:'📊', color:'#7C3AED', bg:'#F5F3FF', status:'soon' },
]

export default function Home() {
  const navigate = useNavigate()
  const C = { text:'#1A1D23', sub:'#6B7280', border:'#E2E6EA' }

  return (
    <div>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ margin:'0 0 6px', fontSize:22, fontWeight:800, color:C.text }}>
          Bienvenido a Mi Toolbox 🧰
        </h1>
        <p style={{ margin:0, fontSize:14, color:C.sub }}>
          Selecciona una herramienta para comenzar.
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
        {TOOLS.map(tool => (
          <div key={tool.path || tool.href}
            onClick={() => tool.status === 'active' && (tool.href ? window.open(tool.href, '_blank') : navigate(tool.path))}
            style={{
              background:'#fff', border:`1.5px solid ${C.border}`, borderRadius:12,
              padding:24, cursor: tool.status === 'active' ? 'pointer' : 'default',
              transition:'all .15s', opacity: tool.status === 'active' ? 1 : .6,
              position:'relative', overflow:'hidden'
            }}
            onMouseEnter={e => { if(tool.status==='active') e.currentTarget.style.borderColor = tool.color }}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
          >
            <div style={{ width:48, height:48, background:tool.bg, borderRadius:12,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:24, marginBottom:14 }}>
              {tool.icon}
            </div>
            <div style={{ fontWeight:700, fontSize:15, color:C.text, marginBottom:6 }}>
              {tool.name}
            </div>
            <div style={{ fontSize:13, color:C.sub, lineHeight:1.5 }}>
              {tool.description}
            </div>
            {tool.status === 'soon' && (
              <div style={{ position:'absolute', top:14, right:14, background:'#F1F5F9',
                color:C.sub, fontSize:11, fontWeight:600, borderRadius:20,
                padding:'2px 8px' }}>Próximamente</div>
            )}
            {tool.status === 'active' && (
              <div style={{ marginTop:16, fontSize:12, fontWeight:700, color:tool.color }}>
                Abrir →
              </div>
            )}
          </div>
        ))}

        {/* Card para nueva herramienta */}
        <div style={{ background:'#fff', border:`1.5px dashed ${C.border}`, borderRadius:12,
          padding:24, display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', textAlign:'center', minHeight:160, color:C.sub }}>
          <div style={{ fontSize:28, marginBottom:8 }}>+</div>
          <div style={{ fontSize:13, fontWeight:600 }}>Nueva herramienta</div>
          <div style={{ fontSize:12, marginTop:4 }}>Pídele a Claude que la construya</div>
        </div>
      </div>
    </div>
  )
}