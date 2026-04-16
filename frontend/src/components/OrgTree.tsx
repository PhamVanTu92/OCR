import React from 'react'
import type { Organization } from '../types'

interface Props { nodes: Organization[] }

// ── Color per hierarchy level ───────────────────���──────────────────────────────
const NODE_COLOR: Record<number, string> = {
  0: 'border-blue-400   bg-blue-50   text-blue-800',
  1: 'border-indigo-300 bg-indigo-50 text-indigo-700',
  2: 'border-purple-300 bg-purple-50 text-purple-700',
  3: 'border-green-300  bg-green-50  text-green-700',
  4: 'border-amber-300  bg-amber-50  text-amber-700',
}

const DOT_COLOR: Record<number, string> = {
  0: 'bg-blue-500', 1: 'bg-indigo-400', 2: 'bg-purple-400',
  3: 'bg-green-500', 4: 'bg-amber-500',
}

// ── Single node + its sub-tree ──────────────────────────────────────────────���─
const TreeNode: React.FC<{ node: Organization }> = ({ node }) => {
  const hasChildren = Boolean(node.children?.length)
  const level       = Math.min(node.level ?? 0, 4)
  const colorCls    = NODE_COLOR[level] ?? NODE_COLOR[4]
  const dotCls      = DOT_COLOR[level]  ?? DOT_COLOR[4]
  const n           = node.children?.length ?? 0

  return (
    <div className="flex flex-col items-center">

      {/* ── Node card ─────────────────────────────────────────��─────────────── */}
      <div className={`border rounded-lg px-3 py-2 text-xs font-medium shadow-sm
        ${colorCls} max-w-[140px] w-max text-center`}>
        <div className="flex items-center gap-1.5 justify-center">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
          <span className="truncate leading-snug">{node.name}</span>
        </div>
        {node.code && (
          <div className="text-[10px] opacity-60 font-mono mt-0.5">{node.code}</div>
        )}
      </div>

      {/* ── Children ───────────────────────��───────────────────────────────���── */}
      {hasChildren && (
        <div className="flex flex-col items-center w-full">

          {/* Vertical stem from node down to horizontal bar */}
          <div className="w-px bg-gray-300" style={{ height: 20 }} />

          {/* Children row — each child brings its own connector segment */}
          <div className="flex items-start">
            {node.children!.map((child, i) => {
              const isFirst = i === 0
              const isLast  = i === n - 1
              const isOnly  = n === 1

              return (
                <div key={child.id} className="flex flex-col items-center" style={{ padding: '0 20px' }}>
                  {/*
                    Connector bridge: a 20px tall area with:
                      • horizontal rail spanning from "my center" outward to siblings
                      • vertical drop from top to bottom (through my center)
                    First child  → rail only goes rightward  (left: 50%, right: 0)
                    Last child   → rail only goes leftward   (left: 0, right: 50%)
                    Middle child → rail spans full width     (left: 0, right: 0)
                    Only child   → no rail, just vertical
                  */}
                  <div className="relative w-full" style={{ height: 20 }}>
                    {/* Horizontal rail */}
                    {!isOnly && (
                      <div
                        className="absolute top-0 bg-gray-300"
                        style={{
                          height: 1,
                          left:  isFirst ? '50%' : 0,
                          right: isLast  ? '50%' : 0,
                        }}
                      />
                    )}
                    {/* Vertical drop */}
                    <div
                      className="absolute bg-gray-300"
                      style={{ width: 1, top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)' }}
                    />
                  </div>

                  <TreeNode node={child} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Root component ─────────────────────────────────────────────────────────���───
export default function OrgTree({ nodes }: Props) {
  // Accept either a flat list (filter roots) or an already-hierarchical list
  const roots = nodes.filter(n => n.parent_id === null || n.level === 0)

  if (!roots.length) {
    // Fallback: if no root found (e.g. data already filtered), render all top-level items
    const topLevel = nodes.filter(n => !nodes.some(p => p.id === n.parent_id))
    if (!topLevel.length) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Chưa có dữ liệu tổ chức
        </div>
      )
    }
    return (
      <div className="overflow-auto h-full flex items-start justify-center pt-6 pb-4">
        <div className="flex gap-10 flex-wrap justify-center">
          {topLevel.map(r => <TreeNode key={r.id} node={r} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-auto h-full flex items-start justify-center pt-6 pb-4">
      <div className="flex gap-10 flex-wrap justify-center">
        {roots.map(r => <TreeNode key={r.id} node={r} />)}
      </div>
    </div>
  )
}
