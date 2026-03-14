// ── ARCHIVO: src/components/Layout.jsx ───────────────────────
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const C = {
  sidebar:'#1A1D23', accent:'#2563EB', sidebarText:'#A0A8B8',
  border:'#E2E6EA', text:'#1A1D23', bg:'#F4F6F9'
}

export default function Layout({ session, children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [loggingOut, setLoggingOut] = useState(false)

  const logout = async () => {
    setLoggingOut(true)
    await supabase.auth.signOut()
  }

  const navItems = [
    { path:'/', label:'Inicio', icon:'⊞' },
    { path:'/tools/compras', label:'Control Compras', icon:'📦' },
    { path:'/tools/extractor-dian', label:'Extractor DIAN', icon:'📄' },
    // Aquí irán apareciendo más herramientas
  ]

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:C.bg,
      fontFamily:"'Inter',system-ui,sans-serif" }}>
      {/* Sidebar */}
      <aside style={{ width:220, background:C.sidebar, display:'flex',
        flexDirection:'column', position:'sticky', top:0, height:'100vh', flexShrink:0 }}>
        <div style={{ padding:'20px', borderBottom:'1px solid #2A2D35' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, background:C.accent, borderRadius:8,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:16 }}>🧰</div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:'#fff' }}>Mi Toolbox</div>
              <div style={{ fontSize:11, color:C.sidebarText }}>
                {session.user.email}
              </div>
            </div>
          </div>
        </div>

        <nav style={{ padding:'12px 10px', flex:1 }}>
          {navItems.map(n => {
            const active = location.pathname === n.path
            return (
              <button key={n.path} onClick={() => navigate(n.path)} style={{
                width:'100%', display:'flex', alignItems:'center', gap:10,
                padding:'9px 12px', borderRadius:7, border:'none',
                background: active ? 'rgba(37,99,235,.2)' : 'transparent',
                color: active ? '#fff' : C.sidebarText,
                fontWeight: active ? 600 : 400, cursor:'pointer',
                marginBottom:2, fontSize:13, fontFamily:'inherit',
                position:'relative', textAlign:'left'
              }}>
                <span>{n.icon}</span>{n.label}
                {active && <div style={{ position:'absolute', left:0, top:'20%',
                  height:'60%', width:3, background:C.accent,
                  borderRadius:'0 2px 2px 0' }}/>}
              </button>
            )
          })}
        </nav>

        <div style={{ padding:'16px 20px', borderTop:'1px solid #2A2D35' }}>
          <button onClick={logout} disabled={loggingOut} style={{
            width:'100%', padding:'8px', borderRadius:6, border:'1px solid #2A2D35',
            background:'transparent', color:C.sidebarText, cursor:'pointer',
            fontSize:12, fontFamily:'inherit'
          }}>
            {loggingOut ? 'Saliendo...' : '← Cerrar sesión'}
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <main style={{ flex:1, minWidth:0, padding:24 }}>
        {children}
      </main>
    </div>
  )
}
