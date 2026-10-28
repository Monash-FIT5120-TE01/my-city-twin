/* The sentences words in English (en.ts gathers every section). */
export const sentences = {
  // ── ui/words.ts: a measured spot on the ground (the page; the headset keeps the English) ──
  // Durations of sun lost or kept at a spot
  "words.duration.minutes": "{minutes} min",
  "words.duration.hours": "{hours} h",
  "words.duration.hoursMinutes": "{hours} h {minutes} min",
  // {step} is a number of minutes, e.g. "10"
  "words.spot.finePrint": "Sampled every {step} minutes. Existing buildings and the slope of the ground are not counted, so a spot already in someone else’s shadow will still be shown losing sun here.",
  // "building" = one already standing; "project" = an approved proposal not built yet
  "words.spot.noneBuilding": "This building takes no direct sun from here.",
  "words.spot.noneProject": "This project takes no direct sun from here.",
  // Under a large figure, e.g. "2 h 10 min" / "less direct sunlight from this building"
  "words.spot.captionBuilding": "less direct sunlight from this building",
  "words.spot.captionProject": "less direct sunlight from this project",
  // {duration} e.g. "9 h 30 min": the sun the spot would get if the building were not there
  "words.spot.againstBuilding": "{duration} without this building",
  "words.spot.againstProject": "{duration} without this project",
  // {from} and {to} are 24-hour times, e.g. "14:10" and "16:40"
  "words.spot.shadowWindow": "In shadow around {from} – {to}",
  "words.notAnAssessment": "Illustrative shadow shapes · City of Melbourne building footprints. Not a planning assessment.",

  // ── scene/narrative.ts: what the shadow is doing, under the time bar ──
  // {time} e.g. "15:00"
  "narrative.stamp": "At {time}",
  // {date} e.g. "21 December"
  "narrative.provenance": "Demo model · {date}",
  "narrative.sentence.noSun": "The sun is below the horizon, so the building casts no shadow.",
  "narrative.sentence.shortest": "The sun is high, so the tower's shadow stays close to its own footprint.",
  // {direction} is one of the narrative.direction words; {metres} a whole number
  "narrative.sentence.runs": "The tower's shadow runs {direction} for about {metres} m.",
  // The time bar's caption: two short lines at most (about 26 characters in all)
  "narrative.caption.noSun": "No direct sun",
  "narrative.caption.shortest": "Shortest shadow",
  // {direction} is one of the narrative.direction words, e.g. "Long south-east shadow"
  "narrative.caption.short": "Short {direction} shadow",
  "narrative.caption.long": "Long {direction} shadow",
  "narrative.caption.longest": "Longest {direction} shadow",
  // The way a shadow runs, in lower case for the middle of a sentence
  "narrative.direction.north": "north",
  "narrative.direction.northEast": "north-east",
  "narrative.direction.east": "east",
  "narrative.direction.southEast": "south-east",
  "narrative.direction.south": "south",
  "narrative.direction.southWest": "south-west",
  "narrative.direction.west": "west",
  "narrative.direction.northWest": "north-west",

  // ── data/now.ts: the hour shown ──
  // {time} is the clock in Melbourne now, {shown} the nearest hour the time control can show (24-hour, e.g. "23:31", "20:00")
  "now.outsideWindow": "It is {time} in Melbourne — outside the hours this simulation covers. Showing {shown}.",

  // ── App.tsx ──
  // Shown on entering a headset in the evening; {time} e.g. "21:30"
  "app.now.sunDown": "The sun is down in Melbourne at {time}. Showing 12:00 - change the time below.",
  "app.explore.hint": "Search an address, or double-click any building to select it.",
  // What the chosen place is, on the comparison page
  "app.kind.existing": "Existing building",
  "app.kind.underConstruction": "Under construction",
  "app.kind.approved": "Approved development",
  // Walking, in the street or in the example flat: what each key or gesture does
  "app.walk.stick": "Stick",
  "app.walk.drag": "Drag",
  "app.walk.walk": "Walk",
  "app.walk.lookRound": "Look round",
  // The mouse wheel changes the walking speed
  "app.walk.speed": "Speed",
  // Shift: walk faster
  "app.walk.hurry": "Hurry",
  "app.room.loading": "Loading the flat",
  "app.room.title": "Inside the flat",
  // [ and ] move the hour back or on by ten minutes
  "app.room.nudgeTime": "−/+ 10 min",
  "app.room.leave": "Leave the flat",
  // {floor} is a number, {side} a compass direction ("North-east"); <b>…</b> is shown bold
  "app.room.floorSide": "Floor <b>{floor}</b> · {side} side",
  "app.room.exampleLayout": "An example one-bedroom layout, not this building's real plan",
  "app.street.title": "In the street",
  "app.street.jump": "Jump",
  // Esc: rise from the street back to the view from above
  "app.street.comeBackUp": "Come back up",
  // The headset controllers, said before entering VR; A, B and grip are buttons; <b>…</b> is shown bold
  "app.street.vrControls": "Left stick walks, push it to the stop to run · right stick turns · <b>A</b> and <b>B</b> move the hour · hold either <b>grip</b> to come back.",
  "app.street.vrComfort": "Moving by stick makes some people feel unwell.",
  // {metres} is a whole number
  "app.street.standMoved": "Standing {metres} m from the measured spot — the nearest ground with no building modelled on it",
  // {key} is the Esc key, shown as a keycap
  "app.focus.exit": "Exit focus mode {key}",
} as const;
