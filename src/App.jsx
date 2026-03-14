// ── ARCHIVO: src/App.jsx ──────────────────────────────────────
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './pages/Login'
import Home from './pages/Home'
import Layout from './components/Layout'
import ComprasTool from './pages/tools/ComprasTool'
import ExtractorDian from './pages/tools/ExtractorDian'

function PrivateRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center',
        justifyContent:'center', background:'#F4F6F9', fontFamily:'system-ui' }}>
        <div style={{ color:'#6B7280', fontSize:14 }}>Cargando...</div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={
          <PrivateRoute session={session}>
            <Layout session={session}><Home /></Layout>
          </PrivateRoute>
        }/>
        <Route path="/tools/compras" element={
          <PrivateRoute session={session}>
            <Layout session={session}><ComprasTool /></Layout>
          </PrivateRoute>
        }/>
        <Route path="/tools/extractor-dian" element={
          <PrivateRoute session={session}>
            <Layout session={session}><ExtractorDian /></Layout>
          </PrivateRoute>
        }/>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}


