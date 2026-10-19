/* The parts words in English (en.ts gathers every section). */
export const parts = {
  // The status badge on a project, as the planning record spells it (shown in capitals).
  "status.badgeApplied": "APPLIED",
  "status.badgeApproved": "APPROVED",
  "status.badgeUnderConstruction": "UNDER CONSTRUCTION",
  // The one line under a project's address. {uses} is the land uses from the record (e.g. "Residential + Retail").
  "status.summaryStoreysOne": "{uses} · {storeys} storey · {height} m",
  "status.summaryStoreysOther": "{uses} · {storeys} storeys · {height} m",
  "status.summary": "{uses} · {height} m",
  // stands in for {uses} above when the record names no land use
  "status.mixedUse": "Mixed use",
  // Search results: what kind of place, then its address or height. {address} is the street address.
  "status.searchLandmark": "Landmark · {address}",
  "status.searchUnderConstruction": "Under construction · {height} m",
  "status.searchApproved": "Approved development · {height} m",
  "status.searchExisting": "Existing building · {height} m",

  // The date picker
  "date.choose": "Choose a date",
  "date.monthBefore": "The month before",
  "date.monthAfter": "The month after",

  // The map key: what each building colour means
  "legend.mapKey": "Map key",
  // a building that already stands
  "legend.existing": "Existing",
  // a planned project that has been approved
  "legend.approved": "Approved",
  // a planned project under construction
  "legend.inProgress": "In progress",
  "legend.searched": "Searched building",
  "legend.selected": "Selected",

  // The floor and window side of a flat, for the sunlight of one window
  "flat.whichFloor": "Which floor are you on?",
  "flat.floorDown": "One floor down",
  "flat.floorUp": "One floor up",
  "flat.floor": "Floor",
  "flat.floorsOnRecordOne": "This building has {floors} floor on record.",
  "flat.floorsOnRecordOther": "This building has {floors} floors on record.",
  "flat.floorsUnknown": "The records do not say how many floors this building has.",
  "flat.floorsOnRecordOneEstimated": "This building has {floors} floor on record. Floor heights are estimated at 3 m.",
  "flat.floorsOnRecordOtherEstimated": "This building has {floors} floors on record. Floor heights are estimated at 3 m.",
  "flat.floorsUnknownEstimated": "The records do not say how many floors this building has. Floor heights are estimated at 3 m.",
  "flat.whichWay": "Which way does your window face?",
  "flat.whichWayLabel": "Which way the window faces",
  // The eight compass directions a wall can face
  "flat.compassNorth": "North",
  "flat.compassNorthEast": "North-east",
  "flat.compassEast": "East",
  "flat.compassSouthEast": "South-east",
  "flat.compassSouth": "South",
  "flat.compassSouthWest": "South-west",
  "flat.compassWest": "West",
  "flat.compassNorthWest": "North-west",
  // {side} is a compass direction in lower case, e.g. "north-east"
  "flat.windowHeading": "Floor {floor}, {side} side",
  // Durations of sunshine
  "flat.durationMinutes": "{minutes} min",
  "flat.durationHours": "{hours} h",
  "flat.durationHoursMinutes": "{hours} h {minutes} min",
  // {date} is a day and month, e.g. "21 December"
  "flat.noSun": "No direct sun reaches this window on {date}.",
  // {duration} is how long the sun is above the horizon, e.g. "9 h 30 min"
  "flat.sunUpFor": "The sun is up for {duration} on this date.",
  // under a large figure (the hours of sun), e.g. "4 h" / "of direct sun on 21 December"
  "flat.directSunOn": "of direct sun on {date}",
  // under the line above: "out of 14 h 30 min the sun is up"
  "flat.outOfSunUp": "out of {duration} the sun is up",
  // {first} and {last} are clock times
  "flat.firstLastSun": "First sun {first} · last sun {last}",
  "flat.sunComesBack": "The sun leaves and comes back during the day.",
  "flat.onceBuilt": "Once the approved projects are built",
  "flat.noChange": "no change here",
  // {duration} of direct sun this window loses / gains once the approved projects are built
  "flat.less": "{duration} less",
  "flat.more": "{duration} more",
  // Why the example flat cannot be placed here
  "flat.problemNoSuchFloor": "This building does not reach that floor as it is modelled.",
  "flat.problemNoSuchSide": "This building has no wall facing that way at this floor.",
  "flat.problemWallTooShort": "This side is too narrow at this floor to fit the flat behind it.",
  "flat.problemBuildingTooShallow": "The building is too shallow here to fit the flat behind this side.",
  "flat.problemWindowMoved": "The window had to be measured away from this wall, so the flat would not match the figure.",
  "flat.problemCeilingTooLow": "The floors here are too low for this flat.",
  "flat.problemAboveTheRoof": "The flat would stick out of the roof here.",
  "flat.problemNextBuilding": "Another building stands where the flat would be.",
  "flat.problemBalcony": "There is no room for the balcony on this side at this floor.",
  "flat.problemOutlookBlocked": "A wall stands a few metres past the balcony here, so there would be nothing to look out at.",
  "flat.problemBelowStreet": "This floor is below the street on this side: the ground is higher here.",
  // The way into the example flat
  "flat.lookOutFromThis": "Look out from this flat",
  "flat.lookOutNote": "Walk around an example one-bedroom flat on this floor, behind this side, and see the sun come in. It is not this building’s real plan.",
  "flat.lookOutFromA": "Look out from a flat",
  "flat.lookOutLede": "See the view from a selected floor",
  // the direction the flat's window faces
  "flat.facing": "Facing",
  // the empty first choice of a list
  "flat.choose": "Choose",
  "flat.lookOut": "Look out",
  "flat.chooseFloorAndSide": "Choose the floor and which way the flat faces.",
  "flat.exampleFlat": "An example one-bedroom flat, not this building’s real plan.",

  // Walking in the street
  "walk.standHereAsk": "Stand here?",
  "walk.standHereNote": "See this spot from the footpath, at eye level.",
  "walk.notNow": "Not now",
  "walk.standHere": "Stand here",
  // read before a hint about the mouse wheel (the hint follows)
  "walk.mouseWheel": "Mouse wheel:",
  "walk.controls": "Controls",
  // phone buttons: leave a tram at a stop / leave the street view
  "walk.getOff": "Get off",
  "walk.backUp": "Back up",
  // shown at the centre of the view when it rests on a tram door or seat
  "walk.boardAsk": "Board this tram?",
  "walk.boardClick": "Click to board",
  "walk.getOffAsk": "Get off here?",
  "walk.getOffClick": "Click to get off",
  "walk.sitAsk": "Sit here?",
  "walk.sitClick": "Click to sit",
  // W, A, S and D are the keys
  "walk.standUp": "W A S D to stand up",
  // <b>…</b> is shown in bold. {route} is a tram route number, {stop} the name of the next stop.
  "walk.onRoute": "On route <b>{route}</b>",
  "walk.onRouteTo": "On route <b>{route}</b> to {stop}",
  // {key} is the key E
  "walk.keyToGetOff": "<b>{key}</b> to get off",
  "walk.boardByTap": "<b>Tap</b> a tram door to board",
  "walk.boardByAim": "<b>Aim at</b> a tram door to board",
  // walking speed, e.g. "Pace 1.4 m/s"
  "walk.pace": "Pace <b>{pace} m/s</b>",

  // The loading screen
  "loading.failed": "The city model did not load",
  "loading.building": "Building the city model",
  "loading.unreadable": "The snapshot could not be read.",
  "loading.progressLabel": "Loading the city model",
  // data credits: keep the dataset names, owners and licence as they are
  "loading.credits": "Building Footprints 2023 and Development Activity Monitor © City of Melbourne. Draft Open Space Data © Victorian Planning Authority. Both licensed CC BY 4.0.",

  // Other small parts
  "kit.demoNote": "Illustrative model · Demo data",
  "kit.analysisNav": "What to work out for this building",
  "kit.sunlight": "Sunlight",
  "kit.solarPanels": "Solar panels",
  // a link to report a mistake in the map
  "kit.improveMap": "Improve this map",
} as const;
