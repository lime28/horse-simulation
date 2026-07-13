import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const races = {
  FL_R5: {
    label: 'FL_R5',
    trackId: 'FL',
    raceDate: '2026-06-24',
    raceNumber: 5,
    track: 'FL',
    race: 'Race 5',
    surface: 'Dirt',
    distance: '5.5 F',
    course: 'main',
    dataUrl: '/race-data/FL_R5.json',
  },
  IND_R5: {
    label: 'IND_R5',
    trackId: 'IND',
    raceDate: '2026-06-25',
    raceNumber: 5,
    track: 'IND',
    race: 'Race 5',
    surface: 'Turf',
    distance: '8 F',
    course: 'inner',
    dataUrl: '/race-data/IND_R5.json',
  },
  MNR_R8: {
    label: 'MNR_R8',
    trackId: 'MNR',
    raceDate: '2026-06-28',
    raceNumber: 8,
    track: 'MNR',
    race: 'Race 8',
    surface: 'Dirt',
    distance: '5.5 F',
    course: 'main',
    dataUrl: '/race-data/MNR_R8.json',
  },
}

const raceOptions = Object.values(races)
const canvasSize = { width: 800, height: 560 }
const trackFrame = {
  x: 20,
  y: 20,
  width: 760,
  height: 520,
  radius: 8,
}
const trackScale = 0.9
const furlongFeet = 660
const horseLengthFeet = 8
const straightTrack = {
  centerX: canvasSize.width / 2,
  startY: 500,
  finishY: 60,
}
const defaultViewport = {
  x: 0,
  y: 0,
  zoom: 1,
  rotation: 0,
}
const entriesUrl = '/entries_20260622.csv'
const emptyRaceEntries = Object.freeze({})
const trackLayouts = {
  FL: {
    name: 'Finger Lakes',
    description: 'One-mile dirt oval with six-furlong and one-and-one-quarter-mile chutes.',
    main: { leftX: 236.01, rightX: 563.99, centerY: 280, radius: 174, halfTrackWidth: 27, furlongs: 8 },
    inner: null,
    chutes: [
      { label: '6 F chute', side: 'backstretch', endX: 704 },
      { label: '1 1/4 M chute', side: 'homestretch', endX: 96 },
    ],
  },
  IND: {
    name: 'Indiana Downs',
    description: 'One-mile dirt oval with a seven-eighths-mile inner turf course and two diagrammed chutes.',
    main: { leftX: 218, rightX: 582, centerY: 280, radius: 178, halfTrackWidth: 27, furlongs: 8 },
    inner: { leftX: 218, rightX: 582, centerY: 280, radius: 124, halfTrackWidth: 27, furlongs: 7 },
    chutes: [
      { label: '3/4 M chute', side: 'backstretch', endX: 716 },
      { label: '1 1/4 M chute', side: 'homestretch', endX: 84 },
    ],
  },
  MNR: {
    name: 'Mountaineer',
    description: 'One-mile dirt oval with a seven-furlong inner turf course and six-furlong and one-and-one-quarter-mile chutes.',
    main: { leftX: 230, rightX: 570, centerY: 280, radius: 174, halfTrackWidth: 27, furlongs: 8 },
    inner: { leftX: 230, rightX: 570, centerY: 280, radius: 120, halfTrackWidth: 27, furlongs: 7 },
    chutes: [
      { label: '6 F chute', side: 'backstretch', endX: 710 },
      { label: '1 1/4 M chute', side: 'homestretch', endX: 90 },
    ],
  },
}

const horsePalette = [
  '#d71920',
  '#f7f4e8',
  '#1f5fbf',
  '#ffd21f',
  '#16833a',
  '#111111',
  '#f58220',
  '#f5a6c8',
  '#20b6c7',
  '#6f3fb5',
  '#9a9a9a',
  '#9bd13d',
  '#6b3f20',
  '#7a1021',
]

const raceTypeLabels = {
  AOC: 'Allowance Optional Claiming',
  ALW: 'Allowance',
  CLM: 'Claiming',
  MCL: 'Maiden Claiming',
  MSW: 'Maiden Special Weight',
  STK: 'Stakes',
}

function formatRaceType(raceType) {
  return raceTypeLabels[raceType] ?? raceType
}

function formatCarriedWeight(weightCarried) {
  if (!weightCarried || weightCarried === 'Unknown') return 'Unknown'

  return `${weightCarried} lb`
}

