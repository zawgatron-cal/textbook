interface ProblemPanelProps {
  problem: string
  onProblemChange: (val: string) => void
}

export default function ProblemPanel({ problem, onProblemChange }: ProblemPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 tracking-wide uppercase">
          Problem
        </h2>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        <textarea
          value={problem}
          onChange={(e) => onProblemChange(e.target.value)}
          placeholder="Paste your problem here…&#10;&#10;e.g. A series RLC circuit with R = 100Ω, L = 0.1H, C = 10μF is driven by a voltage source V(t) = 120cos(1000t). Find the impedance Z and the steady-state current."
          className="w-full h-full min-h-48 resize-none text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-transparent border-none outline-none leading-relaxed"
          spellCheck={false}
        />
      </div>

      {problem.trim() && (
        <div className="px-4 pb-4 shrink-0">
          <button
            className="w-full py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition-colors"
            onClick={() => {/* TODO: trigger matching engine */}}
          >
            Find relevant sections
          </button>
        </div>
      )}
    </div>
  )
}
