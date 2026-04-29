import { useState, useRef } from 'react'
import PdfViewer from './components/PdfViewer'
import ProblemPanel from './components/ProblemPanel'

export default function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [problem, setProblem] = useState('')
  const [pdfScale, setPdfScale] = useState(1.2)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      setPdfFile(file)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type === 'application/pdf') {
      setPdfFile(file)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* Top nav */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
            Textbook Navigator
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Zoom controls */}
          {pdfFile && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPdfScale((s) => Math.max(0.5, +(s - 0.1).toFixed(1)))}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-base transition-colors"
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="text-xs text-slate-500 w-10 text-center tabular-nums">
                {Math.round(pdfScale * 100)}%
              </span>
              <button
                onClick={() => setPdfScale((s) => Math.min(3, +(s + 0.1).toFixed(1)))}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-base transition-colors"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
          )}

          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {pdfFile ? 'Replace PDF' : 'Open PDF'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </header>

      {/* Main split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — problem input */}
        <div className="w-80 shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
          <ProblemPanel problem={problem} onProblemChange={setProblem} />
        </div>

        {/* Right panel — PDF viewer */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {!pdfFile ? (
            <DropZone onClick={() => fileInputRef.current?.click()} />
          ) : (
            <PdfViewer file={pdfFile} scale={pdfScale} />
          )}
        </div>
      </div>
    </div>
  )
}

function DropZone({ onClick }: { onClick: () => void }) {
  const [isDragOver, setIsDragOver] = useState(false)

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center cursor-pointer transition-colors ${
        isDragOver
          ? 'bg-indigo-50 dark:bg-indigo-950/30'
          : 'bg-slate-50 dark:bg-slate-950'
      }`}
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false) }}
    >
      <div className={`flex flex-col items-center gap-4 p-10 rounded-2xl border-2 border-dashed transition-colors ${
        isDragOver
          ? 'border-indigo-400 dark:border-indigo-500'
          : 'border-slate-300 dark:border-slate-600'
      }`}>
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${
          isDragOver ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-slate-100 dark:bg-slate-800'
        }`}>
          <svg className={`w-7 h-7 transition-colors ${isDragOver ? 'text-indigo-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Drop your textbook PDF here
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            or click to browse
          </p>
        </div>
      </div>
    </div>
  )
}
