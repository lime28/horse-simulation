import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import horseMetadata from './data/horse_metadata.json'
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

function formatEventTime(time) {
  const minutes = Math.floor(time / 60)
  const seconds = time - minutes * 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}

function getLeader(frame) {
  return [...frame.horses].sort((a, b) => b[1] - a[1])[0]
}

function getHorseRank(frame, postPosition) {
  return [...frame.horses]
    .sort((a, b) => b[1] - a[1])
    .findIndex(([post]) => post === postPosition) + 1
}

function getRaceEvents(race, raceData, horseEntries) {
  if (!raceData?.frames.length) {
    return [{ time: 0, text: `${race.label} is loading.` }]
  }

  const frames = raceData.frames
  const horseName = (postPosition) => horseEntries[postPosition]?.horseName ?? `Post ${postPosition}`
  const events = [{ time: 0, text: `They're off in ${race.track} ${race.race}.` }]
  const lengthsBehind = (frame) => {
    const ordered = [...frame.horses].sort((a, b) => b[1] - a[1])
    return Math.max(0, (ordered[0][1] - ordered[1][1]) / horseLengthFeet)
  }

  const calls = [
    { progress: 0.25, label: 'At the quarter mark' },
    { progress: 0.5, label: 'Halfway through' },
    { progress: 0.75, label: 'Entering the final quarter' },
    { progress: 0.9, label: 'In the closing stages' },
  ]
  calls.forEach(({ progress, label }, callIndex) => {
    const frame = frames.find((candidate) => getLeader(candidate)[1] >= raceData.raceDistance * progress)
    if (!frame) return
    const leader = getLeader(frame)
    const surgingHorse = [...frame.horses].sort((a, b) => b[3] - a[3])[0]
    const previousFrame = [...frames].reverse().find((candidate) => candidate.time <= frame.time - 4) ?? frames[0]
    const previousRank = getHorseRank(previousFrame, surgingHorse[0])
    const currentRank = getHorseRank(frame, surgingHorse[0])
    const movementText = currentRank < previousRank
      ? `${horseName(surgingHorse[0])} moves up from position ${previousRank} to ${currentRank}.`
      : [
          `${horseName(surgingHorse[0])} is showing the most speed.`,
          `${horseName(surgingHorse[0])} is gaining ground.`,
          `${horseName(surgingHorse[0])} is making a strong run.`,
          `${horseName(surgingHorse[0])} is finishing strongly.`,
        ][callIndex]
    const margin = lengthsBehind(frame)
    events.push({
      time: frame.time,
      text: `${label}, ${horseName(leader[0])} leads${margin >= 0.1 ? ` by ${margin.toFixed(1)} lengths` : ''}. ${movementText}`,
    })
  })

  const confirmationFrames = 20
  let confirmedLeader = getLeader(frames[Math.min(confirmationFrames, frames.length - 1)])[0]
  let lastLeadChangeTime = 0
  for (let index = confirmationFrames; index < frames.length - confirmationFrames; index += 1) {
    const candidate = getLeader(frames[index])[0]
    if (candidate === confirmedLeader || frames[index].time - lastLeadChangeTime < 2) continue
    let sustained = true
    for (let lookAhead = 1; lookAhead <= confirmationFrames; lookAhead += 1) {
      if (getLeader(frames[index + lookAhead])[0] !== candidate) {
        sustained = false
        break
      }
    }
    if (!sustained) continue
    const previousLeader = confirmedLeader
    confirmedLeader = candidate
    lastLeadChangeTime = frames[index].time
    const surgingHorse = [...frames[index].horses].sort((a, b) => b[3] - a[3])[0]
    events.push({
      time: frames[index].time,
      text: `${horseName(candidate)} takes the lead from ${horseName(previousLeader)}. ${surgingHorse[0] === candidate ? `${horseName(candidate)} is setting the fastest pace` : `${horseName(surgingHorse[0])} is also gaining ground`}.`,
    })
  }

  const finishFrame = frames[frames.length - 1]
  const finishers = [...finishFrame.horses].sort((a, b) => b[1] - a[1])
  const fastestFinisher = [...finishFrame.horses].sort((a, b) => b[3] - a[3])[0]
  const winningMargin = Math.max(0, (finishers[0][1] - finishers[1][1]) / horseLengthFeet)
  events.push({
    time: finishFrame.time,
    text: `${horseName(finishers[0][0])} wins${winningMargin >= 0.1 ? ` by ${winningMargin.toFixed(1)} lengths` : ''}; ${horseName(finishers[1][0])} finishes second. ${horseName(fastestFinisher[0])} records the fastest closing speed.`,
  })

  return events
    .sort((a, b) => a.time - b.time)
    .filter((event, index, sorted) => index === 0 || event.time - sorted[index - 1].time >= 0.35)
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

function getHorseTrajectory(race, raceData, postPosition, straightView, keepLanes) {
  if (!raceData || postPosition === null) return []
  const laneCount = Math.max(...raceData.frames[0].horses.map(([post]) => post))
  return raceData.frames.flatMap((frame) => {
    const horseData = frame.horses.find(([post]) => post === postPosition)
    if (!horseData) return []
    const point = getHorsePoint(race, raceData, horseData, straightView, keepLanes, laneCount)
    return [{ ...point, speed: horseData[3] }]
  })
}

function sampleTrajectory(trajectory, step = 6) {
  if (trajectory.length <= 2) return trajectory
  const sampled = trajectory.filter((_, index) => index % step === 0)
  const last = trajectory[trajectory.length - 1]
  if (sampled[sampled.length - 1] !== last) sampled.push(last)
  return sampled
}

function getRaceSpeedRange(raceData) {
  let min = Infinity
  let max = -Infinity
  raceData.frames.forEach((frame) => {
    frame.horses.forEach((horse) => {
      min = Math.min(min, horse[3])
      max = Math.max(max, horse[3])
    })
  })
  return {
    min,
    range: Math.max(max - min, 0.001),
  }
}

function getSpeedColor(speed, min, range) {
  const amount = Math.max(0, Math.min((speed - min) / range, 1))
  return `hsl(${amount * 120} 82% 46%)`
}

function getHorseDisplayLabel(postPosition, predictions, showPredictedProbability) {
  if (!showPredictedProbability) return String(postPosition)
  const probability = predictions[postPosition]?.fair_win_prob
  return Number.isFinite(probability) ? `${(probability * 100).toFixed(1)}%` : '—'
}

function createHorseModel(color, label, selected) {
  const horse = new THREE.Group()
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    emissive: selected ? 0xffffff : 0x000000,
    emissiveIntensity: selected ? 0.28 : 0,
  })
  const darkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.58), roughness: 0.86 })
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x090909, roughness: 0.35 })
  const makeOval = (scale, position, material = bodyMaterial, rotationZ = 0) => {
    const oval = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 9), material)
    oval.scale.set(...scale)
    oval.position.set(...position)
    oval.rotation.z = rotationZ
    oval.castShadow = true
    horse.add(oval)
    return oval
  }

  makeOval([0.9, 0.58, 0.58], [0, 0.82, 0])
  makeOval([0.58, 0.62, 0.62], [-0.32, 0.82, 0])
  makeOval([0.5, 0.6, 0.58], [0.34, 0.87, 0])
  makeOval([0.26, 0.78, 0.28], [0.47, 1.13, 0], bodyMaterial, -0.43)
  makeOval([0.5, 0.36, 0.38], [0.72, 1.43, 0])
  makeOval([0.34, 0.24, 0.3], [0.94, 1.37, 0])
  makeOval([0.08, 0.1, 0.07], [0.83, 1.5, -0.17], eyeMaterial)
  makeOval([0.08, 0.1, 0.07], [0.83, 1.5, 0.17], eyeMaterial)
  makeOval([0.11, 0.3, 0.11], [0.62, 1.68, -0.1], bodyMaterial, -0.15)
  makeOval([0.11, 0.3, 0.11], [0.62, 1.68, 0.1], bodyMaterial, -0.15)
  for (const [x, z, baseAngle, phase] of [
    [-0.28, -0.2, 0.08, -0.24],
    [-0.28, 0.2, -0.08, -0.08],
    [0.28, -0.2, -0.07, 0.08],
    [0.28, 0.2, 0.07, 0.24],
  ]) {
    const legPivot = new THREE.Group()
    legPivot.position.set(x, 0.7, z)
    legPivot.rotation.z = baseAngle
    legPivot.userData.horseLeg = true
    legPivot.userData.baseAngle = baseAngle
    legPivot.userData.phase = phase
    const leg = makeOval([0.13, 0.76, 0.13], [0, -0.34, 0], darkMaterial)
    const hoof = makeOval([0.2, 0.12, 0.16], [0.04, -0.69, 0], darkMaterial)
    horse.remove(leg, hoof)
    legPivot.add(leg, hoof)
    horse.add(legPivot)
  }
  makeOval([0.16, 0.72, 0.16], [-0.65, 0.78, 0], darkMaterial, -0.72)

  const labelCanvas = document.createElement('canvas')
  labelCanvas.width = 256
  labelCanvas.height = 128
  const context = labelCanvas.getContext('2d')
  context.fillStyle = color
  context.fillRect(0, 0, labelCanvas.width, labelCanvas.height)
  context.fillStyle = color.toLowerCase() === horsePalette[1].toLowerCase() ? '#000000' : '#ffffff'
  context.font = '800 54px Inter, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, labelCanvas.width / 2, labelCanvas.height / 2)
  const texture = new THREE.CanvasTexture(labelCanvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
  labelSprite.position.set(0, 2, 0)
  labelSprite.scale.set(0.95, 0.28, 1)
  labelSprite.renderOrder = 3
  horse.add(labelSprite)
  return horse
}

function disposeThreeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose()
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : []
    materials.forEach((material) => {
      material.map?.dispose()
      material.dispose()
    })
  })
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

function resolveHorseCollisions(horses, size, previousOffsets = new Map()) {
  const targetOffsets = new Map(horses.map(({ postPosition }) => [postPosition, 0]))
  const minimumLateralGap = size.width * 1.08
  const minimumLongitudinalGap = size.length * 1.02

  const separate = (offsets, passes = 8) => {
    for (let pass = 0; pass < passes; pass += 1) {
      let foundOverlap = false

      for (let firstIndex = 0; firstIndex < horses.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < horses.length; secondIndex += 1) {
          const first = horses[firstIndex]
          const second = horses[secondIndex]
          const firstOffset = offsets.get(first.postPosition) ?? 0
          const secondOffset = offsets.get(second.postPosition) ?? 0
          const firstNormal = { x: -Math.sin(first.angle), y: Math.cos(first.angle) }
          const secondNormal = { x: -Math.sin(second.angle), y: Math.cos(second.angle) }
          const firstPoint = {
            x: first.x + firstNormal.x * firstOffset,
            y: first.y + firstNormal.y * firstOffset,
          }
          const secondPoint = {
            x: second.x + secondNormal.x * secondOffset,
            y: second.y + secondNormal.y * secondOffset,
          }
          const tangentX = Math.cos(first.angle) + Math.cos(second.angle)
          const tangentY = Math.sin(first.angle) + Math.sin(second.angle)
          const tangentLength = Math.hypot(tangentX, tangentY) || 1
          const tangent = { x: tangentX / tangentLength, y: tangentY / tangentLength }
          const normal = { x: -tangent.y, y: tangent.x }
          const dx = secondPoint.x - firstPoint.x
          const dy = secondPoint.y - firstPoint.y
          const longitudinalDistance = Math.abs(dx * tangent.x + dy * tangent.y)
          const lateralDistance = dx * normal.x + dy * normal.y

          if (
            longitudinalDistance < minimumLongitudinalGap &&
            Math.abs(lateralDistance) < minimumLateralGap
          ) {
            foundOverlap = true
            const previousSeparation = (previousOffsets.get(second.postPosition) ?? 0) -
              (previousOffsets.get(first.postPosition) ?? 0)
            const direction = Math.abs(lateralDistance) < 0.01 && previousSeparation !== 0
              ? Math.sign(previousSeparation)
              : lateralDistance === 0
                ? first.postPosition < second.postPosition ? 1 : -1
                : Math.sign(lateralDistance)
            const correction = (minimumLateralGap - Math.abs(lateralDistance)) / 2 + 0.01
            const firstProjection = Math.max(0.5, Math.abs(firstNormal.x * normal.x + firstNormal.y * normal.y))
            const secondProjection = Math.max(0.5, Math.abs(secondNormal.x * normal.x + secondNormal.y * normal.y))
            offsets.set(first.postPosition, firstOffset - direction * correction / firstProjection)
            offsets.set(second.postPosition, secondOffset + direction * correction / secondProjection)
          }
        }
      }

      if (!foundOverlap) break
    }
  }

  separate(targetOffsets)

  const maximumStep = size.width * 0.18
  const smoothedOffsets = new Map(
    horses.map(({ postPosition }) => {
      const previous = previousOffsets.get(postPosition) ?? 0
      const target = targetOffsets.get(postPosition) ?? 0
      const requestedStep = (target - previous) * 0.24
      const limitedStep = Math.max(-maximumStep, Math.min(requestedStep, maximumStep))
      return [postPosition, previous + limitedStep]
    }),
  )

  return {
    offsets: smoothedOffsets,
    horses: horses.map((horse) => {
      const offset = smoothedOffsets.get(horse.postPosition) ?? 0
      return {
        ...horse,
        x: horse.x - Math.sin(horse.angle) * offset,
        y: horse.y + Math.cos(horse.angle) * offset,
      }
    }),
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
  displayLabel,
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
  let numberSize = Math.max(4, Math.min(size.width * 0.85, size.length * 0.65))
  const isWhiteHorse = color.toLowerCase() === horsePalette[1].toLowerCase()
  ctx.fillStyle = isWhiteHorse ? '#000000' : '#ffffff'
  ctx.font = `800 ${numberSize}px Inter, sans-serif`
  const availableWidth = size.length * 0.88
  const measuredWidth = ctx.measureText(displayLabel).width
  if (measuredWidth > availableWidth) {
    numberSize = Math.max(2, numberSize * (availableWidth / measuredWidth))
    ctx.font = `800 ${numberSize}px Inter, sans-serif`
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(displayLabel, 0, 0)
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

function getStadiumPoints(geometry, radius) {
  const points = []
  const segments = 48
  for (let index = 0; index <= segments; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * index) / segments
    points.push(new THREE.Vector2(
      geometry.rightX + radius * Math.cos(angle) - canvasSize.width / 2,
      geometry.centerY + radius * Math.sin(angle) - canvasSize.height / 2,
    ))
  }
  for (let index = 0; index <= segments; index += 1) {
    const angle = Math.PI / 2 + (Math.PI * index) / segments
    points.push(new THREE.Vector2(
      geometry.leftX + radius * Math.cos(angle) - canvasSize.width / 2,
      geometry.centerY + radius * Math.sin(angle) - canvasSize.height / 2,
    ))
  }
  return points
}

function createExtrudedCourse(geometry, color) {
  const outer = getStadiumPoints(geometry, geometry.radius + geometry.halfTrackWidth)
  const inner = getStadiumPoints(geometry, geometry.radius - geometry.halfTrackWidth).reverse()
  const shape = new THREE.Shape(outer)
  shape.holes.push(new THREE.Path(inner))
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 7, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }),
  )
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = 6
  mesh.receiveShadow = true
  mesh.castShadow = true
  return mesh
}

