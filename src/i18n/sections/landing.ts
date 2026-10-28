/* The landing words in English (en.ts gathers every section). */
export const landing = {
  // ── The front page's first screen
  // The page's heading: one sentence, what this is and who it is for
  "landing.hero.title": "A 3D twin of Melbourne's CBD, for people who live, work or rent here to see how new buildings change the streets they know.",
  // The button beside the chosen place that clears it. {place} is the place's name.
  "landing.hero.clearChosen": "Clear {place}",
  // Above three street names offered as places to start from
  "landing.hero.tryStreet": "Try a street",
  // The main button with no place chosen: into the 3D city (the same words as nav.explore)
  "landing.hero.exploreCbd": "Explore the 3D twin",
  // The main button once a place is chosen from the search
  "landing.hero.exploreBuilding": "Explore Building",
  "landing.hero.enterVr": "Enter in VR",

  // The five ways in along the foot of the first screen; each opens its screen
  "landing.features.label": "Ways to explore",
  "landing.features.developments": "Developments",
  "landing.features.sunlight": "Sunlight",
  "landing.features.solar": "Solar",
  "landing.features.activity": "Street activity",
  "landing.features.future": "Future Plan",

  // A button floating over the 3D city in the front page's window
  "landing.window.chooseBuilding": "Choose a building",

  // The city's download, shown in the map's window
  "landing.loading.failed": "The city model did not load",
  "landing.loading.building": "Building the city model",
  "landing.loading.unreadable": "The snapshot could not be read.",
  "landing.loading.progressLabel": "Loading the city model",
  // the share downloaded so far, after the step being done
  "landing.loading.percent": "{percent}%",

  // ── Under the first screen: three steps ("How it works" in the bar scrolls here)
  "landing.start.title": "Start with a place you know.",
  "landing.start.find": "Find a street",
  "landing.start.choose": "Choose a building",
  "landing.start.explore": "Explore your perspective",

  // ── The city in three numbers
  "landing.numbers.pill": "The city behind the map",
  "landing.numbers.title": "A city worth exploring.",
  "landing.numbers.walkKicker": "A city on foot",
  // Shown under a large "89%"; the sentence continues from the number.
  "landing.numbers.walkWords": "of trips within the Hoddle Grid are made on foot.",
  // Shown under a large "26%"; the sentence continues from the number.
  "landing.numbers.streetWords": "of street space is allocated to footpaths.",
  // Shown under a large "40%"; the sentence continues from the number.
  "landing.numbers.canopyWords": "canopy cover of public streets and parks by 2040, up from 22%.",
  // A fold that opens to show the sources of the three numbers
  "landing.numbers.sources": "Sources & scope",
  // A cited source document. {document} is its title, which stays in English; {page} is the page number.
  "landing.numbers.sourcePage": "{document}, p. {page}",
  // Read by screen readers after a link to a source document
  "landing.numbers.pdfNewTab": "(PDF, opens in a new tab)",
  "landing.numbers.scope":
    "Walking: trips within the Hoddle Grid. Street space: across the municipality. Canopy: a 2040 target for public streets and parks across the municipality.",

  // ── About
  "landing.about.kicker": "About My City Twin",
  // The heading, drawn on two lines
  "landing.about.titleLine1": "A digital Melbourne.",
  "landing.about.titleLine2": "Made for everyday questions.",
  "landing.about.lead":
    "My City Twin is an interactive 3D model of Melbourne’s CBD. Think of it as a map you can turn, zoom into and explore building by building.",
  // {term} is landing.about.term, shown in bold where it falls in the sentence
  "landing.about.explainer":
    "This is called a {term}: a digital representation of a real place, built from city data. Here, buildings, development plans and street activity come together to help you understand your surroundings.",
  "landing.about.term": "digital twin",
  "landing.about.uses":
    "Choose a building to see how a planned tower could change its sunlight, explore rooftop solar potential, or check foot traffic nearby. Compare today’s city with planned developments, side by side.",
  // Read by screen readers for the silent animation beside the About text
  "landing.about.filmLabel": "Silent city animation: new towers, rooftop solar and moving sunlight",
  // A label on the city animation
  "landing.about.blockLabel": "Melbourne, reimagined",
  // Read by screen readers before the three steps under About
  "landing.about.storyLabel": "How the digital city works",
  "landing.about.realTitle": "A real place",
  "landing.about.realBody": "Melbourne’s buildings, streets and public spaces.",
  "landing.about.modelTitle": "A digital model",
  "landing.about.modelBody": "City data brings the places and plans together in 3D.",
  "landing.about.perspectiveTitle": "Your perspective",
  "landing.about.perspectiveBody": "Explore light, solar and foot traffic around places you know.",

  // ── Acknowledgement of Country
  "landing.country.title": "Acknowledgement of Country",
  "landing.country.words":
    "We acknowledge the Wurundjeri Woi-wurrung and Bunurong Boon Wurrung peoples of the Eastern Kulin Nation, the Traditional Owners of the lands of Melbourne. We pay our respects to Elders past and present, and recognise their continuing connection to Country, waters and community.",

  // ── The foot of the page
  "landing.footer.backToTop": "Back to top",
  "landing.footer.motto": "Made for a city in motion.",
  "landing.footer.copyright": "© 2026 My City Twin",
} as const;
