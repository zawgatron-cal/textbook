import { useState, useRef, useEffect } from 'react'
import { PanelLayout } from './components/PanelLayout'
import { createLeaf, splitLayout, resizeLayout, mergeLayout, collectLeafIds, type LayoutNode } from './components/layoutUtils'
import type { PdfViewerHandle } from './components/PdfViewer'

export default function App() {
  const [showControls, setShowControls] = useState(false)
  const [layout, setLayout] = useState<LayoutNode>(createLeaf)
  const [panelFiles, setPanelFiles] = useState<Record<string, File | null>>({})
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const activeLeafRef = useRef<string | null>(null)
  const nearTopRef    = useRef(false)
  // View states stored in a ref — mutations never trigger re-renders, but the
  // current snapshot is read during renders caused by layout changes, so
  // surviving panels always receive their last known pan/zoom on remount.
  const viewStatesRef    = useRef<Record<string, { pan: { x: number; y: number }; zoom: number }>>({})
  const panelHandlesRef  = useRef<Record<string, PdfViewerHandle>>({})
  const activePanelRef   = useRef<string | null>(null)
  const panelFilesRef    = useRef(panelFiles)
  useEffect(() => { panelFilesRef.current = panelFiles }, [panelFiles])

  const [isLocked, setIsLocked] = useState(false)
  const lockedRef       = useRef(false)
  const propagatingRef  = useRef(false)  // prevents A→B→A feedback loops

  const isSameFile = (a: File, b: File) =>
    a.name === b.name && a.size === b.size && a.lastModified === b.lastModified

  const getSamePdfPeers = (leafId: string): string[] => {
    const myFile = panelFilesRef.current[leafId]
    if (!myFile) return []
    return Object.entries(panelFilesRef.current)
      .filter(([id, f]) => id !== leafId && f && isSameFile(f, myFile))
      .map(([id]) => id)
  }

  const handleRegisterPanel  = (leafId: string, handle: PdfViewerHandle) => { panelHandlesRef.current[leafId] = handle }
  const handleUnregisterPanel = (leafId: string) => { delete panelHandlesRef.current[leafId] }
  const handlePanelHover     = (leafId: string | null) => { activePanelRef.current = leafId }

  const handleToggleLock = () => {
    const next = !lockedRef.current
    lockedRef.current = next
    setIsLocked(next)
  }

  const handleViewChange = (leafId: string, state: { pan: { x: number; y: number }; zoom: number }) => {
    viewStatesRef.current[leafId] = state
    // Lock: mirror to same-PDF peers, but skip if we're already propagating
    // to prevent the A→B→A feedback loop that causes lag
    if (lockedRef.current && !propagatingRef.current) {
      propagatingRef.current = true
      for (const peerId of getSamePdfPeers(leafId)) {
        panelHandlesRef.current[peerId]?.applyViewState(state)
      }
      propagatingRef.current = false
    }
  }

  // S key: one-time sync  |  L key: toggle lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 's' || e.key === 'S') {
        const active = activePanelRef.current
        if (!active) return
        const state = viewStatesRef.current[active]
        if (!state) return
        for (const peerId of getSamePdfPeers(active)) {
          panelHandlesRef.current[peerId]?.applyViewState(state)
        }
      } else if (e.key === 'l' || e.key === 'L') {
        handleToggleLock()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSplit = (leafId: string, dir: 'h' | 'v', ratio: number) => {
    const { layout: next, newLeafId } = splitLayout(layout, leafId, dir, ratio)
    setLayout(next)
    // Inherit the source panel's file in the new panel
    if (newLeafId && panelFiles[leafId]) {
      setPanelFiles(prev => ({ ...prev, [newLeafId]: panelFiles[leafId] }))
    }
  }

  const handleResize = (splitId: string, ratio: number) => {
    setLayout(prev => resizeLayout(prev, splitId, ratio))
  }

  const handleMerge = (leafId: string) => {
    setLayout(prev => {
      const next = mergeLayout(prev, leafId)
      // Clean up files for any panels that were removed
      const kept = new Set(collectLeafIds(next))
      setPanelFiles(files => {
        const updated = { ...files }
        Object.keys(updated).forEach(id => { if (!kept.has(id)) delete updated[id] })
        return updated
      })
      return next
    })
  }

  const handleOpenFile = (leafId: string) => {
    activeLeafRef.current = leafId
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
    fileInputRef.current?.click()
  }

  const handleSetFile = (leafId: string, file: File) => {
    setPanelFiles(prev => ({ ...prev, [leafId]: file }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf' && activeLeafRef.current) {
      handleSetFile(activeLeafRef.current, file)
    }
  }

  // Window-level mouse proximity + scroll to auto-show/hide floating pills
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

    const onWheel = () => { showNow(); scheduleHide() }

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
    <div className="relative h-screen overflow-hidden" style={{ background: '#0a0a0a' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />
      <PanelLayout
        node={layout}
        showControls={showControls}
        isLocked={isLocked}
        panelFiles={panelFiles}
        viewStates={viewStatesRef.current}
        onOpenFile={handleOpenFile}
        onSetFile={handleSetFile}
        onViewChange={handleViewChange}
        onRegisterPanel={handleRegisterPanel}
        onUnregisterPanel={handleUnregisterPanel}
        onPanelHover={handlePanelHover}
        onToggleLock={handleToggleLock}
        onSplit={handleSplit}
        onResize={handleResize}
        onMerge={handleMerge}
      />
    </div>
  )
}
