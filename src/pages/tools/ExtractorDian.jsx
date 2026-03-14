// ── ARCHIVO: src/pages/tools/ExtractorDian.jsx ────────────────
import { useState, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

// ── Design tokens ──────────────────────────────────────────────
const C = {
  bg:'#F4F6F9', card:'#FFFFFF', border:'#E2E6EA',
  text:'#1A1D23', textSub:'#6B7280', textMuted:'#9CA3AF',
  accent:'#2563EB', accentHover:'#1D4ED8', accentLight:'#EFF6FF',
  success:'#16A34A', successLight:'#F0FDF4',
  warning:'#D97706', warningLight:'#FFFBEB',
  danger:'#DC2626', dangerLight:'#FEF2F2',
}

// ── Constantes ─────────────────────────────────────────────────
const FIELD_MAP = [
  { erp: "Formulario",               key: "formulario" },
  { erp: "Aduana",                   key: "aduana" },
  { erp: "Tipo",                     key: "tipo" },
  { erp: "Fecha de Levante",         key: "fecha_levante" },
  { erp: "Tipo de Declaración",      key: "tipo_declaracion" },
  { erp: "Agencia Aduanal",          key: "agencia_aduanal" },
  { erp: "Transportadora Nacional",  key: "transportadora" },
  { erp: "Incoterm",                 key: "incoterm" },
  { erp: "Tipo de Embarque",         key: "tipo_embarque" },
  { erp: "Tipo de Cambio",           key: "tipo_cambio" },
  { erp: "FOB",                      key: "fob" },
  { erp: "Base IVA",                 key: "base_iva" },
  { erp: "IVA %",                    key: "iva_pct" },
  { erp: "Base Arancel",             key: "base_arancel" },
  { erp: "Arancel %",                key: "arancel_pct" },
  { erp: "Total Liquidado",          key: "total_liquidado" },
  { erp: "Seguro",                   key: "seguro" },
  { erp: "Fletes",                   key: "fletes" },
  { erp: "Otros Gastos",             key: "otros_gastos" },
  { erp: "Código de Depósito",       key: "cod_deposito" },
  { erp: "Documento de Transporte",  key: "doc_transporte" },
  { erp: "Fecha Doc. de Transporte", key: "fecha_doc_transporte" },
  { erp: "Factor Cambiario",         key: "factor_cambiario" },
  { erp: "Subpartida Arancelaria",   key: "subpartida" },
]

const TRANSPORT = {
  "1":"Marítimo","2":"Aéreo","3":"Carretero",
  "4":"Férreo","5":"Fluvial","6":"Postal","7":"Multimodal"
}

// ── Prompts ────────────────────────────────────────────────────
const PROMPT_GENERAL = `Eres un extractor de datos de Declaraciones de Importación colombianas (formulario DIAN 500).
A continuación recibirás el texto extraído del PDF.
IMPORTANTE: Responde ÚNICAMENTE con el JSON, empezando con { y terminando con }. Sin texto antes ni después.

{
  "formulario":          "casilla 4 completa con guion y dígito",
  "aduana":              "casilla 40 ej BOG",
  "tipo":                "Importaciones",
  "fecha_levante":       "casilla 135 formato DD/MM/YYYY",
  "tipo_declaracion":    "casilla 32 ej Inicial",
  "agencia_aduanal":     "(NIT casilla 24) NOMBRE casilla 26",
  "transportadora":      "casilla 57",
  "incoterm":            "",
  "tipo_embarque":       "casilla 54 solo número",
  "tipo_cambio":         "casilla 58 solo número sin texto",
  "fob":                 "casilla 78 solo número",
  "base_iva":            "casilla 98 solo número sin puntos de miles",
  "iva_pct":             "casilla 97 solo número",
  "base_arancel":        "casilla 93 solo número",
  "arancel_pct":         "casilla 92 solo número",
  "total_liquidado":     "casilla 125 solo número",
  "seguro":              "casilla 80 solo número",
  "fletes":              "casilla 79 solo número",
  "otros_gastos":        "casilla 81 solo número",
  "cod_deposito":        "casilla 41",
  "doc_transporte":      "casilla 44 sin No.",
  "fecha_doc_transporte":"casilla 45 formato DD/MM/YYYY",
  "factor_cambiario":    "0",
  "subpartida":          "casilla 59"
}`

const PROMPT_ITEMS_Y_SERIALES = `Eres un extractor de datos de Declaraciones de Importación colombianas (formulario DIAN 500).
A continuación recibirás el texto extraído del PDF. Lee TODO el texto incluyendo páginas de continuación.

ESTRUCTURA DE CADA ITEM EN EL PDF:
  PRODUCTO: <desc>, MARCA: <marca>, MODELO: <modelo>, REFERENCIA: <ref>,
  USO O DESTINO: <uso>, SERIAL: <seriales separados por coma o "NO TIENE">
  Termina con: / DESCRIPCION SEGÚN FACTURA: ... PART NO. <part_no> ... / CANTIDAD: <n> PIEZAS / (ITEM <n>)

REGLAS CRÍTICAS:
1. Si MODELO dice "NO TIENE", usa el valor de REFERENCIA como modelo.
2. Si SERIAL dice "NO TIENE", pon seriales: []
3. Extrae ABSOLUTAMENTE TODOS los seriales de cada item sin omitir ninguno.
4. Los seriales son códigos alfanuméricos cortos sin espacios (ej: G1U0BUD04849A).

IMPORTANTE: Responde ÚNICAMENTE con el array JSON, empezando con [ y terminando con ]. Sin texto antes ni después.

[
  {
    "item": "1",
    "producto": "descripción máx 80 chars",
    "marca": "marca",
    "modelo": "modelo",
    "referencia": "referencia",
    "part_no": "part number",
    "cantidad": "número",
    "tiene_seriales": true,
    "seriales": ["SER001", "SER002"]
  }
]`

// ── Helpers ────────────────────────────────────────────────────
const extractJSON = (raw) => {
  const ai = raw.indexOf("["), oi = raw.indexOf("{")
  let start, closer
  if (ai === -1 && oi === -1) throw new Error("Sin JSON en respuesta")
  if (ai === -1)      { start = oi; closer = "}" }
  else if (oi === -1) { start = ai; closer = "]" }
  else                { start = Math.min(ai, oi); closer = start === ai ? "]" : "}" }
  const end = raw.lastIndexOf(closer)
  if (end === -1) throw new Error("JSON incompleto")
  return JSON.parse(raw.slice(start, end + 1))
}

const parseSers = (raw) => {
  const t = raw.trim()
  if (!t || t.toUpperCase() === "NINGUNO") return []
  return t
    .replace(/[\[\]"'\n\r]/g, "")
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 3 && !/\s/.test(s))
}

const dlFile = (name, content) => {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href = url; a.download = name
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

const extractTextFromPDF = async (file) => {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let fullText = ""
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(" ")
    fullText += `\n--- PÁGINA ${i} ---\n` + pageText
  }
  return fullText
}

const callClaude = async (text, promptText, maxTok) => {
  const key = import.meta.env.VITE_ANTHROPIC_KEY
  if (!key) throw new Error("Falta VITE_ANTHROPIC_KEY en .env")
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTok,
      messages: [{
        role: "user",
        content: promptText + "\n\n--- TEXTO DEL PDF ---\n" + text
      }]
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`API ${res.status}: ${err?.error?.message || res.statusText}`)
  }
  const data = await res.json()
  return data.content?.find(b => b.type === "text")?.text || ""
}