function createRail(geometry, radius) {
  const points = getStadiumPoints(geometry, radius).map(({ x, y }) => new THREE.Vector3(x, 10, y))
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal')
  const rail = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 160, 1.1, 6, true),
    new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.45 }),
  )
  rail.castShadow = true
  return rail
}

function createRoundedChute(geometry, chute) {
  const isBackstretch = chute.side === 'backstretch'
  const joinX = isBackstretch ? geometry.rightX : geometry.leftX
  const centerY = geometry.centerY + (isBackstretch ? -geometry.radius : geometry.radius)
  const left = Math.min(chute.endX, joinX) - canvasSize.width / 2
  const right = Math.max(chute.endX, joinX) - canvasSize.width / 2
  const centerZ = centerY - canvasSize.height / 2
  const radius = geometry.halfTrackWidth
  const points = []
  const segments = 20

  for (let index = 0; index <= segments; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * index) / segments
    points.push(new THREE.Vector2(right - radius + radius * Math.cos(angle), centerZ + radius * Math.sin(angle)))
  }
  for (let index = 0; index <= segments; index += 1) {
    const angle = Math.PI / 2 + (Math.PI * index) / segments
    points.push(new THREE.Vector2(left + radius + radius * Math.cos(angle), centerZ + radius * Math.sin(angle)))
  }

  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: 7, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: 0x9b704b, roughness: 0.95 }),
  )
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = 6
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function createCourseMarker(point, halfTrackWidth, finish = false) {
  const marker = new THREE.Group()
  const angle = Math.atan2(point.tangent[1], point.tangent[0])
  marker.position.set(
    point.point[0] - canvasSize.width / 2,
    7.1,
    point.point[1] - canvasSize.height / 2,
  )
  marker.rotation.y = -angle

  const segments = finish ? 12 : 1
  const segmentWidth = (halfTrackWidth * 2) / segments
  for (let index = 0; index < segments; index += 1) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(finish ? 5 : 3.5, 0.8, segmentWidth),
      new THREE.MeshStandardMaterial({ color: finish && index % 2 ? 0x121212 : 0xffffff, roughness: 0.72 }),
    )
    stripe.position.z = -halfTrackWidth + segmentWidth * (index + 0.5)
    stripe.receiveShadow = true
    marker.add(stripe)
  }
  return marker
}