function formatProbability(probability) {
  const numericProbability = Number(probability)
  if (!Number.isFinite(numericProbability)) return 'Unknown'

  return `${(numericProbability * 100).toFixed(1)}%`
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      row.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

function getRaceEntryKey({ trackId, raceDate, raceNumber }) {
  return `${trackId}|${raceDate}|${raceNumber}`
}

function getEntriesByRace(csvText) {
  const [header, ...rows] = parseCsv(csvText)
  if (!header) return {}

  const indexes = Object.fromEntries(header.map((column, index) => [column, index]))
  const entriesByRace = {}

  rows.forEach((row) => {
    const trackId = row[indexes.track_id]?.trim()
    const raceDate = row[indexes.race_date]
    const raceNumber = Number(row[indexes.race_number])
    const postPosition = Number(row[indexes.post_position])
    const horseName = row[indexes.horse_name]?.trim()
    const raceType = row[indexes.race_type]?.trim()
    const trainerName = row[indexes.trainer_name]?.trim()
    const jockeyName = row[indexes.jockey_name]?.trim()
    const weightCarried = row[indexes.weight_carried]?.trim()
    const sex = row[indexes.sex]?.trim()
    const foalingDate = row[indexes.foaling_date]?.trim()
    const winProbability = row[indexes.ml_implied_prob]?.trim()

    if (!trackId || !raceDate || !raceNumber || !postPosition || !horseName) return

    const raceKey = getRaceEntryKey({ trackId, raceDate, raceNumber })
    entriesByRace[raceKey] = {
      horses: {
        ...entriesByRace[raceKey]?.horses,
        [postPosition]: {
          horseName,
          trainerName,
          jockeyName,
          weightCarried,
          sex,
          foalingDate,
          winProbability,
        },
      },
      raceType: entriesByRace[raceKey]?.raceType ?? raceType,
    }
  })

  return entriesByRace
}

function getFrameIndexAtTime(frames, time) {
  let lo = 0
  let hi = frames.length - 1

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (frames[mid].time <= time) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  return lo
}

function getCourseGeometry(race) {
  const layout = trackLayouts[race.trackId]
  return race.course === 'inner' ? layout.inner : layout.main
}

function getCenterlinePoint(geometry, distanceFeet) {
  const topY = geometry.centerY - geometry.radius
  const bottomY = geometry.centerY + geometry.radius
  const straight = geometry.rightX - geometry.leftX
  const totalPixels = 2 * straight + 2 * Math.PI * geometry.radius
  const routeDistance = geometry.furlongs * furlongFeet
  let s = ((distanceFeet % routeDistance) / routeDistance) * totalPixels

  if (s < Math.PI * geometry.radius) {
    const angle = Math.PI / 2 - s / geometry.radius
    const point = [
      geometry.rightX + geometry.radius * Math.cos(angle),
      geometry.centerY + geometry.radius * Math.sin(angle),
    ]
    return {
      point,
      tangent: [Math.sin(angle), -Math.cos(angle)],
      inwardNormal: [
        (geometry.rightX - point[0]) / geometry.radius,
        (geometry.centerY - point[1]) / geometry.radius,
      ],
    }
  }

  s -= Math.PI * geometry.radius
  if (s < straight) {
    return {
      point: [geometry.rightX - s, topY],
      tangent: [-1, 0],
      inwardNormal: [0, 1],
    }
  }

  s -= straight
  if (s < Math.PI * geometry.radius) {
    const angle = -Math.PI / 2 - s / geometry.radius
    const point = [
      geometry.leftX + geometry.radius * Math.cos(angle),
      geometry.centerY + geometry.radius * Math.sin(angle),
    ]
    const tangent = [Math.sin(angle), -Math.cos(angle)]
    return {
      point,
      tangent,
      inwardNormal: [
        (geometry.leftX - point[0]) / geometry.radius,
        (geometry.centerY - point[1]) / geometry.radius,
      ],
    }
  }

  s -= Math.PI * geometry.radius
  return {
    point: [geometry.leftX + s, bottomY],
    tangent: [1, 0],
    inwardNormal: [0, -1],
  }
}

function getTrackPoint(race, raceData, distance, lateralOffset) {
  const geometry = getCourseGeometry(race)
  const courseDistance = geometry.furlongs * furlongFeet
  const startDistance = (courseDistance - (raceData.raceDistance % courseDistance)) % courseDistance
  const { point, tangent, inwardNormal } = getCenterlinePoint(geometry, startDistance + distance)
  const lateralFromCenter = raceData.trackWidth / 2 - lateralOffset
  const lateralPixels = lateralFromCenter * (geometry.halfTrackWidth / (raceData.trackWidth / 2))
  return {
    x: point[0] + inwardNormal[0] * lateralPixels,
    y: point[1] + inwardNormal[1] * lateralPixels,
    angle: Math.atan2(tangent[1], tangent[0]),
  }
}

function getStraightTrackPoint(race, raceData, distance, lateralOffset, postPosition, laneCount, keepLanes) {
  const geometry = getCourseGeometry(race)
  const pixelsPerFoot = geometry.halfTrackWidth / (raceData.trackWidth / 2)
  const laneOffset = keepLanes
    ? ((postPosition - 0.5) / laneCount) * raceData.trackWidth
    : lateralOffset
  const lateralFromCenter = raceData.trackWidth / 2 - laneOffset
  const raceProgress = Math.max(0, Math.min(distance / raceData.raceDistance, 1))

  return {
    x: straightTrack.centerX - lateralFromCenter * pixelsPerFoot,
    y: straightTrack.startY - raceProgress * (straightTrack.startY - straightTrack.finishY),
    angle: -Math.PI / 2,
  }
}

function getHorsePoint(race, raceData, horse, straightView, keepLanes, laneCount) {
  const [postPosition, distance, lateralOffset] = horse

  return straightView
    ? getStraightTrackPoint(race, raceData, distance, lateralOffset, postPosition, laneCount, keepLanes)
    : getTrackPoint(race, raceData, distance, lateralOffset)
}

function getRaceCenterlinePoint(race, raceData, distance) {
  const geometry = getCourseGeometry(race)
  const courseDistance = geometry.furlongs * furlongFeet
  const startDistance = (courseDistance - (raceData.raceDistance % courseDistance)) % courseDistance
  return getCenterlinePoint(geometry, startDistance + distance)
}

function getHorsesCenter(race, raceData, frame, straightView = false, keepLanes = false) {
  if (!raceData || !frame?.horses.length) return null

  const laneCount = Math.max(...frame.horses.map(([postPosition]) => postPosition))

  const total = frame.horses.reduce(
    (center, horseData) => {
      const horse = getHorsePoint(race, raceData, horseData, straightView, keepLanes, laneCount)
      return {
        x: center.x + horse.x,
        y: center.y + horse.y,
      }
    },
    { x: 0, y: 0 },
  )

  return {
    x: total.x / frame.horses.length,
    y: total.y / frame.horses.length,
  }
}

function getAverageHorseAngle(race, raceData, frame) {
  if (!raceData || !frame?.horses.length) return null

  const direction = frame.horses.reduce(
    (total, [, distance, lateralOffset]) => {
      const { angle } = getTrackPoint(race, raceData, distance, lateralOffset)
      return {
        x: total.x + Math.cos(angle),
        y: total.y + Math.sin(angle),
      }
    },
    { x: 0, y: 0 },
  )

  return Math.atan2(direction.y, direction.x)
}

function getCenteredViewportOffset(point) {
  return {
    x: canvasSize.width / 2 - point.x,
    y: canvasSize.height / 2 - point.y,
  }
}

function getHorseSize(race, raceData, horseScale = 1) {
  const pixelsPerFoot = getCourseGeometry(race).halfTrackWidth / (raceData.trackWidth / 2)

  return {
    width: raceData.horseWidth * pixelsPerFoot * horseScale,
    length: raceData.horseLength * pixelsPerFoot * horseScale,
  }
}

function drawHorse(
  ctx,
  x,
  y,
  angle,
  size,
  color,
  outlineColor,
  postPosition,
  viewportRotation,
  viewportScale,
  selected = false,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.roundRect(-size.length / 2, -size.width / 2, size.length, size.width, 2)

  if (selected) {
    ctx.strokeStyle = outlineColor
    ctx.lineWidth = 3 / viewportScale
    ctx.stroke()
  }

  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1 / viewportScale
  ctx.stroke()

  ctx.rotate(-(angle + viewportRotation))
  const numberSize = Math.max(4, Math.min(size.width * 0.85, size.length * 0.65))
  const isWhiteHorse = color.toLowerCase() === horsePalette[1].toLowerCase()
  ctx.fillStyle = isWhiteHorse ? '#000000' : '#ffffff'
  ctx.font = `800 ${numberSize}px Inter, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(postPosition), 0, 0)
  ctx.restore()
}

function isPointInHorse(px, py, horse, size) {
  const dx = px - horse.x
  const dy = py - horse.y
  const cos = Math.cos(-horse.angle)
  const sin = Math.sin(-horse.angle)
  const localX = dx * cos - dy * sin
  const localY = dx * sin + dy * cos

  return Math.abs(localX) <= size.length / 2 && Math.abs(localY) <= size.width / 2
}

function createOvalPath(geometry, radius = geometry.radius) {
  const topY = geometry.centerY - radius
  const bottomY = geometry.centerY + radius

  return new Path2D(
    `M ${geometry.rightX} ${topY} ` +
      `L ${geometry.leftX} ${topY} ` +
      `A ${radius} ${radius} 0 0 0 ${geometry.leftX} ${bottomY} ` +
      `L ${geometry.rightX} ${bottomY} ` +
      `A ${radius} ${radius} 0 0 0 ${geometry.rightX} ${topY}`,
  )
}

function createSurfacePattern(ctx, type, color) {
  const tile = document.createElement('canvas')
  tile.width = 24
  tile.height = 24
  const tileContext = tile.getContext('2d')

  if (type === 'turf') {
    tileContext.strokeStyle = color
    tileContext.lineWidth = 2
    for (let offset = -24; offset <= 24; offset += 12) {
      tileContext.beginPath()
      tileContext.moveTo(offset, 24)
      tileContext.lineTo(offset + 24, 0)
      tileContext.stroke()
    }
  } else {
    tileContext.fillStyle = color
    for (const [x, y, radius] of [[4, 5, 1], [16, 3, 0.8], [10, 14, 1.2], [21, 18, 0.7], [3, 22, 0.8]]) {
      tileContext.beginPath()
      tileContext.arc(x, y, radius, 0, Math.PI * 2)
      tileContext.fill()
    }
    tileContext.strokeStyle = color
    tileContext.lineWidth = 1
    tileContext.beginPath()
    tileContext.moveTo(15, 10)
    tileContext.lineTo(20, 12)
    tileContext.moveTo(5, 17)
    tileContext.lineTo(8, 19)
    tileContext.stroke()
  }

  return ctx.createPattern(tile, 'repeat')
}

function drawOvalCourse(ctx, geometry, surfaceColor, surfacePattern, railColor) {
  ctx.strokeStyle = surfaceColor
  ctx.lineWidth = geometry.halfTrackWidth * 2
  ctx.stroke(createOvalPath(geometry))

  ctx.strokeStyle = surfacePattern
  ctx.stroke(createOvalPath(geometry))

  ctx.strokeStyle = railColor
  ctx.lineWidth = 1.5
  ctx.stroke(createOvalPath(geometry, geometry.radius + geometry.halfTrackWidth))
  ctx.stroke(createOvalPath(geometry, geometry.radius - geometry.halfTrackWidth))
}

function drawChute(ctx, geometry, chute, surfaceColor, surfacePattern, railColor, labelColor) {
  const isBackstretch = chute.side === 'backstretch'
  const y = geometry.centerY + (isBackstretch ? -geometry.radius : geometry.radius)
  const joinX = isBackstretch ? geometry.rightX : geometry.leftX

  ctx.strokeStyle = surfaceColor
  ctx.lineWidth = geometry.halfTrackWidth * 2
  ctx.beginPath()
  ctx.moveTo(chute.endX, y)
  ctx.lineTo(joinX, y)
  ctx.stroke()

  ctx.strokeStyle = surfacePattern
  ctx.beginPath()
  ctx.moveTo(chute.endX, y)
  ctx.lineTo(joinX, y)
  ctx.stroke()

  ctx.strokeStyle = railColor
  ctx.lineWidth = 1.5
  for (const offset of [-geometry.halfTrackWidth, geometry.halfTrackWidth]) {
    ctx.beginPath()
    ctx.moveTo(chute.endX, y + offset)
    ctx.lineTo(joinX, y + offset)
    ctx.stroke()
  }

  ctx.fillStyle = labelColor
  ctx.font = '700 11px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(chute.label, (chute.endX + joinX) / 2, y + (isBackstretch ? -34 : 42))
}

function drawGate(ctx, point, halfTrackWidth, color, lineWidth) {
  const a = [
    point.point[0] + point.inwardNormal[0] * halfTrackWidth,
    point.point[1] + point.inwardNormal[1] * halfTrackWidth,
  ]
  const b = [
    point.point[0] - point.inwardNormal[0] * halfTrackWidth,
    point.point[1] - point.inwardNormal[1] * halfTrackWidth,
  ]

  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.moveTo(...a)
  ctx.lineTo(...b)
  ctx.stroke()
}

function drawStraightCourse(
  ctx,
  race,
  laneCount,
  keepLanes,
  surfaceColor,
  surfacePattern,
  railColor,
  viewportScale,
) {
  const geometry = getCourseGeometry(race)
  const left = straightTrack.centerX - geometry.halfTrackWidth
  const width = geometry.halfTrackWidth * 2
  const top = straightTrack.finishY
  const height = straightTrack.startY - straightTrack.finishY

  ctx.fillStyle = surfaceColor
  ctx.fillRect(left, top, width, height)
  ctx.fillStyle = surfacePattern
  ctx.fillRect(left, top, width, height)

  ctx.strokeStyle = railColor
  ctx.lineWidth = 1 / viewportScale
  ctx.beginPath()
  ctx.moveTo(left, top)
  ctx.lineTo(left, straightTrack.startY)
  ctx.moveTo(left + width, top)
  ctx.lineTo(left + width, straightTrack.startY)
  ctx.stroke()

  if (keepLanes) {
    ctx.save()
    ctx.strokeStyle = railColor
    ctx.globalAlpha = 0.38
    ctx.lineWidth = 1
    ctx.setLineDash([6, 7])
    for (let lane = 1; lane < laneCount; lane += 1) {
      const x = left + (lane / laneCount) * width
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, straightTrack.startY)
      ctx.stroke()
    }
    ctx.restore()
  }
}

function TrackDiagram({
  race,
  raceData,
  frameIndex,
  viewport,
  horseScale,
  selectedPost,
  straightView,
  keepLanes,
  manualPanEnabled,
  onPan,
  onSelectHorse,
}) {
  const canvasRef = useRef(null)
  const dragRef = useRef(null)
  const currentFrame = raceData?.frames[frameIndex]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const styles = getComputedStyle(document.documentElement)
    const dpr = window.devicePixelRatio || 1

    canvas.width = canvasSize.width * dpr
    canvas.height = canvasSize.height * dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height)

    ctx.fillStyle = styles.getPropertyValue('--surface').trim()
    ctx.strokeStyle = styles.getPropertyValue('--border').trim()
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(trackFrame.x, trackFrame.y, trackFrame.width, trackFrame.height, trackFrame.radius)
    ctx.fill()
    ctx.stroke()

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(trackFrame.x, trackFrame.y, trackFrame.width, trackFrame.height, trackFrame.radius)
    ctx.clip()
    const viewportScale = trackScale * viewport.zoom
    ctx.translate(canvasSize.width / 2, canvasSize.height / 2)
    ctx.scale(viewportScale, viewportScale)
    ctx.rotate(viewport.rotation)
    ctx.translate(-canvasSize.width / 2 + viewport.x, -canvasSize.height / 2 + viewport.y)

    const layout = trackLayouts[race.trackId]
    const activeGeometry = getCourseGeometry(race)
    const railColor = styles.getPropertyValue('--rail').trim()
    const dirtColor = styles.getPropertyValue('--track-dirt').trim()
    const turfColor = styles.getPropertyValue('--track-turf').trim()
    const dirtPattern = createSurfacePattern(ctx, 'dirt', styles.getPropertyValue('--track-dirt-texture').trim())
    const turfPattern = createSurfacePattern(ctx, 'turf', styles.getPropertyValue('--track-turf-texture').trim())
    const labelColor = styles.getPropertyValue('--muted').trim()

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.setLineDash([])

    const laneCount = raceData?.frames[0]?.horses.reduce(
      (highestPost, [postPosition]) => Math.max(highestPost, postPosition),
      1,
    ) ?? 1

    if (straightView && raceData) {
      const isTurf = race.course === 'inner'
      drawStraightCourse(
        ctx,
        race,
        laneCount,
        keepLanes,
        isTurf ? turfColor : dirtColor,
        isTurf ? turfPattern : dirtPattern,
        railColor,
        viewportScale,
      )

      ctx.strokeStyle = styles.getPropertyValue('--gate').trim()
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(straightTrack.centerX - activeGeometry.halfTrackWidth, straightTrack.startY)
      ctx.lineTo(straightTrack.centerX + activeGeometry.halfTrackWidth, straightTrack.startY)
      ctx.stroke()
      ctx.strokeStyle = styles.getPropertyValue('--focus').trim()
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(straightTrack.centerX - activeGeometry.halfTrackWidth, straightTrack.finishY)
      ctx.lineTo(straightTrack.centerX + activeGeometry.halfTrackWidth, straightTrack.finishY)
      ctx.stroke()
    } else {
      layout.chutes.forEach((chute) =>
        drawChute(ctx, layout.main, chute, dirtColor, dirtPattern, railColor, labelColor),
      )
      drawOvalCourse(ctx, layout.main, dirtColor, dirtPattern, railColor)
      if (layout.inner) drawOvalCourse(ctx, layout.inner, turfColor, turfPattern, railColor)

      if (raceData) {
        drawGate(
          ctx,
          getRaceCenterlinePoint(race, raceData, 0),
          activeGeometry.halfTrackWidth,
          styles.getPropertyValue('--gate').trim(),
          2,
        )
        drawGate(
          ctx,
          getRaceCenterlinePoint(race, raceData, raceData.raceDistance),
          activeGeometry.halfTrackWidth,
          styles.getPropertyValue('--focus').trim(),
          3,
        )
      }
    }

    ctx.fillStyle = labelColor
    ctx.font = '700 12px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(
      `${layout.name} · ${straightView ? 'straight view' : race.course === 'inner' ? 'inner turf' : 'main dirt'}`,
      straightView ? 490 : 400,
      284,
    )

    if (raceData && currentFrame) {
      const horseSize = getHorseSize(race, raceData, horseScale)
      currentFrame.horses.forEach((horseData) => {
        const [postPosition] = horseData
        const horse = getHorsePoint(race, raceData, horseData, straightView, keepLanes, laneCount)
        drawHorse(
          ctx,
          horse.x,
          horse.y,
          horse.angle,
          horseSize,
          horsePalette[(postPosition - 1) % horsePalette.length],
          styles.getPropertyValue('--text-h').trim(),
          postPosition,
          viewport.rotation,
          viewportScale,
          postPosition === selectedPost,
        )
      })
    }
    ctx.restore()
  }, [currentFrame, horseScale, keepLanes, race, raceData, selectedPost, straightView, viewport])

  return (
    <canvas
      ref={canvasRef}
      className="track-diagram"
      width={canvasSize.width}
      height={canvasSize.height}
      role="img"
      aria-label={
        straightView
          ? `${trackLayouts[race.trackId].name} shown as a straight course with horses running upward.`
          : `${trackLayouts[race.trackId].name}. ${trackLayouts[race.trackId].description}`
      }
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const canvasX = (event.clientX - rect.left) * (canvasSize.width / rect.width)
        const canvasY = (event.clientY - rect.top) * (canvasSize.height / rect.height)
        dragRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
          canvasX,
          canvasY,
          moved: 0,
          pendingX: 0,
          pendingY: 0,
          isPanning: false,
          scaleX: canvasSize.width / rect.width,
          scaleY: canvasSize.height / rect.height,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) return

        const dx = (event.clientX - dragRef.current.clientX) * dragRef.current.scaleX
        const dy = (event.clientY - dragRef.current.clientY) * dragRef.current.scaleY
        dragRef.current.clientX = event.clientX
        dragRef.current.clientY = event.clientY
        dragRef.current.moved += Math.hypot(dx, dy)
        dragRef.current.pendingX += dx
        dragRef.current.pendingY += dy

        if (!manualPanEnabled) return

        if (!dragRef.current.isPanning && dragRef.current.moved >= 6) {
          dragRef.current.isPanning = true
          onPan(dragRef.current.pendingX, dragRef.current.pendingY)
          dragRef.current.pendingX = 0
          dragRef.current.pendingY = 0
        } else if (dragRef.current.isPanning) {
          onPan(dx, dy)
        }
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current
        if (drag && drag.moved < 6 && raceData && currentFrame) {
          const horseSize = getHorseSize(race, raceData, horseScale)
          const zoomScale = trackScale * viewport.zoom
          const scaledX = (drag.canvasX - canvasSize.width / 2) / zoomScale
          const scaledY = (drag.canvasY - canvasSize.height / 2) / zoomScale
          const cos = Math.cos(-viewport.rotation)
          const sin = Math.sin(-viewport.rotation)
          const clickX = scaledX * cos - scaledY * sin + canvasSize.width / 2 - viewport.x
          const clickY = scaledX * sin + scaledY * cos + canvasSize.height / 2 - viewport.y
          const laneCount = Math.max(...currentFrame.horses.map(([postPosition]) => postPosition))
          const clickedHorse = [...currentFrame.horses].reverse().find((horseData) => {
            const [postPosition] = horseData
            const horse = getHorsePoint(race, raceData, horseData, straightView, keepLanes, laneCount)
            return isPointInHorse(clickX, clickY, { ...horse, postPosition }, horseSize)
          })

          onSelectHorse(clickedHorse?.[0] ?? null)
        }

        dragRef.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        dragRef.current = null
      }}
    />
  )
}

function App() {
  const [selectedRace, setSelectedRace] = useState('FL_R5')
  const [raceDataById, setRaceDataById] = useState({})
  const [entriesByRace, setEntriesByRace] = useState({})
  const [frameIndex, setFrameIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [playbackSpeedInput, setPlaybackSpeedInput] = useState('1')
  const [viewport, setViewport] = useState(defaultViewport)
  const [horseScale, setHorseScale] = useState(1)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [panCamera, setPanCamera] = useState(false)
  const [lockOrientation, setLockOrientation] = useState(false)
  const [straightView, setStraightView] = useState(false)
  const [keepLanes, setKeepLanes] = useState(false)
  const [leaderboardSort, setLeaderboardSort] = useState('distance')
  const [selectedPost, setSelectedPost] = useState(null)
  const race = useMemo(() => races[selectedRace], [selectedRace])
  const raceData = raceDataById[selectedRace]
  const maxFrameIndex = Math.max(0, (raceData?.frames.length ?? 1) - 1)
  const effectiveFrameIndex = Math.min(frameIndex, maxFrameIndex)
  const currentFrame = raceData?.frames[effectiveFrameIndex]
  const currentRaceEntries = entriesByRace[getRaceEntryKey(race)] ?? emptyRaceEntries
  const currentHorseEntries = currentRaceEntries.horses ?? emptyRaceEntries
  const isRaceFinished = Boolean(raceData && effectiveFrameIndex >= maxFrameIndex)
  const leaderboardRows = useMemo(() => {
    if (!currentFrame) return []

    const speeds = currentFrame.horses.map(([, , , speed]) => speed)
    const minSpeed = Math.min(...speeds)
    const maxSpeed = Math.max(...speeds)
    const speedRange = Math.max(maxSpeed - minSpeed, 1)
    const leaderDistance = Math.max(...currentFrame.horses.map(([, distance]) => distance))

    return currentFrame.horses
      .map(([postPosition, distance, , speed]) => ({
        postPosition,
        distance,
        lengthsBehind: Math.max(0, (leaderDistance - distance) / horseLengthFeet),
        speed,
        horseName: currentHorseEntries[postPosition]?.horseName ?? `Post ${postPosition}`,
        speedGlow: Math.max(0, Math.min((speed - minSpeed) / speedRange, 1)),
      }))
      .sort((a, b) => b[leaderboardSort] - a[leaderboardSort])
  }, [currentFrame, currentHorseEntries, leaderboardSort])
  const selectedHorseDetails = useMemo(() => {
    if (selectedPost === null) return null

    const liveHorse = leaderboardRows.find((horse) => horse.postPosition === selectedPost)
    const entry = currentHorseEntries[selectedPost]

    if (!liveHorse && !entry) return null

    return {
      postPosition: selectedPost,
      horseName: entry?.horseName ?? liveHorse?.horseName ?? `Post ${selectedPost}`,
      trainerName: entry?.trainerName || 'Unknown',
      jockeyName: entry?.jockeyName || 'Unknown',
      weightCarried: entry?.weightCarried || 'Unknown',
      sex: entry?.sex || 'Unknown',
      foalingDate: entry?.foalingDate || 'Unknown',
      winProbability: entry?.winProbability,
      lengthsBehind: liveHorse?.lengthsBehind,
      speed: liveHorse?.speed,
    }
  }, [currentHorseEntries, leaderboardRows, selectedPost])

  useEffect(() => {
    setFrameIndex(0)
    setIsPlaying(false)
    setSelectedPost(null)
  }, [selectedRace])

  useEffect(() => {
    if (!panCamera || !raceData || !currentFrame) return

    const horsesCenter = getHorsesCenter(race, raceData, currentFrame, straightView, keepLanes)
    if (!horsesCenter) return

    setViewport((current) => ({
      ...current,
      ...getCenteredViewportOffset(horsesCenter),
      rotation: lockOrientation && !straightView ? Math.PI - getAverageHorseAngle(race, raceData, currentFrame) : 0,
    }))
  }, [currentFrame, keepLanes, lockOrientation, panCamera, race, raceData, straightView])

  useEffect(() => {
    if (!isPlaying || !raceData) return undefined

    const frames = raceData.frames
    const lastFrame = frames[frames.length - 1]
    const startFrame = frames[effectiveFrameIndex] ?? frames[0]
    const startedAt = performance.now()
    const baseTime = startFrame.time
    let animationFrameId

    function tick(now) {
      const targetTime = baseTime + ((now - startedAt) / 1000) * playbackSpeed

      if (targetTime >= lastFrame.time) {
        setFrameIndex(frames.length - 1)
        setIsPlaying(false)
        return
      }

      setFrameIndex(getFrameIndexAtTime(frames, targetTime))
      animationFrameId = requestAnimationFrame(tick)
    }

    animationFrameId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [isPlaying, playbackSpeed, raceData])

  function togglePlayback() {
    if (isPlaying) {
      setIsPlaying(false)
      return
    }

    if (isRaceFinished) {
      setFrameIndex(0)
    }
    setIsPlaying(true)
  }

  function selectHorse(postPosition) {
    setSelectedPost((current) => (current === postPosition ? null : postPosition))
    if (postPosition !== null) {
      setShowLeaderboard(true)
    }
  }

  function pan(dx, dy) {
    setPanCamera(false)
    setLockOrientation(false)
    const viewportScale = trackScale * viewport.zoom
    setViewport((current) => ({
      ...current,
      x: current.x + dx / viewportScale,
      y: current.y + dy / viewportScale,
      rotation: 0,
    }))
  }

  useEffect(() => {
    if (raceDataById[selectedRace]) return

    let cancelled = false
    fetch(race.dataUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load ${race.dataUrl}`)
        return response.json()
      })
      .then((data) => {
        if (!cancelled) {
          setRaceDataById((existing) => ({ ...existing, [selectedRace]: data }))
        }
      })
      .catch((error) => {
        console.error(error)
      })

    return () => {
      cancelled = true
    }
  }, [race.dataUrl, raceDataById, selectedRace])

  useEffect(() => {
    let cancelled = false
    fetch(entriesUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load ${entriesUrl}`)
        return response.text()
      })
      .then((csvText) => {
        if (!cancelled) {
          setEntriesByRace(getEntriesByRace(csvText))
        }
      })
      .catch((error) => {
        console.error(error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="app-shell">
      <section className="control-panel" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Horse Simulation</p>
          <h1 id="page-title">Race track viewer</h1>
        </div>

        <label className="race-picker">
          <span>Race</span>
          <select value={selectedRace} onChange={(event) => setSelectedRace(event.target.value)}>
            {raceOptions.map((option) => (
              <option value={option.label} key={option.label}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="track-view" aria-label={`${race.label} track graphic`}>
        <div className="track-header">
          <div>
            <p className="eyebrow">{race.track}</p>
            <h2>
              {race.race}
              <span>{race.raceDate}</span>
            </h2>
          </div>
          <dl>
            <div>
              <dt>Distance</dt>
              <dd>{race.distance}</dd>
            </div>
            <div>
              <dt>Surface</dt>
              <dd>{race.surface}</dd>
            </div>
            <div>
              <dt>Course</dt>
              <dd>{race.course === 'inner' ? 'Inner turf' : 'Main dirt'}</dd>
            </div>
            <div>
              <dt>Race Type</dt>
              <dd>{currentRaceEntries.raceType ? formatRaceType(currentRaceEntries.raceType) : 'Loading'}</dd>
            </div>
          </dl>
        </div>

        <div className="time-control">
          <label htmlFor="time-slider">
            <span>Time</span>
            <strong>
              {currentFrame ? `${currentFrame.time.toFixed(2)}s` : 'Loading'}
            </strong>
          </label>
          <div className="playback-row">
            <button type="button" className="playback-button" disabled={!raceData} onClick={togglePlayback}>
              {isPlaying ? 'Pause' : isRaceFinished ? 'Replay' : 'Play'}
            </button>
            <label className="speed-input">
              <span>Speed</span>
              <input
                type="number"
                min="0.1"
                max="5"
                step="0.1"
                value={playbackSpeedInput}
                onChange={(event) => {
                  const nextValue = event.target.value
                  const nextSpeed = Number(nextValue)
                  setPlaybackSpeedInput(nextValue)
                  if (Number.isFinite(nextSpeed) && nextSpeed > 0) {
                    setPlaybackSpeed(nextSpeed)
                  }
                }}
                onBlur={() => {
                  setPlaybackSpeedInput(String(playbackSpeed))
                }}
              />
            </label>
            <input
              id="time-slider"
              type="range"
              min="0"
              max={maxFrameIndex}
              value={effectiveFrameIndex}
              disabled={!raceData}
              onChange={(event) => {
                setIsPlaying(false)
                setFrameIndex(Number(event.target.value))
              }}
            />
          </div>
        </div>

        <div className="viewport-controls" aria-label="Track view controls">
          <div className="zoom-control">
            <label htmlFor="zoom-slider">
              <span>Zoom</span>
              <strong>{viewport.zoom.toFixed(1)}x</strong>
            </label>
            <input
              id="zoom-slider"
              type="range"
              min="0.8"
              max="12"
              step="0.1"
              value={viewport.zoom}
              onChange={(event) =>
                setViewport((current) => ({
                  ...current,
                  zoom: Number(event.target.value),
                }))
              }
            />
          </div>

          <div className="horse-scale-control">
            <label htmlFor="horse-scale-slider">
              <span>Horse scale</span>
              <strong>{horseScale.toFixed(1)}x</strong>
            </label>
            <input
              id="horse-scale-slider"
              type="range"
              min="0.5"
              max="4"
              step="0.1"
              value={horseScale}
              onChange={(event) => setHorseScale(Number(event.target.value))}
            />
          </div>

        </div>

        <div className="leaderboard-controls">
          <div className="leaderboard-toggles">
            <label className="leaderboard-toggle">
              <input
                type="checkbox"
                checked={showLeaderboard}
                onChange={(event) => setShowLeaderboard(event.target.checked)}
              />
              <span>Show Leaderboard</span>
            </label>

            <label className="leaderboard-toggle">
              <input
                type="checkbox"
                checked={panCamera}
                disabled={!raceData}
                onChange={(event) => {
                  setPanCamera(event.target.checked)
                  if (!event.target.checked) setLockOrientation(false)
                }}
              />
              <span>Follow Field</span>
            </label>

            <label className="leaderboard-toggle">
              <input
                type="checkbox"
                checked={lockOrientation}
                disabled={!panCamera || straightView}
                onChange={(event) => setLockOrientation(event.target.checked)}
              />
              <span>Lock Orientation</span>
            </label>

            <label className="leaderboard-toggle">
              <input
                type="checkbox"
                checked={straightView}
                disabled={!raceData}
                onChange={(event) => {
                  setStraightView(event.target.checked)
                  if (!event.target.checked) setKeepLanes(false)
                  setViewport((current) => ({ ...current, x: 0, y: 0, rotation: 0 }))
                }}
              />
              <span>Straight Track</span>
            </label>

            <label className="leaderboard-toggle">
              <input
                type="checkbox"
                checked={keepLanes}
                disabled={!straightView}
                onChange={(event) => setKeepLanes(event.target.checked)}
              />
              <span>Stay in Lanes</span>
            </label>
          </div>

          {showLeaderboard && (
            <label className="leaderboard-sort">
              <span>Sort by</span>
              <select value={leaderboardSort} onChange={(event) => setLeaderboardSort(event.target.value)}>
                <option value="distance">Distance</option>
                <option value="speed">Speed</option>
              </select>
            </label>
          )}
        </div>

        {selectedHorseDetails && (
          <aside className="horse-detail-popover" aria-label={`${selectedHorseDetails.horseName} details`}>
            <div className="horse-detail-header">
              <div>
                <span className="horse-detail-post">Post {selectedHorseDetails.postPosition}</span>
                <h3>{selectedHorseDetails.horseName}</h3>
              </div>
              <button type="button" onClick={() => setSelectedPost(null)} aria-label="Close horse details">
                X
              </button>
            </div>
            <dl>
              <div>
                <dt>Trainer</dt>
                <dd>{selectedHorseDetails.trainerName}</dd>
              </div>
              <div>
                <dt>Jockey</dt>
                <dd>{selectedHorseDetails.jockeyName}</dd>
              </div>
              <div>
                <dt>Win Probability</dt>
                <dd>{formatProbability(selectedHorseDetails.winProbability)}</dd>
              </div>
              <div>
                <dt>Carried Weight</dt>
                <dd>{formatCarriedWeight(selectedHorseDetails.weightCarried)}</dd>
              </div>
              <div>
                <dt>Sex</dt>
                <dd>{selectedHorseDetails.sex}</dd>
              </div>
              <div>
                <dt>Foaling Date</dt>
                <dd>{selectedHorseDetails.foalingDate}</dd>
              </div>
              <div>
                <dt>Lengths Back</dt>
                <dd>
                  {selectedHorseDetails.lengthsBehind === undefined
                    ? 'Unknown'
                    : selectedHorseDetails.lengthsBehind.toFixed(1)}
                </dd>
              </div>
              <div>
                <dt>Current Speed</dt>
                <dd>{selectedHorseDetails.speed === undefined ? 'Unknown' : `${selectedHorseDetails.speed.toFixed(1)} ft/s`}</dd>
              </div>
            </dl>
          </aside>
        )}

        <div className={showLeaderboard ? 'track-layout with-leaderboard' : 'track-layout'}>
          {showLeaderboard && (
            <div className="leaderboard">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Horse</th>
                    <th>Lengths Back</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardRows.map((horse, index) => (
                    <tr
                      key={horse.postPosition}
                      className={horse.postPosition === selectedPost ? 'selected-horse-row' : undefined}
                      onClick={() => selectHorse(horse.postPosition)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectHorse(horse.postPosition)
                        }
                      }}
                      tabIndex={0}
                      style={{
                        '--speed-glow-alpha': (horse.speedGlow * 0.5).toFixed(3),
                        '--speed-glow-fill': (horse.speedGlow * 0.24).toFixed(3),
                        '--speed-glow-radius': `${Math.round(horse.speedGlow * 32)}px`,
                      }}
                      aria-label={`Rank ${index + 1}, ${horse.postPosition}. ${horse.horseName}, ${horse.lengthsBehind.toFixed(1)} lengths behind leader, ${horse.speed.toFixed(1)} feet per second`}
                    >
                      <td>{index + 1}</td>
                      <td>
                        <span
                          className="horse-swatch"
                          style={{ backgroundColor: horsePalette[(horse.postPosition - 1) % horsePalette.length] }}
                        />
                        {horse.postPosition}. {horse.horseName}
                      </td>
                      <td>{horse.lengthsBehind.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <TrackDiagram
            race={race}
            raceData={raceData}
            frameIndex={effectiveFrameIndex}
            viewport={viewport}
            horseScale={horseScale}
            selectedPost={selectedPost}
            straightView={straightView}
            keepLanes={keepLanes}
            manualPanEnabled={!panCamera}
            onPan={pan}
            onSelectHorse={selectHorse}
          />
        </div>
      </section>
    </main>
  )
}

export default App
