/* The pages words in English (en.ts gathers every section). */
export const pages = {
  // The "Sources & limitations" window
  "sources.link": "Sources & limitations",
  // a button with an info mark that opens the same window
  "sources.aboutData": "About the data",
  "sources.title": "Sources & limitations",
  "sources.close": "Close",
  "sources.whyItMatters": "Why it matters",
  // Three figures about the CBD: a headline, then what the percentage above it is of (the sentence goes on from "99.2%").
  "sources.housing.title": "Apartment living is the norm.",
  "sources.housing.body": "Of occupied private dwellings in Melbourne suburb were flats or apartments.",
  "sources.walking.title": "A city experienced on foot.",
  "sources.walking.body": "Of trips within the Hoddle Grid were made on foot.",
  // keep the document title "Transport Strategy 2030" in English; "p." is the page number
  "sources.walking.source": "City of Melbourne, Transport Strategy 2030, p. 39",
  "sources.green.title": "Greener spaces are a priority.",
  "sources.green.body": "Of CBD respondents prioritised plants, trees and improved open spaces.",
  // keep the survey's name in English
  "sources.green.source": "2024 Neighbourhood Survey · 532 CBD responses",
  // {link} is the name of the source, as a link
  "sources.sourceLine": "Source: {link}",
  // read by screen readers after a link
  "sources.opensNewTab": " (opens in a new tab)",
  // The Hoddle Grid is the CBD's street grid; "Melbourne suburb" is the census area.
  "sources.caveat": "Melbourne suburb extends beyond the Hoddle Grid. Walking figures describe trips; survey figures describe respondents.",
  "sources.data": "Data",
  // keep the dataset names, the organisations and the licence (CC BY 4.0) in English
  "sources.licence": "Building Footprints 2023 and Development Activity Monitor © City of Melbourne. Draft Open Space Data © Victorian Planning Authority. Both licensed CC BY 4.0. Modified: reprojected, extruded to simple block massing, and grouped by structure.",

  // The "How it works" page
  "how.title": "Your city, understood.",
  "how.lede": "Find a building. Follow the sun. Compare what changes.",
  "how.find.alt": "A building in the city model, outlined after a search.",
  "how.find.title": "Find any building",
  "how.find.text": "Search an address to open its page. Or explore the map and double-click any building.",
  "how.sun.alt": "A tower's shadow on the street, with a spot ringed on the ground beside it.",
  "how.sun.title": "Follow the sun",
  "how.sun.text": "Set a date and time, then choose a spot on the ground.",
  // read by screen readers: what the app is set to now, e.g. "Set to 21 June 2026, 12:00 pm, Winter"
  "how.sun.setTo": "Set to {date}, {time}, {season}",
  "how.compare.todayAlt": "The neighbourhood as it stands today.",
  "how.compare.today": "Today",
  "how.compare.afterAlt": "The same view with the approved projects built.",
  "how.compare.after": "After planned projects are built",
  "how.compare.title": "Compare the change",
  // "Compare side by side" is the name of a button on the sunlight screen
  "how.compare.text": "Choose Compare side by side. See today beside the future neighbourhood, with linked views.",
  // {credit} is the map's copyright line ("© Mapbox © OpenStreetMap"), kept as it is
  "how.mapPictures": "Map pictures {credit}",
  "how.legendTitle": "Read the map legend",
  "how.legendNote": "Double-click any building to open it.",
  "how.explore": "Explore the city",
  "how.back": "Back to sunlight",

  // The card beside a chosen building
  // the card's name for screen readers: the address, then what it is ("Existing building")
  "card.label": "{title}, {kind}",
  "card.close": "Back to the map",
  "card.section": "Explore this building",
  "card.sunlight": "Explore sunlight",
  "card.sunlightText": "Analyse sunlight and shadows",
  "card.solar": "Solar panels",
  "card.solarText": "Estimate rooftop capacity",
  // the word at the foot of each of the two buttons above
  "card.explore": "Explore",
  // The labels under the card's figures
  "card.figure.height": "Height",
  // the number of floors
  "card.figure.storeys": "Storeys",
  // the year it was built
  "card.figure.built": "Built",
  // the year it was refurbished
  "card.figure.refurbished": "Refurbished",
  // What a project is, by its stage in the planning record
  "card.stage.approved": "Approved",
  "card.stage.applied": "Applied for",
  "card.stage.underConstruction": "Under construction",
  "card.existing": "Existing building",
  // {use} is the property record's main use, in lower case and in English (e.g. "office")
  "card.mainlyUse": "Mainly {use}",

  // The Compare sunlight page
  "compare.title": "Compare sunlight",
  "compare.back": "Back to sunlight",
  // the two views below turn and zoom together
  "compare.together": "Views move together",
  "compare.today.title": "What is here today",
  "compare.today.caption": "The city as it stands. Approved and in-progress projects are not shown.",
  "compare.after.title": "Planned projects at full height",
  "compare.after.caption": "Approved and in-progress projects at their planned height.",
  "compare.date": "Date",
  // a choice in the date list, e.g. "21 June 2026, Winter"
  "compare.dateWithSeason": "{date}, {season}",
  "compare.chooseSpot": "Choose another spot",

  // The loading screen while the city model arrives
  "model.contacting": "Contacting the city model",
  "model.developments": "Approved developments",
  "model.buildings": "Melbourne CBD building footprints",
  "model.placing": "Placing {count} buildings",
  "model.ready": "Ready",
  "model.failed": "Could not load the city",
  // {reason} is the technical error, in English
  "model.failedWithReason": "Could not load the city: {reason}",
} as const;
