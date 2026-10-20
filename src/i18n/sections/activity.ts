/* The activity words in English (en.ts gathers every section). */
export const activity = {
  // How busy a location is, against its own usual traffic.
  "activity.level.quiet": "Quiet",
  "activity.level.moderate": "Moderate",
  "activity.level.busy": "Busy",
  // A tag: the hour's counts were counted (recorded) or are predicted (forecast).
  "activity.mode.recorded": "Recorded",
  "activity.mode.forecast": "Forecast",
  // The same, lower case, after a count: which kind it is.
  "activity.source.recorded": "recorded",
  "activity.source.forecast": "forecast",
  // A day as "Wed, 14 Oct" in languages other than English: the short weekday, then the day and month.
  "activity.format.day": "{weekday}, {date}",
  // A day's button in the time bar, "Fri 16": the short weekday and the day of the month.
  "activity.format.dayChip": "{weekday} {day}",

  "activity.sheet.explore": "Explore the city",
  "activity.sheet.eyebrow": "Melbourne CBD",
  "activity.sheet.title": "Street activity",
  "activity.sheet.failed": "The street activity could not be reached. Try again in a moment.",
  "activity.sheet.loading": "Loading the street activity…",
  "activity.sheet.checking": "Checking for new counts…",
  "activity.sheet.live": "Live data",
  // {when} is a day and hour, "Wed, 14 Oct · 07:00"
  "activity.sheet.savedCopyFrom": "Saved copy from {when} — live data could not be reached",
  "activity.sheet.savedCopy": "Saved copy — live data could not be reached",
  "activity.sheet.notConnected": "Not connected",
  "activity.sheet.refresh": "Refresh data",

  "activity.weather.title": "CBD weather",
  "activity.weather.temperature": "Temperature",
  "activity.weather.rain": "Rain / hour",
  "activity.weather.wind": "Wind",
  // Shown when the weather is for a later hour than the one on the map; {when} is the map's day and hour.
  "activity.weather.nextForecast": "Next available forecast · map {when}.",
  "activity.weather.nextForecastRecorded": "Next available forecast · map {when}. There is no weather for recorded hours.",
  "activity.weather.recordedHour": "The forecast weather for this hour; the counts on the map are recorded.",
  "activity.weather.none": "No forecast weather for this hour or after it.",

  // <b>…</b> is shown in bold. {hour} is "07:00", {day} is "Wed, 14 Oct".
  "activity.overview.noData": "<b>No data for {hour}</b> on {day}. The backend has no recorded count or forecast for this hour. Move to another hour to see the streets.",
  "activity.overview.title": "Across the CBD",
  // <b>…</b> is shown in bold: "12 / 40 locations reporting"
  "activity.overview.reporting": "<b>{reporting} / {total}</b> locations reporting",
  "activity.overview.byLevel": "Locations by level",
  "activity.overview.levelNote": "Each level is measured against that location's own usual traffic.",
  "activity.overview.levelNoteUnratedOne": "Each level is measured against that location's own usual traffic. {count} location has no level of its own.",
  "activity.overview.levelNoteUnratedOther": "Each level is measured against that location's own usual traffic. {count} locations have no level of their own.",
  "activity.overview.compare": "Compare locations",
  "activity.overview.showFewer": "Show fewer",
  // after the counts in the ranking: people per hour
  "activity.overview.perHour": "/ hour",
  // the buttons that sort the ranking, busiest first or quietest first
  "activity.overview.order": "Order",
  "activity.overview.higher": "Higher",
  "activity.overview.lower": "Lower",
  "activity.overview.noCounts": "No location has a count for this hour.",
  "activity.overview.showTop": "Show the top three",
  "activity.overview.viewAll": "View all {count} locations",
  // A location in the ranking, read by a screen reader. {level} is "Busy", {source} is "forecast".
  "activity.rank.label": "{name}, {count} movements per hour, open details",
  "activity.rank.labelLevel": "{name}, {count} movements per hour, {level}, open details",
  "activity.rank.labelSource": "{name}, {count} movements per hour, {source}, open details",
  "activity.rank.labelLevelSource": "{name}, {count} movements per hour, {level}, {source}, open details",

  "activity.detail.back": "CBD overview",
  // a counting location
  "activity.detail.location": "Location",
  "activity.detail.tabOverview": "Overview",
  "activity.detail.tabPlan": "Plan a visit",
  "activity.detail.noForecast": "No forecast",
  "activity.detail.noCount": "No count",
  "activity.detail.noData": "No data for this hour",
  // under the count; {when} is "Wed, 14 Oct · 07:00", {mode} is "Recorded" or "Forecast"
  "activity.detail.meta": "movements / hour · {when}",
  "activity.detail.metaMode": "movements / hour · {when} · {mode}",
  "activity.detail.thresholds": "Here, quiet is up to {quietMax} an hour and busy from {busyMin}.",
  "activity.detail.noThresholds": "This location has no thresholds yet, so its count has no level.",

  "activity.day.title": "Throughout the day",
  // One hour of the day's bars, read by a screen reader: "07:00: 1,234, Busy, recorded".
  "activity.day.hourNone": "{hour}: no count",
  "activity.day.hour": "{hour}: {count}, {source}",
  "activity.day.hourLevel": "{hour}: {count}, {level}, {source}",
  "activity.day.noCounts": "{name}: no counts on this day.",
  "activity.day.description": "{name}, movements per hour through the day. Busiest hour {hour}, {count}.",
  // the key under the bars: the bar of the hour shown on the map
  "activity.day.onMap": "On the map",

  "activity.plan.noForecast": "There is no forecast for this location yet, so no hours to suggest.",
  // a choice: "I prefer" quieter or livelier streets
  "activity.plan.prefer": "I prefer",
  "activity.plan.quieter": "Quieter streets",
  "activity.plan.livelier": "Livelier streets",
  "activity.plan.suggested": "Suggested hours",
  // a suggested hour: people per hour, then the temperature
  "activity.plan.what": "{count} / h · {temperature}°C",
  "activity.plan.whatLevel": "{count} / h · {temperature}°C · {level}",
  "activity.plan.none": "No forecast hour ahead is within the weather limits below.",
  // {firstHour}:00–{endHour}:00 is the span of the day, e.g. 08:00–21:00
  "activity.plan.limits": "Outdoor weather limits: {firstHour}:00–{endHour}:00 · {minTemp}–{maxTemp}°C · rain ≤{maxRain} mm/h · wind ≤{maxWind} km/h. Suggestions use the forecast hours still ahead within these limits.",

  "activity.about.title": "About the data",
  "activity.about.close": "Close About the data",
  "activity.about.glow": "A glow's colour and size are how many people passed in the hour, on one scale for every location: teal and small for few, through yellow, to dark red and wide for the most in any hour on the timeline. Every location with a count is shown.",
  "activity.about.levels": "Quiet, moderate and busy are the backend's own levels, set for each location against its usual traffic: a busy hour in a lane can be fewer people than a quiet one at Town Hall. The same levels are applied to the recorded hours. These levels are words in the list, not the map's colours; a location with no levels of its own yet still has its glow, by its count.",
  "activity.about.reportingRecorded": "{reporting} of {total} locations have recorded counts at {hour} on {day}.",
  "activity.about.reportingForecast": "{reporting} of {total} locations have a forecast at {hour} on {day}.",
  "activity.about.noData": "There is no data at {hour} on {day}.",
  "activity.about.weather": "CBD weather is the forecast for the hour shown; recorded hours have none, so the next forecast hour is shown and labelled.",
  "activity.about.fallbackAll": "No forecast here is from the trained model yet: each is estimated from past counts on the same weekday and hour, and weather and events do not change it.",
  "activity.about.fallbackSome": "{fallback} of the {total} forecasts are not from the trained model yet: each is estimated from past counts on the same weekday and hour, and weather and events do not change it.",
  // {source} is the name of the weather service
  "activity.about.weatherSource": "Weather: {source} — not official Bureau of Meteorology forecasts.",
  "activity.about.generated": "Forecast generated {when} (Melbourne time).",
  // The data sources; the names of the organisations and the licence (CC BY 4.0) stay as they are.
  "activity.about.credit": "Pedestrian counts: City of Melbourne pedestrian counting system, through the My City Twin backend. Map: building footprints and road surfaces, City of Melbourne; open space, Victorian Planning Authority. All CC BY 4.0.",

  "activity.search.loading": "The counting locations are still loading.",
  "activity.search.none": "No counting location matches that. {count} locations can be searched by name.",
  "activity.search.results": "Counting locations",
  "activity.search.kind": "Counting location",

  "activity.map.label": "Map of the CBD's street activity. Drag to move, scroll or pinch to zoom, right-drag or twist to turn; the locations are listed in the column.",
  "activity.map.controls": "Map view",
  "activity.map.zoomIn": "Zoom in",
  "activity.map.zoomOut": "Zoom out",
  "activity.map.turnLeft": "Turn the map left",
  "activity.map.turnRight": "Turn the map right",
  // the compass button when the map is already the right way up
  "activity.map.northUp": "North is up",
  "activity.map.turnNorthUp": "Turn north up",
  "activity.map.showAll": "Show all counting locations",

  "activity.timebar.mode": "Recorded or forecast",
  "activity.timebar.noData": "No data",
  // the clock shown is Melbourne's, whatever the reader's own
  "activity.timebar.melbourneTime": "Melbourne time",
  "activity.timebar.pause": "Pause hourly changes",
  "activity.timebar.play": "Play hourly changes",
  // jump to the most recent recorded hour
  "activity.timebar.latest": "Latest",
  "activity.timebar.days": "Day",
  "activity.timebar.previousDay": "Previous day",
  "activity.timebar.nextDay": "Next day",
  "activity.timebar.today": "Today",
  // a day's button read by a screen reader: {date} is "Wed, 14 Oct"
  "activity.timebar.todayLabel": "Today, {date}",
  "activity.timebar.hour": "Hour",
  // the hour slider's value read by a screen reader; {when} is "Wed, 14 Oct · 07:00"
  "activity.timebar.hourRecorded": "{when}, recorded",
  "activity.timebar.hourForecast": "{when}, forecast",
  "activity.timebar.hourNone": "{when}, no data",
  // the colour key's heading: how many people walk past
  "activity.timebar.footTraffic": "Foot traffic",
  "activity.timebar.scale": "0 → {max} movements/h",
  // read by a screen reader after the scale: the colours of the key
  "activity.timebar.scaleColours": ", from light teal to dark red",
  // the 2D / 3D buttons on the map: the name of the pair
  "activity.mapView": "Map view",
} as const;
