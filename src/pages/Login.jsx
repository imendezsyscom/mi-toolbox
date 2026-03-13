// ── ARCHIVO: src/pages/Login.jsx ─────────────────────────────
import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [mode, setMode]         = useState('login') // 'login' | 'register'

  const C = { accent:'#2563EB', danger:'#DC2626', border:'#E2E6EA', text:'#1A1D23', sub:'#6B7280' }

  const handleSubmit = async () => {
    if (!email || !password) { setError('Completa todos los campos.'); return }
    setLoading(true); setError(null)

    const { error: err } = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })

    if (err) setError(err.message)
    setLoading(false)
  }

  const inputStyle = (hasErr) => ({
    width:'100%', padding:'10px 14px', borderRadius:7, fontSize:14,
    border:`1.5px solid ${hasErr ? C.danger : C.border}`, outline:'none',
    fontFamily:'inherit', color:C.text, background:'#fff', boxSizing:'border-box'
  })

  return (
    <div style={{ minHeight:'100vh', background:'#F4F6F9', display:'flex',
      alignItems:'center', justifyContent:'center', fontFamily:"'Inter',system-ui,sans-serif" }}>
      <div style={{ background:'#fff', border:`1px solid ${C.border}`, borderRadius:14,
        padding:36, width:360, boxShadow:'0 4px 24px rgba(0,0,0,.06)' }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:52, height:52, background:C.accent, borderRadius:14,
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            fontSize:24, marginBottom:12 }}>🧰</div>
          <div style={{ fontWeight:800, fontSize:20, color:C.text }}>Mi Toolbox</div>
          <div style={{ fontSize:13, color:C.sub, marginTop:4 }}>
            {mode === 'login' ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}
          </div>
        </div>

        {/* Campos */}
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, fontWeight:600, color:C.sub,
            textTransform:'uppercase', letterSpacing:.5, display:'block', marginBottom:5 }}>
            Correo electrónico
          </label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
            placeholder="tu@empresa.com" style={inputStyle(false)}
            onKeyDown={e=>e.key==='Enter'&&handleSubmit()}/>
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12, fontWeight:600, color:C.sub,
            textTransform:'uppercase', letterSpacing:.5, display:'block', marginBottom:5 }}>
            Contraseña
          </label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
            placeholder="••••••••" style={inputStyle(false)}
            onKeyDown={e=>e.key==='Enter'&&handleSubmit()}/>
        </div>

        {error && (
          <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:6,
            padding:'8px 12px', fontSize:13, color:C.danger, marginBottom:14 }}>
            {error}
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading} style={{
          width:'100%', padding:'11px', borderRadius:7, border:'none',
          background:C.accent, color:'#fff', fontWeight:700, fontSize:14,
          cursor:loading?'not-allowed':'pointer', opacity:loading?.7:1, fontFamily:'inherit'
        }}>
          {loading ? 'Procesando...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
        </button>

        <div style={{ textAlign:'center', marginTop:16, fontSize:13, color:C.sub }}>
          {mode === 'login' ? '¿Sin cuenta aún? ' : '¿Ya tienes cuenta? '}
          <button onClick={()=>{ setMode(mode==='login'?'register':'login'); setError(null) }}
            style={{ color:C.accent, fontWeight:600, background:'none',
              border:'none', cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>
            {mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </div>
      </div>
    </div>
  )
}

