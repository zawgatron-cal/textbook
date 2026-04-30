import { useState, useRef, useEffect } from 'react'
import PdfViewer from './components/PdfViewer'

export default function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [showControls, setShowControls] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nearTopRef = useRef(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') setPdfFile(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type === 'application/pdf') setPdfFile(file)
  }

  // Track mouse proximity to the top of the screen.
  // Using window-level listeners so they capture events even inside the
  // PdfViewer which attaches its own native listeners.
  useEffect(() => {
    let showTimer: number | null = null
    let hideTimer: number | null = null

    const scheduleHide = () => {
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => { setShowControls(false); hideTimer = null }, 1100)
    }

    const showNow = () => {
      if (showTimer) { clearTimeout(showTimer); showTimer = null }
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
      setShowControls(true)
    }

    const onMove = (e: MouseEvent) => {
      const isNear = e.clientY < 80
      if (isNear === nearTopRef.current) return
      nearTopRef.current = isNear

      if (isNear) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
        showTimer = window.setTimeout(() => { setShowControls(true); showTimer = null }, 350)
      } else {
        if (showTimer) { clearTimeout(showTimer); showTimer = null }
        scheduleHide()
      }
    }

    const onWheel = () => {
      // Show immediately on scroll, then auto-hide after 1.1s of inactivity
      showNow()
      scheduleHide()
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('wheel', onWheel)
      if (showTimer) clearTimeout(showTimer)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [])

  return (
    <div
      className="relative h-screen overflow-hidden"
      style={{ background: '#0a0a0a' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />

      <div className="h-full">
        {!pdfFile
          ? <DropZone onClick={() => fileInputRef.current?.click()} showControls={showControls} />
          : <PdfViewer
              file={pdfFile}
              showControls={showControls}
              onOpenFile={() => fileInputRef.current?.click()}
            />
        }
      </div>
    </div>
  )
}

function DropZone({ onClick, showControls }: { onClick: () => void; showControls: boolean }) {
  const [isDragOver, setIsDragOver] = useState(false)

  return (
    <div
      className="relative h-full flex items-center justify-center cursor-pointer"
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false) }}
    >
      {/* Floating pill — same auto-hide behaviour */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-30 glass-pill flex items-center gap-2 px-4 py-2 select-none"
        style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none', transition: 'opacity 0.35s ease' }}
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="w-3.5 h-3.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span className="text-xs text-white/40">Textbook Navigator</span>
        <div className="w-px h-3" style={{ background: 'rgba(255,255,255,0.12)' }} />
        <button onClick={onClick} className="glass-pill-btn px-3 py-1 text-xs text-white/55">Open PDF</button>
      </div>

      <div
        className="flex flex-col items-center gap-5 px-14 py-12 rounded-3xl transition-all duration-200"
        style={{
          background: isDragOver ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: `1px solid ${isDragOver ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.09)'}`,
          boxShadow: isDragOver
            ? '0 1px 0 rgba(255,255,255,0.15) inset, 0 32px 80px rgba(0,0,0,0.5)'
            : '0 1px 0 rgba(255,255,255,0.10) inset, 0 24px 64px rgba(0,0,0,0.4)',
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.12) inset',
          }}
        >
          <svg className="w-6 h-6 text-white/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-white/55">Drop your textbook PDF here</p>
          <p className="text-xs text-white/25 mt-1">or click to browse</p>
        </div>
      </div>
    </div>
  )
}
