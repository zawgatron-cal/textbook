import { useState, useRef, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface PdfViewerProps {
  file: File | null
  scale?: number
}

export default function PdfViewer({ file, scale = 1.2 }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [isLoading, setIsLoading] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setCurrentPage(1)
    setIsLoading(false)
  }, [])

  const onDocumentLoadStart = useCallback(() => {
    setIsLoading(true)
  }, [])

  const scrollToPage = useCallback((pageNum: number) => {
    const pageEl = pageRefs.current[pageNum - 1]
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || numPages === 0) return

    const containerTop = container.scrollTop
    const containerMid = containerTop + container.clientHeight / 2

    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i]
      if (!el) continue
      const top = el.offsetTop
      const bottom = top + el.offsetHeight
      if (containerMid >= top && containerMid < bottom) {
        setCurrentPage(i + 1)
        break
      }
    }
  }, [numPages])

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = parseInt((e.target as HTMLInputElement).value)
      if (val >= 1 && val <= numPages) scrollToPage(val)
    }
  }

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <p className="text-sm">No PDF loaded</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase">
          Page
        </span>
        <input
          type="number"
          min={1}
          max={numPages}
          defaultValue={currentPage}
          key={currentPage}
          onKeyDown={handlePageInputKeyDown}
          className="w-14 text-center text-sm border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <span className="text-sm text-slate-400">/ {numPages || '—'}</span>

        <div className="ml-auto flex gap-1">
          <button
            onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => scrollToPage(Math.min(numPages, currentPage + 1))}
            disabled={currentPage >= numPages}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scroll container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-auto bg-slate-100 dark:bg-slate-950 px-4 py-4"
        style={{ scrollbarGutter: 'stable' }}
      >
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <svg className="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm">Loading PDF…</span>
          </div>
        )}

        <Document
          file={file}
          onLoadStart={onDocumentLoadStart}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={null}
          error={
            <div className="flex items-center justify-center py-20 text-red-400 text-sm">
              Failed to load PDF. Please try a different file.
            </div>
          }
          className="flex flex-col items-center gap-3"
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div
              key={i}
              ref={(el) => { pageRefs.current[i] = el }}
              className="shadow-lg rounded-sm overflow-hidden bg-white"
            >
              <Page
                pageNumber={i + 1}
                scale={scale}
                renderAnnotationLayer={true}
                renderTextLayer={false}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  )
}
