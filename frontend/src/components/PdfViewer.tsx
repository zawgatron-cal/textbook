import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const RENDER_SCALE  = 1.5
const PAGE_GAP      = 16
const OVERSCAN_PX   = 7000   // pre-render ~5 pages ahead/behind
const KEEP_ALIVE_PX = 14000  // keep pages mounted until ~10 pages away

// requestIdleCallback polyfill (Safari < 16)
const rIC: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number =
  typeof requestIdleCallback !== 'undefined'
    ? (cb, opts) => requestIdleCallback(cb, opts)
    : (cb) => setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 50 } as IdleDeadline), 1) as unknown as number

const cIC: (id: number) => void =
  typeof cancelIdleCallback !== 'undefined'
    ? (id) => cancelIdleCallback(id)
    : (id) => clearTimeout(id)

interface PageSize      { width: number; height: number }
interface VisibleRange  { first: number; last: number }
interface PdfViewerProps {
  file: File | null
  showControls: boolean
  onOpenFile: () => void
}

export default function PdfViewer({ file, showControls, onOpenFile }: PdfViewerProps) {

  // ── React state ────────────────────────────────────────────────────────────
  const [numPages,      setNumPages]      = useState(0)
  const [pageSizes,     setPageSizes]     = useState<PageSize[]>([])
  const [visibleRange,  setVisibleRange]  = useState<VisibleRange>({ first: 0, last: -1 })
  const [displayZoom,   setDisplayZoom]   = useState(1.0)
  const [currentPage,   setCurrentPage]   = useState(1)
  const [isDragging,    setIsDragging]    = useState(false)
  const [loadingMsg,    setLoadingMsg]    = useState('')

  // ── Imperative refs ────────────────────────────────────────────────────────
  const viewportRef   = useRef<HTMLDivElement>(null)
  const contentRef    = useRef<HTMLDivElement>(null)
  const transformRef  = useRef({ pan: { x: 0, y: 24 }, zoom: 1.0 })
  const dragRef       = useRef({ active: false, startX: 0, startY: 0, panX: 0, panY: 0 })
  const vrRef         = useRef<VisibleRange>({ first: 0, last: -1 })

  const pagePositionsRef = useRef<number[]>([])
  const pageSizesRef     = useRef<PageSize[]>([])

  const pageRafRef = useRef<number | null>(null)
  const zoomRafRef = useRef<number | null>(null)

  // ── Custom render pipeline ────────────────────────────────────────────────
  // Pages are drawn to <canvas> elements via requestIdleCallback so that
  // canvas work never runs during a scroll animation frame.
  const pdfDocRef           = useRef<PDFDocumentProxy | null>(null)
  const pdfUrlRef           = useRef<string | null>(null)
  const canvasMap           = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const renderQueue         = useRef<Set<number>>(new Set())
  const activeRenders       = useRef<Map<number, RenderTask>>(new Map())
  const isProcessingRef     = useRef(false)
  const pendingIdleRef      = useRef<number | null>(null)

  // ── Geometry (React render) ───────────────────────────────────────────────

  const pagePositions = useMemo(() => {
    const out: number[] = []; let y = 0
    for (const { height } of pageSizes) { out.push(y); y += height + PAGE_GAP }
    return out
  }, [pageSizes])

  const totalHeight = useMemo(() => {
    if (!pageSizes.length) return 0
    return pagePositions[pageSizes.length - 1] + pageSizes[pageSizes.length - 1].height
  }, [pageSizes, pagePositions])

  const maxPageWidth = useMemo(
    () => pageSizes.reduce((m, p) => Math.max(m, p.width), 595 * RENDER_SCALE),
    [pageSizes],
  )

  // ── Geometry helpers (imperative) ─────────────────────────────────────────

  const computeRange = useCallback((
    pan: { x: number; y: number }, zoom: number, overscan: number,
  ): VisibleRange => {
    const sizes = pageSizesRef.current, positions = pagePositionsRef.current
    const n = sizes.length
    if (!n || !viewportRef.current) return { first: 0, last: -1 }
    const vh  = viewportRef.current.clientHeight
    const top = (-pan.y / zoom) - overscan
    const bot = ((vh - pan.y) / zoom) + overscan
    let lo = 0, hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (positions[mid] + sizes[mid].height < top) lo = mid + 1; else hi = mid
    }
    let last = lo
    while (last < n - 1 && positions[last + 1] <= bot) last++
    return { first: lo, last }
  }, [])

  const computeCurrentPage = useCallback((pan: { x: number; y: number }, zoom: number): number => {
    const positions = pagePositionsRef.current
    if (!positions.length || !viewportRef.current) return 1
    const cy = (viewportRef.current.clientHeight / 2 - pan.y) / zoom
    let lo = 0, hi = positions.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (positions[mid] <= cy) lo = mid; else hi = mid - 1
    }
    return lo + 1
  }, [])

  // ── Render queue ──────────────────────────────────────────────────────────

  const processQueue = useCallback(() => {
    if (isProcessingRef.current || renderQueue.current.size === 0) return
    isProcessingRef.current = true

    const runNext = () => {
      const queue = renderQueue.current
      if (queue.size === 0) { isProcessingRef.current = false; return }

      const pageIdx = queue.values().next().value as number
      queue.delete(pageIdx)

      pendingIdleRef.current = rIC(async (deadline) => {
        pendingIdleRef.current = null
        const canvas = canvasMap.current.get(pageIdx)
        const pdf    = pdfDocRef.current
        const size   = pageSizesRef.current[pageIdx]

        if (canvas && pdf && size && (deadline.timeRemaining() > 4 || deadline.didTimeout)) {
          try {
            const page: PDFPageProxy = await pdf.getPage(pageIdx + 1)
            // Guard: canvas might have been unmounted while we were awaiting
            if (!canvasMap.current.has(pageIdx)) { runNext(); return }
            const vp  = page.getViewport({ scale: RENDER_SCALE })
            canvas.width  = vp.width
            canvas.height = vp.height
            const task = page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp, canvas })
            activeRenders.current.set(pageIdx, task)
            await task.promise
          } catch {
            // Cancelled or unmounted — ignore
          } finally {
            activeRenders.current.delete(pageIdx)
          }
        } else if (canvas) {
          // Not enough idle time, requeue
          queue.add(pageIdx)
        }
        runNext()
      }, { timeout: 400 })
    }

    runNext()
  }, [])

  const scheduleRender = useCallback((pageIdx: number) => {
    renderQueue.current.add(pageIdx)
    processQueue()
  }, [processQueue])

  const cancelRender = useCallback((pageIdx: number) => {
    renderQueue.current.delete(pageIdx)
    const task = activeRenders.current.get(pageIdx)
    if (task) { try { task.cancel() } catch { /* ignore */ } activeRenders.current.delete(pageIdx) }
    canvasMap.current.delete(pageIdx)
  }, [])

  // ── Transform (hot path) ──────────────────────────────────────────────────

  const applyTransform = useCallback((pan: { x: number; y: number }, zoom: number) => {
    if (contentRef.current) {
      contentRef.current.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
    }
    transformRef.current = { pan, zoom }

    // Expand range for new pages, shrink only past keep-alive boundary
    const desired   = computeRange(pan, zoom, OVERSCAN_PX)
    const keepAlive = computeRange(pan, zoom, KEEP_ALIVE_PX)
    const cur       = vrRef.current
    const nf = Math.min(desired.first, Math.max(cur.first, keepAlive.first))
    const nl = Math.max(desired.last,  Math.min(cur.last,  keepAlive.last))
    if (nf !== cur.first || nl !== cur.last) {
      vrRef.current = { first: nf, last: nl }
      setVisibleRange({ first: nf, last: nl })
    }

    if (zoomRafRef.current === null)
      zoomRafRef.current = requestAnimationFrame(() => {
        setDisplayZoom(transformRef.current.zoom); zoomRafRef.current = null
      })
    if (pageRafRef.current === null)
      pageRafRef.current = requestAnimationFrame(() => {
        setCurrentPage(computeCurrentPage(transformRef.current.pan, transformRef.current.zoom))
        pageRafRef.current = null
      })
  }, [computeRange, computeCurrentPage])

  // ── Native event listeners (zero React overhead on hot paths) ─────────────

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { pan, zoom } = transformRef.current
      if (e.ctrlKey || e.metaKey) {
        const r  = vp.getBoundingClientRect()
        const cx = e.clientX - r.left, cy = e.clientY - r.top
        const nz = Math.max(0.05, Math.min(5, zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)))
        applyTransform({ x: cx - (cx - pan.x) * (nz / zoom), y: cy - (cy - pan.y) * (nz / zoom) }, nz)
      } else {
        applyTransform({ x: pan.x - e.deltaX, y: pan.y - e.deltaY }, zoom)
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return
      applyTransform(
        { x: dragRef.current.panX + e.clientX - dragRef.current.startX,
          y: dragRef.current.panY + e.clientY - dragRef.current.startY },
        transformRef.current.zoom,
      )
    }
    const onMouseUp = () => { dragRef.current.active = false; setIsDragging(false) }

    vp.addEventListener('wheel',      onWheel,     { passive: false })
    vp.addEventListener('mousemove',  onMouseMove)
    vp.addEventListener('mouseup',    onMouseUp)
    vp.addEventListener('mouseleave', onMouseUp)
    return () => {
      vp.removeEventListener('wheel',      onWheel)
      vp.removeEventListener('mousemove',  onMouseMove)
      vp.removeEventListener('mouseup',    onMouseUp)
      vp.removeEventListener('mouseleave', onMouseUp)
    }
  }, [applyTransform])

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const { pan } = transformRef.current
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    setIsDragging(true)
  }

  // ── Document loading ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!file) return
    let cancelled = false

    const load = async () => {
      // Tear down previous document
      if (pendingIdleRef.current !== null) { cIC(pendingIdleRef.current); pendingIdleRef.current = null }
      renderQueue.current.clear()
      activeRenders.current.forEach(t => { try { t.cancel() } catch { /* ignore */ } })
      activeRenders.current.clear()
      canvasMap.current.clear()
      isProcessingRef.current = false
      pdfDocRef.current?.destroy()
      pdfDocRef.current = null
      if (pdfUrlRef.current) { URL.revokeObjectURL(pdfUrlRef.current); pdfUrlRef.current = null }

      setNumPages(0); setPageSizes([]); setLoadingMsg('Opening PDF…')
      vrRef.current = { first: 0, last: -1 }
      setVisibleRange({ first: 0, last: -1 })

      const url = URL.createObjectURL(file)
      pdfUrlRef.current = url

      const pdf = await getDocument(url).promise
      if (cancelled) { pdf.destroy(); return }
      pdfDocRef.current = pdf

      const n = pdf.numPages
      setNumPages(n); setLoadingMsg(`Reading ${n} pages…`)

      const sizes = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          pdf.getPage(i + 1).then((p: PDFPageProxy) => {
            const vp = p.getViewport({ scale: RENDER_SCALE })
            return { width: vp.width, height: vp.height }
          }),
        ),
      )
      if (cancelled) return

      let y = 0; const positions: number[] = []; let maxW = 0
      for (const { width, height } of sizes) {
        positions.push(y); y += height + PAGE_GAP; maxW = Math.max(maxW, width)
      }
      pageSizesRef.current     = sizes
      pagePositionsRef.current = positions

      setPageSizes(sizes); setLoadingMsg('')

      const vp = viewportRef.current
      if (!vp || !sizes[0]) return
      const nz = Math.min(1.0, (vp.clientWidth - 64) / sizes[0].width)
      applyTransform({ x: (vp.clientWidth - sizes[0].width * nz) / 2, y: 24 }, nz)
      setDisplayZoom(nz)
    }

    load().catch(console.error)
    return () => { cancelled = true }
  }, [file, applyTransform])

  // ── Toolbar actions ───────────────────────────────────────────────────────

  const fitToWidth = useCallback(() => {
    const vp = viewportRef.current, sizes = pageSizesRef.current
    if (!vp || !sizes[0]) return
    const nz = (vp.clientWidth - 48) / sizes[0].width
    applyTransform({ x: (vp.clientWidth - sizes[0].width * nz) / 2, y: 24 }, nz)
    setDisplayZoom(nz)
  }, [applyTransform])

  const jumpToPage = useCallback((pageNum: number) => {
    const vp = viewportRef.current, sizes = pageSizesRef.current, pos = pagePositionsRef.current
    if (!vp || pageNum < 1 || pageNum > sizes.length) return
    const { zoom } = transformRef.current
    applyTransform({ x: (vp.clientWidth - sizes[pageNum - 1].width * zoom) / 2, y: 24 - pos[pageNum - 1] * zoom }, zoom)
    setCurrentPage(pageNum)
  }, [applyTransform])

  // ── Render ────────────────────────────────────────────────────────────────

  if (!file) return null
  const isLoading = pageSizes.length === 0
  const { first, last } = visibleRange

  return (
    <div className="relative h-full">

      {/* Single combined floating pill — fades in when mouse nears top */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-20 glass-pill flex items-center gap-2 px-3.5 py-2 select-none whitespace-nowrap"
        style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none', transition: 'opacity 0.35s ease' }}
      >
        {/* Identity */}
        <svg className="w-3.5 h-3.5 text-white/35 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span className="text-xs text-white/40 max-w-[180px] truncate">
          {file ? file.name.replace(/\.pdf$/i, '') : '—'}
        </span>

        <div className="w-px h-3 mx-0.5 shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }} />

        {/* Page navigation */}
        <button onClick={() => jumpToPage(currentPage - 1)} disabled={currentPage <= 1 || isLoading}
          className="glass-pill-btn w-6 h-6 flex items-center justify-center shrink-0" aria-label="Previous page">
          <svg className="w-3 h-3 text-white/55" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>

        <div className="flex items-center gap-1">
          <input type="number" min={1} max={numPages} value={currentPage} disabled={isLoading}
            onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) jumpToPage(v) }}
            className="glass-input w-9 text-center text-xs px-1 py-0.5 tabular-nums" />
          <span className="text-xs text-white/22 tabular-nums">/ {numPages || '—'}</span>
        </div>

        <button onClick={() => jumpToPage(currentPage + 1)} disabled={currentPage >= numPages || isLoading}
          className="glass-pill-btn w-6 h-6 flex items-center justify-center shrink-0" aria-label="Next page">
          <svg className="w-3 h-3 text-white/55" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div className="w-px h-3 mx-0.5 shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }} />

        {/* Zoom */}
        <span className="text-xs text-white/28 tabular-nums w-8 text-center">{Math.round(displayZoom * 100)}%</span>
        <button onClick={fitToWidth} disabled={isLoading} className="glass-pill-btn px-2.5 py-0.5 text-xs text-white/50">
          Fit
        </button>

        <div className="w-px h-3 mx-0.5 shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }} />

        {/* Open / Replace */}
        <button onClick={onOpenFile} className="glass-pill-btn px-2.5 py-0.5 text-xs text-white/50">
          Replace
        </button>
      </div>

      {/* Viewport */}
      <div ref={viewportRef}
        className={`absolute inset-0 overflow-hidden ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ background: '#0a0a0a' }}
        onMouseDown={onMouseDown}>

        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/40 pointer-events-none z-10">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-xs">{loadingMsg || 'Loading…'}</span>
          </div>
        )}

        {/*
          willChange: transform promotes this to a GPU compositor layer so
          the CSS transform never triggers a main-thread repaint.
        */}
        <div ref={contentRef} style={{ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0', willChange: 'transform' }}>
          {!isLoading && (
            <div style={{ position: 'relative', width: maxPageWidth, height: totalHeight }}>
              {Array.from({ length: Math.max(0, last - first + 1) }, (_, j) => {
                const i    = first + j
                const size = pageSizes[i]
                return (
                  <div key={i} style={{
                    position: 'absolute', top: pagePositions[i],
                    left: (maxPageWidth - size.width) / 2,
                    width: size.width, height: size.height,
                    backgroundColor: 'white',
                    borderRadius: 4, overflow: 'hidden',
                    boxShadow: '0 0 0 0.5px rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.5), 0 24px 64px rgba(0,0,0,0.7)',
                  }}>
                    {/*
                      Canvas ref callback drives the entire render lifecycle:
                      mount   → schedule render via requestIdleCallback
                      unmount → cancel any in-progress render, free resources
                    */}
                    <canvas style={{ display: 'block' }}
                      ref={(canvas) => {
                        if (canvas) { canvasMap.current.set(i, canvas); scheduleRender(i) }
                        else        { cancelRender(i) }
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
