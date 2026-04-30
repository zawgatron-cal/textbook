import { useState, useRef, useCallback } from 'react'
import PdfViewer from './PdfViewer'
import type { LayoutNode } from './layoutUtils'

export type { LayoutNode }

// ─── Shared props ────────────────────────────────────────────────────────────

interface SharedProps {
  showControls: boolean
  panelFiles: Record<string, File | null>
  onOpenFile: (leafId: string) => void   // triggers file input for this panel
  onSetFile:  (leafId: string, file: File) => void  // direct set (drag-drop)
  onSplit:  (leafId: string, dir: 'h' | 'v', ratio: number) => void
  onResize: (splitId: string, ratio: number) => void
  onMerge:  (leafId: string) => void
}

// ─── PanelLayout ─────────────────────────────────────────────────────────────

export function PanelLayout({ node, ...rest }: SharedProps & { node: LayoutNode }) {
  if (node.type === 'leaf') return <PanelLeaf panelId={node.id} {...rest} />
  return <SplitPane split={node} {...rest} />
}

// ─── SplitPane ───────────────────────────────────────────────────────────────

function SplitPane({
  split, ...rest
}: SharedProps & { split: Extract<LayoutNode, { type: 'split' }> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const isH = split.dir === 'h'

  const onHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const onMove = (ev: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const ratio = isH
        ? Math.max(0.1, Math.min(0.9, (ev.clientY - rect.top) / rect.height))
        : Math.max(0.1, Math.min(0.9, (ev.clientX - rect.left) / rect.width))
      rest.onResize(split.id, ratio)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ display: 'flex', flexDirection: isH ? 'column' : 'row' }}
    >
      <div style={{
        [isH ? 'height' : 'width']: `${split.ratio * 100}%`,
        flexShrink: 0, overflow: 'hidden', position: 'relative',
      }}>
        <PanelLayout node={split.a} {...rest} />
      </div>

      {/* Resize handle */}
      <div
        className={isH ? 'cursor-row-resize' : 'cursor-col-resize'}
        style={{
          [isH ? 'height' : 'width']: 8,
          [isH ? 'width' : 'height']: '100%',
          flexShrink: 0, position: 'relative', zIndex: 10,
        }}
        onMouseDown={onHandleMouseDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{
          position: 'absolute',
          [isH ? 'top' : 'left']: '50%',
          [isH ? 'left' : 'top']: 0,
          [isH ? 'width' : 'height']: '100%',
          [isH ? 'height' : 'width']: 1,
          transform: isH ? 'translateY(-50%)' : 'translateX(-50%)',
          background: hovered ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.14)',
          transition: 'background 0.15s ease',
          boxShadow: hovered ? '0 0 6px rgba(255,255,255,0.15)' : 'none',
        }} />
      </div>

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <PanelLayout node={split.b} {...rest} />
      </div>
    </div>
  )
}

// ─── PanelLeaf ───────────────────────────────────────────────────────────────

type Corner = 'tl' | 'tr' | 'bl' | 'br'
type DragPreview =
  | { mode: 'split'; dir: 'h' | 'v'; ratio: number }
  | { mode: 'merge' }

function PanelLeaf({ panelId, showControls, panelFiles, onOpenFile, onSetFile, onSplit, onMerge }: SharedProps & { panelId: string }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const file = panelFiles[panelId] ?? null

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startCornerDrag = useCallback((e: React.MouseEvent, _c: Corner) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY

    const calc = (ev: MouseEvent): DragPreview | null => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return null
      if (!panelRef.current) return null
      const rect = panelRef.current.getBoundingClientRect()
      if (ev.clientX < rect.left || ev.clientX > rect.right ||
          ev.clientY < rect.top  || ev.clientY > rect.bottom) {
        return { mode: 'merge' }
      }
      const dir: 'h' | 'v' = Math.abs(dx) > Math.abs(dy) ? 'v' : 'h'
      const ratio = dir === 'v'
        ? Math.max(0.1, Math.min(0.9, (ev.clientX - rect.left) / rect.width))
        : Math.max(0.1, Math.min(0.9, (ev.clientY - rect.top) / rect.height))
      return { mode: 'split', dir, ratio }
    }

    const onMove = (ev: MouseEvent) => setPreview(calc(ev))

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const p = calc(ev)
      setPreview(null)
      if (!p) return
      if (p.mode === 'merge') onMerge(panelId)
      else onSplit(panelId, p.dir, p.ratio)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [panelId, onSplit, onMerge])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.type === 'application/pdf') onSetFile(panelId, f)
  }

  return (
    <div
      ref={panelRef}
      className="relative w-full h-full"
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {file
        ? <PdfViewer
            file={file}
            showControls={showControls}
            onOpenFile={() => onOpenFile(panelId)}
          />
        : <PanelDropZone
            isDragOver={isDragOver}
            showControls={showControls}
            onOpen={() => onOpenFile(panelId)}
          />
      }

      {/* Split preview — white line */}
      {preview?.mode === 'split' && (
        <div className="absolute inset-0 pointer-events-none z-50">
          <div style={{
            position: 'absolute',
            background: 'rgba(255,255,255,0.6)',
            boxShadow: '0 0 16px rgba(255,255,255,0.3)',
            ...(preview.dir === 'v'
              ? { top: 0, bottom: 0, left: `${preview.ratio * 100}%`, width: 2, transform: 'translateX(-50%)' }
              : { left: 0, right: 0, top: `${preview.ratio * 100}%`, height: 2, transform: 'translateY(-50%)' }
            ),
          }} />
        </div>
      )}

      {/* Merge preview */}
      {preview?.mode === 'merge' && (
        <div className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}>
          <div className="flex flex-col items-center gap-2">
            <svg className="w-8 h-8 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" />
            </svg>
            <span className="text-xs text-white/50 tracking-wide">Collapse panel</span>
          </div>
        </div>
      )}

      {/* Corner affordances — z-50 to ensure they're above all viewer content */}
      {(['tl', 'tr', 'bl', 'br'] as const).map(c => (
        <CornerHandle key={c} corner={c} onMouseDown={(e) => startCornerDrag(e, c)} />
      ))}
    </div>
  )
}

