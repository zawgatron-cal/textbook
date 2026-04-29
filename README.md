# Contextual Textbook Navigator

A tool that surfaces the minimal relevant textbook context needed to solve a physics or math problem — worked examples, derivations, and formulas — with clickable jump-to navigation directly in the PDF.

## Motivation

First-year physics and calculus students doing homework lose significant time flipping between a problem and their textbook: searching for the right example, re-reading derivations, chasing down formulas. The feedback loop is fragmented. This project closes that loop by mapping a problem directly to the textbook sections that matter.

## How it works

1. **Upload** your textbook PDF
2. **Paste** a homework problem into the left panel
3. The system **interprets** the problem — extracting topic, governing equations, and problem type
4. A **matching engine** retrieves the closest worked example, prerequisite derivation, and relevant formula section from the textbook
5. **Jump-to links** take you directly to each result in the PDF viewer

## Features (current)

- Continuous-scroll PDF viewer with page tracking
- Page navigation toolbar (direct jump, prev/next)
- Zoom controls (50%–300%)
- Drag-and-drop or click-to-upload PDF
- Split-view layout: problem panel + textbook viewer

## Planned

- [ ] Problem interpretation layer (LLM-assisted topic + equation extraction)
- [ ] PDF structure extraction (sections, examples, derivations, formulas)
- [ ] Matching engine (structural similarity + equation overlap)
- [ ] Highlighted jump-to regions in the PDF
- [ ] Hint mode ("give me the next step")
- [ ] FastAPI backend

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript (Vite) |
| Styling | Tailwind CSS v4 |
| PDF rendering | react-pdf (PDF.js) |
| Backend (planned) | Python + FastAPI |
| PDF parsing (planned) | PyMuPDF + LLM-assisted structure tagging |

## Getting started

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), upload a textbook PDF, and start navigating.

## Non-goals

This is not a homework solver, a generic "chat with PDF" tool, a note-taking app, or a multi-subject LMS. The only job is surfacing the right part of the textbook for the problem in front of you.
