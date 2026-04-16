import React from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface Props {
  total:             number   // tổng số bản ghi
  page:              number   // trang hiện tại (1-indexed)
  pageSize:          number
  onPageChange:      (page: number) => void
  onPageSizeChange:  (size: number) => void
  pageSizeOptions?:  number[]
  className?:        string
}

const DEFAULT_OPTIONS = [10, 20, 50, 100]

export default function Pagination({
  total, page, pageSize,
  onPageChange, onPageSizeChange,
  pageSizeOptions = DEFAULT_OPTIONS,
  className = '',
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  // Build page number window (max 5 buttons)
  const pageNums: (number | '…')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNums.push(i)
  } else {
    pageNums.push(1)
    if (page > 3)  pageNums.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pageNums.push(i)
    }
    if (page < totalPages - 2) pageNums.push('…')
    pageNums.push(totalPages)
  }

  const btnBase = 'h-8 min-w-[2rem] px-2 flex items-center justify-center rounded text-sm transition-colors select-none'
  const btnActive = 'bg-indigo-600 text-white font-semibold'
  const btnNormal = 'text-gray-600 hover:bg-gray-100 border border-gray-200'
  const btnDisabled = 'text-gray-300 cursor-not-allowed border border-gray-100'

  return (
    <div className={`flex items-center justify-between flex-wrap gap-3 py-3 px-4 border-t bg-white ${className}`}>
      {/* Left: record count */}
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span>
          {total === 0
            ? 'Không có bản ghi'
            : `Hiển thị ${from}–${to} / ${total} bản ghi`}
        </span>
      </div>

      {/* Right: page-size selector + navigation */}
      <div className="flex items-center gap-3">
        {/* Rows per page */}
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <span className="whitespace-nowrap">Dòng/trang:</span>
          <select
            value={pageSize}
            onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1) }}
            className="border border-gray-200 rounded px-1.5 py-1 text-sm text-gray-700
              focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            {pageSizeOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1">
          {/* First */}
          <button
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            className={`${btnBase} ${page === 1 ? btnDisabled : btnNormal}`}
            title="Trang đầu">
            <ChevronsLeft size={14} />
          </button>

          {/* Prev */}
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className={`${btnBase} ${page === 1 ? btnDisabled : btnNormal}`}
            title="Trang trước">
            <ChevronLeft size={14} />
          </button>

          {/* Page numbers */}
          {pageNums.map((p, i) =>
            p === '…' ? (
              <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p as number)}
                className={`${btnBase} ${p === page ? btnActive : btnNormal}`}>
                {p}
              </button>
            )
          )}

          {/* Next */}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className={`${btnBase} ${page >= totalPages ? btnDisabled : btnNormal}`}
            title="Trang tiếp">
            <ChevronRight size={14} />
          </button>

          {/* Last */}
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            className={`${btnBase} ${page >= totalPages ? btnDisabled : btnNormal}`}
            title="Trang cuối">
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