// ── Sub-componentes ────────────────────────────────────────────
function Btn({ children, onClick, disabled, variant = "primary", style = {} }) {
  const base = {
    padding: "9px 18px", borderRadius: 7, border: "none",
    fontWeight: 600, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1, transition: "background .15s", fontFamily: "inherit",
    ...style,
  }
  const variants = {
    primary:  { background: C.accent,   color: "#fff" },
    success:  { background: C.success,  color: "#fff" },
    outline:  { background: "#fff",     color: C.accent, border: `1px solid ${C.accent}` },
    ghost:    { background: "transparent", color: C.textSub, border: `1px solid ${C.border}` },
  }
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>{children}</button>
}

function Th({ children, style = {} }) {
  return (
    <th style={{
      padding: "10px 14px", textAlign: "left", fontWeight: 600,
      fontSize: 12, color: C.textSub, borderBottom: `1px solid ${C.border}`,
      background: "#F8FAFC", ...style
    }}>{children}</th>
  )
}

function Td({ children, style = {} }) {
  return (
    <td style={{
      padding: "9px 14px", fontSize: 13, color: C.text,
      borderBottom: `1px solid ${C.border}`, verticalAlign: "top", ...style
    }}>{children}</td>
  )
}

// ── Pantalla 0: Drop zone ──────────────────────────────────────
function DropZone({ onFile }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.type === "application/pdf") onFile(f)
  }, [onFile])

  const handleChange = (e) => {
    const f = e.target.files[0]
    if (f) onFile(f)
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800, color: C.text }}>
          Extractor DIAN 📄
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: C.textSub }}>
          Sube una Declaración de Importación (formulario 500) en PDF y extrae automáticamente los datos.
        </p>
      </div>

      <div
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? C.accent : C.border}`,
          borderRadius: 16, padding: "64px 32px", textAlign: "center",
          cursor: "pointer", background: dragging ? C.accentLight : "#fff",
          transition: "all .2s",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 8 }}>
          Arrastra tu PDF aquí
        </div>
        <div style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>
          o haz clic para seleccionar un archivo
        </div>
        <Btn>Seleccionar PDF</Btn>
        <input ref={inputRef} type="file" accept="application/pdf"
          style={{ display: "none" }} onChange={handleChange} />
      </div>

      <div style={{
        marginTop: 20, padding: "14px 18px", background: C.accentLight,
        borderRadius: 10, fontSize: 12, color: C.accent, lineHeight: 1.6
      }}>
        <strong>¿Qué extrae?</strong> Datos generales (24 campos) y seriales por ítem del formulario DIAN 500.
        Se generan dos archivos CSV listos para importar al ERP.
      </div>
    </div>
  )
}

// ── Pantalla 1: Progreso ───────────────────────────────────────
function ProgressScreen({ steps, currentStep, currentDetail }) {
  const pct = Math.round(((currentStep) / steps.length) * 100)
  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700, color: C.text }}>
        Procesando PDF...
      </h2>
      <p style={{ margin: "0 0 28px", fontSize: 13, color: C.textSub }}>
        Esto puede tomar unos segundos dependiendo del número de ítems.
      </p>

      {/* Barra de progreso */}
      <div style={{ background: C.border, borderRadius: 99, height: 8, marginBottom: 10 }}>
        <div style={{
          height: "100%", borderRadius: 99, background: C.accent,
          width: `${pct}%`, transition: "width .4s ease"
        }}/>
      </div>
      <div style={{ fontSize: 12, color: C.textSub, textAlign: "right", marginBottom: 28 }}>
        {pct}%
      </div>

      {/* Pasos */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {steps.map((step, i) => {
          const done = i < currentStep
          const active = i === currentStep
          return (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              padding: "14px 18px", borderRadius: 10,
              background: active ? C.accentLight : done ? C.successLight : "#fff",
              border: `1px solid ${active ? C.accent : done ? C.success : C.border}`,
              transition: "all .3s"
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700,
                background: active ? C.accent : done ? C.success : C.border,
                color: (active || done) ? "#fff" : C.textSub,
              }}>
                {done ? "✓" : i + 1}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{step}</div>
                {active && currentDetail && (
                  <div style={{ fontSize: 12, color: C.accent, marginTop: 3 }}>{currentDetail}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Pantalla 2: Resultados ─────────────────────────────────────
function ResultsScreen({ general, setGeneral, items, formulario, onReset }) {
  const [activeTab, setActiveTab] = useState("general")

  // CSV 1
  const downloadGeneral = () => {
    const headers = FIELD_MAP.map(f => f.erp).join(";")
    const values  = FIELD_MAP.map(f => {
      let v = general[f.key] ?? ""
      if (f.key === "tipo_embarque" && TRANSPORT[v]) v = TRANSPORT[v]
      return String(v).replace(/;/g, ",")
    }).join(";")
    dlFile(`declaracion_${formulario}.csv`, headers + "\n" + values)
  }

  // CSV 2
  const downloadSeriales = () => {
    const cols = ["Modelo","Numero de Serie","Marca","Referencia","Part No","Cantidad Total","Descripcion"]
    const rows = []
    items.forEach(it => {
      if (it.seriales && it.seriales.length > 0) {
        it.seriales.forEach(s => {
          rows.push([it.modelo, s, it.marca, it.referencia, it.part_no, it.cantidad, it.producto])
        })
      } else {
        rows.push([it.modelo, "", it.marca, it.referencia, it.part_no, it.cantidad, it.producto])
      }
    })
    const content = [cols.join(";"), ...rows.map(r => r.map(v => String(v ?? "").replace(/;/g, ",")).join(";"))].join("\n")
    dlFile(`seriales_${formulario}.csv`, content)
  }

  const tabStyle = (tab) => ({
    padding: "9px 20px", border: "none", borderRadius: "7px 7px 0 0",
    fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
    background: activeTab === tab ? "#fff" : "transparent",
    color: activeTab === tab ? C.accent : C.textSub,
    borderBottom: activeTab === tab ? `2px solid ${C.accent}` : "2px solid transparent",
  })

  const totalSers = items.reduce((s, it) => s + (it.seriales?.length ?? 0), 0)

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: C.text }}>
            Declaración {formulario}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: C.textSub }}>
            {items.length} ítems · {totalSers} seriales extraídos
          </p>
        </div>
        <Btn variant="ghost" onClick={onReset}>← Nuevo PDF</Btn>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 0 }}>
        <button style={tabStyle("general")} onClick={() => setActiveTab("general")}>
          Datos Generales
        </button>
        <button style={tabStyle("seriales")} onClick={() => setActiveTab("seriales")}>
          Seriales ({totalSers})
        </button>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderTop: "none",
        borderRadius: "0 0 10px 10px", padding: 20 }}>

        {activeTab === "general" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <Btn variant="success" onClick={downloadGeneral}>⬇ Descargar CSV General</Btn>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th>Campo ERP</Th>
                    <Th>Valor extraído</Th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_MAP.map(f => (
                    <tr key={f.key}>
                      <Td style={{ color: C.textSub, fontWeight: 500, whiteSpace: "nowrap" }}>
                        {f.erp}
                      </Td>
                      <Td>
                        <input
                          value={general[f.key] ?? ""}
                          onChange={e => setGeneral(prev => ({ ...prev, [f.key]: e.target.value }))}
                          style={{
                            width: "100%", border: `1px solid ${C.border}`, borderRadius: 6,
                            padding: "5px 10px", fontSize: 13, fontFamily: "inherit",
                            color: C.text, background: "#FAFBFC", boxSizing: "border-box"
                          }}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "seriales" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <Btn variant="success" onClick={downloadSeriales}>⬇ Descargar CSV Seriales</Btn>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Producto</Th>
                    <Th>Marca</Th>
                    <Th>Modelo</Th>
                    <Th>Part No</Th>
                    <Th>Cant.</Th>
                    <Th>Seriales</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.item}>
                      <Td style={{ color: C.textSub }}>{it.item}</Td>
                      <Td>{it.producto}</Td>
                      <Td>{it.marca}</Td>
                      <Td>{it.modelo}</Td>
                      <Td style={{ fontFamily: "monospace", fontSize: 12 }}>{it.part_no}</Td>
                      <Td style={{ textAlign: "center" }}>{it.cantidad}</Td>
                      <Td>
                        {it.seriales && it.seriales.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {it.seriales.map((s, si) => (
                              <span key={si} style={{
                                background: C.accentLight, color: C.accent, borderRadius: 4,
                                padding: "2px 8px", fontSize: 11, fontFamily: "monospace"
                              }}>{s}</span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: C.textMuted, fontSize: 12 }}>Sin seriales</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────
export default function ExtractorDian() {
  const [phase, setPhase]               = useState(0) // 0=drop, 1=processing, 2=results
  const [general, setGeneral]           = useState({})
  const [items, setItems]               = useState([])
  const [currentStep, setCurrentStep]   = useState(0)
  const [currentDetail, setCurrentDetail] = useState("")
  const [error, setError]               = useState(null)

  const STEPS = [
    "Leyendo PDF localmente",
    "Extrayendo datos generales",
    "Extrayendo productos y seriales",
  ]

  const handleFile = async (file) => {
    setError(null)
    setPhase(1)
    setCurrentStep(0)
    setCurrentDetail("")
    try {
      // PASO 1 — Extraer texto localmente (sin API)
      setCurrentStep(0)
      setCurrentDetail("Procesando páginas del PDF...")
      const pdfText = await extractTextFromPDF(file)

      // PASO 2 — Datos generales
      setCurrentStep(1)
      setCurrentDetail("Leyendo cabecera de la declaración...")
      const rawGen = await callClaude(pdfText, PROMPT_GENERAL, 900)
      const genData = extractJSON(rawGen)
      if (TRANSPORT[genData.tipo_embarque]) {
        genData.tipo_embarque = TRANSPORT[genData.tipo_embarque]
      }

      // PASO 3 — Todos los ítems y seriales en una sola llamada
      setCurrentStep(2)
      setCurrentDetail("Extrayendo ítems y números de serie...")
      const rawItems = await callClaude(pdfText, PROMPT_ITEMS_Y_SERIALES, 16000)
      const allItems = extractJSON(rawItems)

      setGeneral(genData)
      setItems(allItems)
      setCurrentStep(STEPS.length) // marca completado
      setPhase(2)

    } catch (err) {
      setError(err.message || "Error desconocido")
      setPhase(0)
    }
  }

  const handleReset = () => {
    setPhase(0)
    setGeneral({})
    setItems([])
    setError(null)
  }

  return (
    <div style={{ maxWidth: phase === 2 ? 1100 : 640, margin: "0 auto" }}>
      {error && (
        <div style={{
          marginBottom: 20, padding: "12px 18px", background: C.dangerLight,
          border: `1px solid ${C.danger}`, borderRadius: 8,
          fontSize: 13, color: C.danger, display: "flex",
          justifyContent: "space-between", alignItems: "center"
        }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: C.danger, fontWeight: 700, fontSize: 16
          }}>✕</button>
        </div>
      )}

      {phase === 0 && <DropZone onFile={handleFile} />}
      {phase === 1 && (
        <ProgressScreen
          steps={STEPS}
          currentStep={currentStep}
          currentDetail={currentDetail}
        />
      )}
      {phase === 2 && (
        <ResultsScreen
          general={general}
          setGeneral={setGeneral}
          items={items}
          formulario={general.formulario || "dian"}
          onReset={handleReset}
        />
      )}
    </div>
  )
}