function ThreeTrackDiagram({ race, raceData, frameIndex, horseScale, straightView, keepLanes, selectedPost, showAllTrajectories, horsePredictions, showPredictedProbability, isPlaying, onSelectHorse }) {
  const hostRef = useRef(null)
  const sceneStateRef = useRef(null)
  const onSelectHorseRef = useRef(onSelectHorse)
  const isPlayingRef = useRef(isPlaying)
  onSelectHorseRef.current = onSelectHorse
  isPlayingRef.current = isPlaying
  const currentFrame = raceData?.frames[frameIndex]

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111820)
    scene.fog = new THREE.Fog(0x111820, 700, 1500)
    const camera = new THREE.PerspectiveCamera(46, 1, 1, 2400)
    camera.position.set(0, 430, 570)
    camera.rotation.order = 'YXZ'
    let yaw = 0
    let pitch = -0.62

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = 'three-canvas'
    renderer.domElement.tabIndex = 0
    host.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x26301d, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 2.2)
    sun.position.set(-260, 480, 180)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -600
    sun.shadow.camera.right = 600
    sun.shadow.camera.top = 500
    sun.shadow.camera.bottom = -500
    scene.add(sun)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1500, 1200),
      new THREE.MeshStandardMaterial({ color: 0x355c32, roughness: 1 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -2
    ground.receiveShadow = true
    scene.add(ground)

    const layout = trackLayouts[race.trackId]
    if (straightView) {
      const geometry = getCourseGeometry(race)
      const course = new THREE.Mesh(
        new THREE.BoxGeometry(geometry.halfTrackWidth * 2, 7, straightTrack.startY - straightTrack.finishY),
        new THREE.MeshStandardMaterial({ color: race.course === 'inner' ? 0x467d3e : 0x9b704b, roughness: 0.95 }),
      )
      course.position.set(0, 2, (straightTrack.startY + straightTrack.finishY) / 2 - canvasSize.height / 2)
      course.castShadow = true
      course.receiveShadow = true
      scene.add(course)
    } else {
      scene.add(createExtrudedCourse(layout.main, 0x9b704b))
      scene.add(createRail(layout.main, layout.main.radius + layout.main.halfTrackWidth))
      scene.add(createRail(layout.main, layout.main.radius - layout.main.halfTrackWidth))
      if (layout.inner) {
        scene.add(createExtrudedCourse(layout.inner, 0x477b3d))
        scene.add(createRail(layout.inner, layout.inner.radius + layout.inner.halfTrackWidth))
        scene.add(createRail(layout.inner, layout.inner.radius - layout.inner.halfTrackWidth))
      }
      layout.chutes.forEach((chute) => {
        scene.add(createRoundedChute(layout.main, chute))
      })
    }

    if (raceData) {
      const activeGeometry = getCourseGeometry(race)
      const startPoint = straightView
        ? { point: [straightTrack.centerX, straightTrack.startY], tangent: [0, -1] }
        : getRaceCenterlinePoint(race, raceData, 0)
      const finishPoint = straightView
        ? { point: [straightTrack.centerX, straightTrack.finishY], tangent: [0, -1] }
        : getRaceCenterlinePoint(race, raceData, raceData.raceDistance)
      scene.add(createCourseMarker(startPoint, activeGeometry.halfTrackWidth))
      scene.add(createCourseMarker(finishPoint, activeGeometry.halfTrackWidth, true))
    }

    const horseGroup = new THREE.Group()
    const pathGroup = new THREE.Group()
    scene.add(pathGroup)
    scene.add(horseGroup)
    const pressed = new Set()
    let dragging = false
    let dragDistance = 0
    let lastX = 0
    let lastY = 0

    const onPointerDown = (event) => {
      dragging = true
      dragDistance = 0
      lastX = event.clientX
      lastY = event.clientY
      renderer.domElement.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event) => {
      if (!dragging) return
      dragDistance += Math.hypot(event.clientX - lastX, event.clientY - lastY)
      yaw -= (event.clientX - lastX) * 0.006
      pitch = Math.max(-1.35, Math.min(-0.12, pitch - (event.clientY - lastY) * 0.005))
      lastX = event.clientX
      lastY = event.clientY
    }
    const onPointerUp = (event) => {
      if (dragging && dragDistance < 5) {
        const rect = renderer.domElement.getBoundingClientRect()
        const pointer = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        )
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(pointer, camera)
        let clickedHorse = raycaster.intersectObjects(horseGroup.children, true)[0]?.object
        while (clickedHorse?.parent && clickedHorse.parent !== horseGroup) {
          clickedHorse = clickedHorse.parent
        }
        onSelectHorseRef.current(clickedHorse?.userData.postPosition ?? null)
      }
      dragging = false
    }
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase()
      if (['w', 'a', 's', 'd'].includes(key) && !event.target.matches('input, select, textarea')) {
        event.preventDefault()
        pressed.add(key)
      }
    }
    const onKeyUp = (event) => { pressed.delete(event.key.toLowerCase()) }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth
      const height = Math.max(320, width * 0.7)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(host)

    const clock = new THREE.Clock()
    const cameraDirection = new THREE.Vector3()
    const cameraRight = new THREE.Vector3()
    const worldUp = new THREE.Vector3(0, 1, 0)
    let animationFrameId
    const render = () => {
      const elapsed = Math.min(clock.getDelta(), 0.05)
      camera.rotation.y = yaw
      camera.rotation.x = pitch
      const forward = Number(pressed.has('w')) - Number(pressed.has('s'))
      const sideways = Number(pressed.has('d')) - Number(pressed.has('a'))
      if (forward || sideways) {
        const speed = 230 * elapsed
        camera.getWorldDirection(cameraDirection)
        cameraDirection.normalize()
        cameraRight.crossVectors(cameraDirection, worldUp).normalize()
        camera.position.addScaledVector(cameraDirection, forward * speed)
        camera.position.addScaledVector(cameraRight, sideways * speed)
      }
      horseGroup.children.forEach((horse) => {
        const strideSpeed = 7 + (horse.userData.runningSpeed ?? 50) * 0.12
        horse.children.forEach((part) => {
          if (!part.userData.horseLeg) return
          const swing = isPlayingRef.current
            ? Math.sin(clock.elapsedTime * strideSpeed + part.userData.phase) * 0.62
            : 0
          part.rotation.z = part.userData.baseAngle + swing
        })
      })
      renderer.render(scene, camera)
      animationFrameId = requestAnimationFrame(render)
    }
    sceneStateRef.current = { horseGroup, pathGroup }
    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      resizeObserver.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      renderer.dispose()
      scene.traverse((object) => {
        object.geometry?.dispose()
        const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : []
        materials.forEach((material) => {
          material.map?.dispose()
          material.dispose()
        })
      })
      host.removeChild(renderer.domElement)
      sceneStateRef.current = null
    }
  }, [race, raceData, straightView])

  useEffect(() => {
    const horseGroup = sceneStateRef.current?.horseGroup
    if (!horseGroup || !raceData || !currentFrame) return
    const horsesByPost = new Map(horseGroup.children.map((horse) => [horse.userData.postPosition, horse]))
    const laneCount = Math.max(...currentFrame.horses.map(([postPosition]) => postPosition))
    const size = getHorseSize(race, raceData, horseScale)
    currentFrame.horses.forEach((horseData) => {
      const [postPosition] = horseData
      const point = getHorsePoint(race, raceData, horseData, straightView, keepLanes, laneCount)
      const isSelected = postPosition === selectedPost
      const displayLabel = getHorseDisplayLabel(postPosition, horsePredictions, showPredictedProbability)
      let horse = horsesByPost.get(postPosition)
      if (!horse) {
        horse = createHorseModel(
          horsePalette[(postPosition - 1) % horsePalette.length],
          displayLabel,
          isSelected,
        )
        horse.userData.postPosition = postPosition
        horseGroup.add(horse)
      } else if (horse.userData.displayLabel !== displayLabel || horse.userData.selected !== isSelected) {
        const replacement = createHorseModel(
          horsePalette[(postPosition - 1) % horsePalette.length],
          displayLabel,
          isSelected,
        )
        replacement.userData.postPosition = postPosition
        replacement.position.copy(horse.position)
        replacement.rotation.copy(horse.rotation)
        replacement.scale.copy(horse.scale)
        horseGroup.add(replacement)
        horseGroup.remove(horse)
        disposeThreeObject(horse)
        horse = replacement
      }
      horse.userData.displayLabel = displayLabel
      horse.userData.selected = isSelected
      horse.userData.runningSpeed = horseData[3]
      horse.scale.set(Math.max(size.length, 5), Math.max(5.8, horseScale * 5.8), Math.max(size.width, 4.5))
      horse.position.set(point.x - canvasSize.width / 2, 7, point.y - canvasSize.height / 2)
      horse.rotation.y = -point.angle
    })
  }, [currentFrame, horsePredictions, horseScale, keepLanes, race, raceData, selectedPost, showPredictedProbability, straightView])

  useEffect(() => {
    const pathGroup = sceneStateRef.current?.pathGroup
    if (!pathGroup) return
    pathGroup.children.forEach((path) => {
      path.geometry.dispose()
      path.material.dispose()
    })
    pathGroup.clear()
    if (!raceData || (selectedPost === null && !showAllTrajectories)) return

    const { min, range } = getRaceSpeedRange(raceData)
    const posts = showAllTrajectories
      ? raceData.frames[0].horses.map(([postPosition]) => postPosition)
      : [selectedPost]
    posts.forEach((postPosition) => {
      const trajectory = sampleTrajectory(
        getHorseTrajectory(race, raceData, postPosition, straightView, keepLanes),
      )
      if (trajectory.length < 2) return
      const positions = []
      const colors = []
      const isSelected = postPosition === selectedPost
      trajectory.slice(1).forEach((point, index) => {
        const previous = trajectory[index]
        const height = isSelected ? 8 : 7.5
        positions.push(
          previous.x - canvasSize.width / 2, height, previous.y - canvasSize.height / 2,
          point.x - canvasSize.width / 2, height, point.y - canvasSize.height / 2,
        )
        for (const speed of [previous.speed, point.speed]) {
          const amount = Math.max(0, Math.min((speed - min) / range, 1))
          const color = new THREE.Color().setHSL(amount / 3, 0.82, 0.46)
          colors.push(color.r, color.g, color.b)
        }
      })
      const geometry = new LineSegmentsGeometry()
      geometry.setPositions(positions)
      geometry.setColors(colors)
      const line = new LineSegments2(geometry, new LineMaterial({
        vertexColors: true,
        linewidth: isSelected ? 4 : 2.5,
        transparent: !isSelected && showAllTrajectories,
        opacity: isSelected || !showAllTrajectories ? 1 : 0.42,
      }))
      line.renderOrder = isSelected ? 2 : 1
      pathGroup.add(line)
    })
  }, [keepLanes, race, raceData, selectedPost, showAllTrajectories, straightView])

  return <div ref={hostRef} className="three-track" aria-label={`${trackLayouts[race.trackId].name} 3D map`} />
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
  collisionAvoidance,
  showAllTrajectories,
  horsePredictions,
  showPredictedProbability,
  manualPanEnabled,
  onPan,
  onSelectHorse,
}) {
  const canvasRef = useRef(null)
  const dragRef = useRef(null)
  const collisionStateRef = useRef({ context: '', offsets: new Map(), horses: [] })
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

    if (raceData && (selectedPost !== null || showAllTrajectories)) {
      const posts = showAllTrajectories
        ? raceData.frames[0].horses.map(([postPosition]) => postPosition)
        : [selectedPost]
      const orderedPosts = [...posts].sort(
        (a, b) => Number(a === selectedPost) - Number(b === selectedPost),
      )
      const { min, range } = getRaceSpeedRange(raceData)
      orderedPosts.forEach((postPosition) => {
        const trajectory = sampleTrajectory(
          getHorseTrajectory(race, raceData, postPosition, straightView, keepLanes),
        )
        if (trajectory.length < 2) return
        const isSelected = postPosition === selectedPost
        ctx.save()
        ctx.globalAlpha = isSelected || !showAllTrajectories ? 1 : 0.42
        ctx.lineCap = 'round'
        ctx.lineWidth = (isSelected ? 5 : 3) / viewportScale
        trajectory.slice(1).forEach((point, index) => {
          const previous = trajectory[index]
          ctx.strokeStyle = getSpeedColor((previous.speed + point.speed) / 2, min, range)
          ctx.beginPath()
          ctx.moveTo(previous.x, previous.y)
          ctx.lineTo(point.x, point.y)
          ctx.stroke()
        })
        ctx.restore()
      })
    }

    if (raceData && currentFrame) {
      const horseSize = getHorseSize(race, raceData, horseScale)
      const collisionContext = `${race.label}:${straightView}:${keepLanes}:${horseScale}`
      const rawHorses = currentFrame.horses.map((horseData) => {
        const [postPosition] = horseData
        const horse = getHorsePoint(race, raceData, horseData, straightView, keepLanes, laneCount)
        return { ...horse, postPosition }
      })
      const previousOffsets = collisionAvoidance && collisionStateRef.current.context === collisionContext
          ? collisionStateRef.current.offsets
          : new Map()
      const resolved = collisionAvoidance
        ? resolveHorseCollisions(rawHorses, horseSize, previousOffsets)
        : { offsets: new Map(), horses: rawHorses }
      collisionStateRef.current = { context: collisionContext, ...resolved }

      resolved.horses.forEach((horse) => {
        const { postPosition } = horse
        drawHorse(
          ctx,
          horse.x,
          horse.y,
          horse.angle,
          horseSize,
          horsePalette[(postPosition - 1) % horsePalette.length],
          styles.getPropertyValue('--text-h').trim(),
          getHorseDisplayLabel(postPosition, horsePredictions, showPredictedProbability),
          viewport.rotation,
          viewportScale,
          postPosition === selectedPost,
        )
      })
    }
    ctx.restore()
  }, [collisionAvoidance, currentFrame, horsePredictions, horseScale, keepLanes, race, raceData, selectedPost, showAllTrajectories, showPredictedProbability, straightView, viewport])

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
          const clickedHorse = [...collisionStateRef.current.horses].reverse().find((horse) =>
            isPointInHorse(clickX, clickY, horse, horseSize),
          )

          onSelectHorse(clickedHorse?.postPosition ?? null)
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
  const [showAllTrajectories, setShowAllTrajectories] = useState(false)
  const [showPredictedProbability, setShowPredictedProbability] = useState(false)
  const [panCamera, setPanCamera] = useState(false)
  const [lockOrientation, setLockOrientation] = useState(false)
  const [straightView, setStraightView] = useState(false)
  const [keepLanes, setKeepLanes] = useState(false)
  const [collisionAvoidance, setCollisionAvoidance] = useState(true)
  const [render3D, setRender3D] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)
  const race = useMemo(() => races[selectedRace], [selectedRace])
  const currentHorsePredictions = useMemo(() => {
    const metadataRace = horseMetadata.races.find((candidate) =>
      candidate.track_id === race.trackId &&
      candidate.race_date === race.raceDate &&
      candidate.race_number === race.raceNumber,
    )
    return Object.fromEntries(
      (metadataRace?.horses ?? []).map((horse) => [horse.post_position, horse]),
    )
  }, [race])
  const raceData = raceDataById[selectedRace]
  const maxFrameIndex = Math.max(0, (raceData?.frames.length ?? 1) - 1)
  const effectiveFrameIndex = Math.min(frameIndex, maxFrameIndex)
  const currentFrame = raceData?.frames[effectiveFrameIndex]
  const currentRaceEntries = entriesByRace[getRaceEntryKey(race)] ?? emptyRaceEntries
  const currentHorseEntries = currentRaceEntries.horses ?? emptyRaceEntries
  const raceEvents = useMemo(
    () => getRaceEvents(race, raceData, currentHorseEntries),
    [currentHorseEntries, race, raceData],
  )
  const currentRaceEvent = useMemo(() => {
    const currentTime = currentFrame?.time ?? 0
    return [...raceEvents].reverse().find((event) => event.time <= currentTime) ?? raceEvents[0]
  }, [currentFrame?.time, raceEvents])
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
      .sort((a, b) => b.distance - a.distance)
  }, [currentFrame, currentHorseEntries])
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
                checked={showAllTrajectories}
                disabled={!raceData}
                onChange={(event) => setShowAllTrajectories(event.target.checked)}
              />
              <span>Show All Trajectories</span>
            </label>

            <label className="leaderboard-toggle">
              <input
                type="checkbox"
                checked={showPredictedProbability}
                onChange={(event) => setShowPredictedProbability(event.target.checked)}
              />
              <span>Show Predicted Probability</span>
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

            <label className="leaderboard-toggle">
              <input
                type="checkbox"
                checked={collisionAvoidance}
                disabled={!raceData}
                onChange={(event) => setCollisionAvoidance(event.target.checked)}
              />
              <span>Avoid Collisions</span>
            </label>

            <label className="leaderboard-toggle">
              <input
                type="checkbox"
                checked={render3D}
                onChange={(event) => setRender3D(event.target.checked)}
              />
              <span>3D Map</span>
            </label>
          </div>

        </div>

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

          <div className="map-column">
            {render3D ? (
              <ThreeTrackDiagram
                race={race}
                raceData={raceData}
                frameIndex={effectiveFrameIndex}
                horseScale={horseScale}
                straightView={straightView}
                keepLanes={keepLanes}
                selectedPost={selectedPost}
                showAllTrajectories={showAllTrajectories}
                horsePredictions={currentHorsePredictions}
                showPredictedProbability={showPredictedProbability}
                isPlaying={isPlaying}
                onSelectHorse={selectHorse}
              />
            ) : (
              <TrackDiagram
                race={race}
                raceData={raceData}
                frameIndex={effectiveFrameIndex}
                viewport={viewport}
                horseScale={horseScale}
                selectedPost={selectedPost}
                straightView={straightView}
                keepLanes={keepLanes}
                collisionAvoidance={collisionAvoidance}
                showAllTrajectories={showAllTrajectories}
                horsePredictions={currentHorsePredictions}
                showPredictedProbability={showPredictedProbability}
                manualPanEnabled={!panCamera}
                onPan={pan}
                onSelectHorse={selectHorse}
              />
            )}
            {render3D && <p className="camera-help">Drag the map to orbit · WASD to move</p>}
            <aside className="race-commentary" aria-live="polite" aria-label="Race commentary">
              <time dateTime={`PT${currentRaceEvent.time.toFixed(2)}S`}>
                {formatEventTime(currentRaceEvent.time)}
              </time>
              <p>{currentRaceEvent.text}</p>
            </aside>
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
                  <div><dt>Trainer</dt><dd>{selectedHorseDetails.trainerName}</dd></div>
                  <div><dt>Jockey</dt><dd>{selectedHorseDetails.jockeyName}</dd></div>
                  <div><dt>Win Probability</dt><dd>{formatProbability(selectedHorseDetails.winProbability)}</dd></div>
                  <div><dt>Carried Weight</dt><dd>{formatCarriedWeight(selectedHorseDetails.weightCarried)}</dd></div>
                  <div><dt>Sex</dt><dd>{selectedHorseDetails.sex}</dd></div>
                  <div><dt>Foaling Date</dt><dd>{selectedHorseDetails.foalingDate}</dd></div>
                  <div>
                    <dt>Lengths Back</dt>
                    <dd>{selectedHorseDetails.lengthsBehind === undefined ? 'Unknown' : selectedHorseDetails.lengthsBehind.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>Current Speed</dt>
                    <dd>{selectedHorseDetails.speed === undefined ? 'Unknown' : `${selectedHorseDetails.speed.toFixed(1)} ft/s`}</dd>
                  </div>
                </dl>
              </aside>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