// ─── PanelDropZone ────────────────────────────────────────────────────────────

function PanelDropZone({ isDragOver, showControls, onOpen }: {
  isDragOver: boolean
  showControls: boolean
  onOpen: () => void
}) {
  return (
    <div className="relative w-full h-full flex items-center justify-center cursor-pointer"
      style={{ background: '#0a0a0a' }}
      onClick={onOpen}
    >
      {/* Floating pill */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-40 glass-pill flex items-center gap-2 px-4 py-2 select-none"
        style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none', transition: 'opacity 0.35s ease' }}
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="w-3.5 h-3.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span className="text-xs text-white/40">Textbook Navigator</span>
        <div className="w-px h-3" style={{ background: 'rgba(255,255,255,0.12)' }} />
        <button onClick={onOpen} className="glass-pill-btn px-3 py-1 text-xs text-white/55">Open PDF</button>
      </div>

      {/* Drop target card */}
      <div
        className="flex flex-col items-center gap-4 px-12 py-10 rounded-3xl transition-all duration-200 pointer-events-none"
        style={{
          background: isDragOver ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: `1px solid ${isDragOver ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
          boxShadow: isDragOver
            ? '0 1px 0 rgba(255,255,255,0.15) inset, 0 24px 64px rgba(0,0,0,0.5)'
            : '0 1px 0 rgba(255,255,255,0.08) inset, 0 16px 48px rgba(0,0,0,0.35)',
        }}
      >
        <svg className="w-8 h-8 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <div className="text-center">
          <p className="text-sm text-white/40">Drop a PDF or click to open</p>
        </div>
      </div>
    </div>
  )
}

// ─── CornerHandle ─────────────────────────────────────────────────────────────

function CornerHandle({ corner, onMouseDown }: {
  corner: Corner
  onMouseDown: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)
  const isTop  = corner[0] === 't'
  const isLeft = corner[1] === 'l'
  const rot = isTop && isLeft ? 0 : isTop && !isLeft ? 90 : !isTop && !isLeft ? 180 : 270

  // Offset br corner a few px inward to avoid the browser's native window-resize grip
  const edgeInset = (!isTop && !isLeft) ? 4 : 0

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="absolute cursor-crosshair"
      style={{
        [isTop  ? 'top'    : 'bottom']: edgeInset,
        [isLeft ? 'left'   : 'right' ]: edgeInset,
        width: 32, height: 32,
        zIndex: 50,   // above all viewer content including pills (z-20) and overlays (z-40)
        display: 'flex',
        alignItems:     isTop  ? 'flex-start' : 'flex-end',
        justifyContent: isLeft ? 'flex-start' : 'flex-end',
        padding: 4,
      }}
    >
      <svg
        width="16" height="16" viewBox="0 0 16 16"
        style={{
          opacity: hovered ? 0.9 : 0.35,
          transition: 'opacity 0.12s ease',
          transform: `rotate(${rot}deg)`,
          filter: hovered ? 'drop-shadow(0 0 4px rgba(255,255,255,0.6))' : 'none',
        }}
      >
        <polygon points="0,0 16,0 0,16" fill="white" />
      </svg>
    </div>
  )
}
