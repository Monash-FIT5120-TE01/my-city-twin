/* The sunlight words in English (en.ts gathers every section). */
export const sunlight = {
  // The card that explains the mouse: each gesture, then what it does.
  "sun.viewControls.leftDrag": "Left drag",
  "sun.viewControls.leftDragEffect": "moves the city",
  "sun.viewControls.rightDrag": "Right drag",
  // "it" is the city
  "sun.viewControls.rightDragEffect": "turns it",
  // the mouse wheel
  "sun.viewControls.scroll": "Scroll",
  "sun.viewControls.scrollEffect": "zooms in and out",
  "sun.viewControls.turnLeft": "Turn the city left",
  "sun.viewControls.turnRight": "Turn the city right",
  "sun.viewControls.zoomIn": "Zoom in",
  "sun.viewControls.zoomOut": "Zoom out",
  // fly the camera back out until the whole city is in view
  "sun.viewControls.frameCity": "Frame the whole city",
  "sun.viewControls.focusModeLabel": "Focus mode — hide the interface",
  "sun.viewControls.focusMode": "Focus mode",
  "sun.viewControls.help": "How to move around the map",

  "sun.layers.title": "Map layers",
  "sun.layers.close": "Close map layers",
  "sun.layers.intro": "Choose what appears on the map.",
  // a layer switch: the planned buildings approved but not yet finished
  "sun.layers.developments": "Approved projects",
  "sun.layers.developmentsNote": "Approved, and those already under construction",
  "sun.layers.shadows": "Sunlight & shadows",
  "sun.layers.shadowsNote": "Preview shadows at the selected time",
  "sun.layers.streetLights": "Street lights",
  "sun.layers.streetLightsNote": "Lit once the sun has fully set",
  "sun.layers.landmarks": "Landmarks",
  "sun.layers.landmarksNote": "Named places, tagged on their buildings",
  // heading over layers that are planned but not available yet
  "sun.layers.comingSoon": "Coming soon",
  "sun.layers.protectedSpace": "Protected public space",
  "sun.layers.protectedSpaceNote": "Protection rules and affected places",
  "sun.layers.construction": "Construction",
  "sun.layers.constructionNote": "Construction activity and progress",
  "sun.layers.environment": "Environment",
  "sun.layers.environmentNote": "More ways to understand city change",
  "sun.layers.keep": "Layer settings stay as you move between projects.",
  "sun.layers.done": "Done",

  // a badge: a building that already stands (not a planned project)
  "sun.subject.existing": "Existing",
  // a link to the building's information card
  "sun.subject.details": "Details",

  // the back link, to the main 3D map
  "sun.sheet.back": "Explore the city",
  "sun.sheet.lede": "Explore sunlight",
  "sun.sheet.date": "Date",
  "sun.sheet.season": "Season",
  "sun.sheet.seasonSummer": "Summer",
  "sun.sheet.seasonAutumn": "Autumn",
  "sun.sheet.seasonWinter": "Winter",
  "sun.sheet.seasonSpring": "Spring",
  "sun.sheet.neighbourhoodView": "Neighbourhood view",
  "sun.sheet.today": "Today",
  "sun.sheet.afterPlans": "After planned projects are built",
  "sun.sheet.afterPlansNote": "Approved and in-progress projects at their planned height.",
  "sun.sheet.todayNoteBuilding": "The city as it stands.",
  "sun.sheet.todayNoteProject": "The city as it stands — this project is not built yet.",
  // a two-way choice: measure a spot on the ground, or a window of this building
  "sun.sheet.whatToMeasure": "What to measure",
  "sun.sheet.spotOutside": "A spot outside",
  "sun.sheet.windowUpHere": "A window up here",
  // shown while the reader is choosing a point on the map
  "sun.sheet.armingLede": "Click a spot on the ground.",
  "sun.sheet.armingBody": "A ring follows the pointer. The spot you pick is measured across the whole day.",
  "sun.sheet.cancel": "Cancel",
  // {floors} is the number of floors in the property record; {floor} the floor the reader asked for
  "sun.sheet.noSuchFloorOnRecord": "This building has {floors} floors on record, so there is no floor {floor}.",
  "sun.sheet.noSuchFloorModelled": "Floor {floor} would be above the top of this building as it is modelled.",
  // {side} is a compass direction such as "north-east"
  "sun.sheet.sideNotAtHeight": "This building has no {side} side at floor {floor}. Choose one of the sides above.",
  "sun.sheet.belowStreet": "Floor {floor} is below the street on the {side} side — the ground is higher there. Try a floor higher up.",
  "sun.sheet.insideBuilding": "That side of floor {floor} is inside the building rather than on an outside wall, so there is no window there to measure.",
  "sun.sheet.chooseSide": "Choose which way your window faces to see the sun it gets.",
  "sun.sheet.atThisSpot": "At this spot",
  // followed by a time range, e.g. "10:00 am – 2:00 pm"
  "sun.sheet.inShadowAround": "In shadow around",
  "sun.sheet.chooseAnother": "Choose another point",
  "sun.sheet.clearPoint": "Clear point",
  // go down to street level at the measured spot
  "sun.sheet.standHere": "Stand here",
  "sun.sheet.chooseSpot": "Choose a spot",
  "sun.sheet.choosePrompt": "Select a point on the ground.",
  "sun.sheet.compare": "Compare side by side",
  "sun.sheet.howItWorks": "How it works",
  "sun.sheet.howtoDate": "Choose a date or a season above.",
  "sun.sheet.howtoTime": "Move the time along the bar at the bottom, or press play, to follow the shadow.",
  "sun.sheet.howtoCompare": "Switch the neighbourhood view, or compare the two side by side, to see today against after the approved projects.",
  "sun.sheet.howtoSpotProject": "Choose a spot on the ground to measure what this project takes from it.",
  "sun.sheet.howtoSpotBuilding": "Choose a spot on the ground to measure what this building takes from it.",
  "sun.sheet.hideDetails": "Hide details",
  "sun.sheet.seeDetails": "See details",
  "sun.sheet.hostDemolished": "The approved plan replaces this building, so there is no “once built” figure to compare against.",
  "sun.sheet.howWeCounted": "How we counted",
  "sun.sheet.windowSampled": "Sampled every {minutes} minutes, counting every building in the model, including this one.",
  "sun.sheet.windowOnePoint": "Measured at one representative point on that side: a flat at the far end of the same wall may differ.",
  "sun.sheet.notModelled": "What is not modelled",
  "sun.sheet.windowNotModelled": "Buildings are flat-topped blocks: balconies, awnings, window reveals and the shape of the roof are not modelled, and nor is cloud.",

  "sun.timeBar.pause": "Pause the day",
  "sun.timeBar.play": "Play the day",
  // a label followed by a clock time
  "sun.timeBar.sunrise": "Sunrise",
  "sun.timeBar.sunset": "Sunset",
  "sun.timeBar.timeOfDay": "Time of day",
  // read aloud by a screen reader: the hour, then what the shadow is doing
  "sun.timeBar.valueText": "{time}, {caption}",
  "sun.timeBar.noRise": "The sun does not rise between {from} and {to} on this date.",
  "sun.timeBar.noSet": "The sun does not set between {from} and {to} on this date.",
} as const;
