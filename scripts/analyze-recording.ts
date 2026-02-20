#!/usr/bin/env npx tsx
/**
 * Analyze a Chrome DevTools performance recording JSON file.
 *
 * Usage: npx tsx recordings/analyze-recording.ts <recording.json>
 */
import { readFileSync } from "fs"

type Record = {
  type: string
  eventType?: string
  startTime: number
  endTime: number
  details?: string
  extraDetails?: { type?: string }
}

type StackFrame = {
  name?: string
  url?: string
  line?: number
}

type StackTrace = {
  stackFrames: StackFrame[]
}

type Recording = {
  startTime: number
  endTime: number
  records: Record[]
  samples?: { stackTraces: StackTrace[]; durations: number[] }[]
}

function classifyUrl(url: string): string {
  if (url.includes("src/")) return "src/" + url.split("src/").pop()!.split("?")[0]
  if (url.includes("node_modules")) return url.split("node_modules/").pop()!.split("?")[0]
  return url.split("/").pop()!.split("?")[0]
}

function makeKey(frame: StackFrame): string {
  const name = frame.name || "(anonymous)"
  const url = classifyUrl(frame.url || "")
  const line = frame.line
  return line ? `${name} [${url}:${line}]` : `${name} [${url}]`
}

function analyzeFrames(records: Record[]) {
  const frames = records.filter((r) => r.type === "timeline-record-type-rendering-frame")
  const durations = frames.map((r) => (r.endTime - r.startTime) * 1000).sort((a, b) => b - a)

  console.log("=== RENDERING FRAMES ===")
  console.log(`Total frames: ${frames.length}`)
  console.log(
    `Longest 10: ${durations
      .slice(0, 10)
      .map((d) => `${d.toFixed(1)}ms`)
      .join(", ")}`,
  )
  console.log(`Frames > 16ms (60fps): ${durations.filter((d) => d > 16).length}`)
  console.log(`Frames > 33ms (30fps): ${durations.filter((d) => d > 33).length}`)
  console.log(`Frames > 100ms: ${durations.filter((d) => d > 100).length}`)
  console.log()
}

function analyzeLayout(records: Record[]) {
  const layouts = records.filter((r) => r.type === "timeline-record-type-layout")
  const stats = new Map<string, { count: number; totalDur: number; maxDur: number }>()

  for (const l of layouts) {
    const lt = l.eventType || "unknown"
    const dur = (l.endTime - l.startTime) * 1000
    const s = stats.get(lt) || { count: 0, totalDur: 0, maxDur: 0 }
    s.count++
    s.totalDur += dur
    s.maxDur = Math.max(s.maxDur, dur)
    stats.set(lt, s)
  }

  console.log("=== LAYOUT EVENTS ===")
  const sorted = [...stats.entries()].sort((a, b) => b[1].totalDur - a[1].totalDur)
  for (const [lt, s] of sorted) {
    console.log(
      `  ${lt}: count=${s.count}, total=${s.totalDur.toFixed(1)}ms, max=${s.maxDur.toFixed(1)}ms`,
    )
  }
  console.log()
}

function analyzeScripts(records: Record[]) {
  const scripts = records.filter((r) => r.type === "timeline-record-type-script")
  const stats = new Map<string, { count: number; totalDur: number; maxDur: number }>()

  for (const s of scripts) {
    const st = s.eventType || "unknown"
    const dur = (s.endTime - s.startTime) * 1000
    const entry = stats.get(st) || { count: 0, totalDur: 0, maxDur: 0 }
    entry.count++
    entry.totalDur += dur
    entry.maxDur = Math.max(entry.maxDur, dur)
    stats.set(st, entry)
  }

  console.log("=== SCRIPT EVENTS ===")
  const sorted = [...stats.entries()].sort((a, b) => b[1].totalDur - a[1].totalDur)
  for (const [st, s] of sorted) {
    console.log(
      `  ${st}: count=${s.count}, total=${s.totalDur.toFixed(1)}ms, max=${s.maxDur.toFixed(1)}ms`,
    )
  }
  console.log()

  const longEvents = scripts
    .map((s) => ({ ...s, dur: (s.endTime - s.startTime) * 1000 }))
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 10)

  console.log("=== TOP 10 LONGEST SCRIPT EXECUTIONS ===")
  for (const s of longEvents) {
    const details = s.details || ""
    const extraType = s.extraDetails?.type || ""
    let label = details ? `${s.eventType}(${details})` : s.eventType || "?"
    if (extraType && extraType !== details) label += ` [${extraType}]`
    console.log(`  ${s.dur.toFixed(1)}ms  ${label}`)
  }
  console.log()
}

function analyzeCpuProfile(rec: Recording) {
  const samples = rec.samples
  if (!samples?.length) {
    console.log("=== CPU PROFILE: No samples found ===\n")
    return
  }

  const { stackTraces, durations } = samples[0]

  const selfTime = new Map<string, number>()
  const totalTime = new Map<string, number>()
  const srcSelf = new Map<string, number>()
  const srcTotal = new Map<string, number>()

  for (let i = 0; i < stackTraces.length; i++) {
    const dur = durations[i] ?? 0.001
    const frames = stackTraces[i].stackFrames
    if (!frames.length) continue

    // Self time = top of stack
    const topKey = makeKey(frames[0])
    selfTime.set(topKey, (selfTime.get(topKey) || 0) + dur)
    if (frames[0].url?.includes("src/")) {
      srcSelf.set(topKey, (srcSelf.get(topKey) || 0) + dur)
    }

    // Total time = all unique frames in stack
    const seen = new Set<string>()
    for (const f of frames) {
      const key = makeKey(f)
      if (!seen.has(key)) {
        totalTime.set(key, (totalTime.get(key) || 0) + dur)
        if (f.url?.includes("src/")) {
          srcTotal.set(key, (srcTotal.get(key) || 0) + dur)
        }
        seen.add(key)
      }
    }
  }

  const topN = (map: Map<string, number>, n: number) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)

  console.log(`=== CPU PROFILE (${stackTraces.length} samples) ===\n`)

  console.log("--- Top 20 by self time (all) ---")
  for (const [func, time] of topN(selfTime, 20)) {
    console.log(`  ${(time * 1000).toFixed(1)}ms  ${func}`)
  }
  console.log()

  console.log("--- Top 20 by total time (all) ---")
  for (const [func, time] of topN(totalTime, 20)) {
    console.log(`  ${(time * 1000).toFixed(1)}ms  ${func}`)
  }
  console.log()

  if (srcSelf.size) {
    console.log("--- App source (src/) by self time ---")
    for (const [func, time] of topN(srcSelf, 20)) {
      console.log(`  ${(time * 1000).toFixed(1)}ms  ${func}`)
    }
    console.log()
  }

  if (srcTotal.size) {
    console.log("--- App source (src/) by total time ---")
    for (const [func, time] of topN(srcTotal, 20)) {
      console.log(`  ${(time * 1000).toFixed(1)}ms  ${func}`)
    }
    console.log()
  }
}

// --- Main ---

const path = process.argv[2]
if (!path) {
  console.error("Usage: npx tsx recordings/analyze-recording.ts <recording.json>")
  process.exit(1)
}

const data = JSON.parse(readFileSync(path, "utf-8"))
const rec: Recording = data.recording
const durationMs = (rec.endTime - rec.startTime) * 1000

console.log(`Recording: ${Math.round(durationMs)}ms\n`)

analyzeFrames(rec.records)
analyzeLayout(rec.records)
analyzeScripts(rec.records)
analyzeCpuProfile(rec)
