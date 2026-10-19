/* The landing words in English (en.ts gathers every section). */
export const landing = {
  // ── The front page's first screen
  "landing.hero.title": "Your street. A new perspective.",
  "landing.hero.body": "Explore nearby developments. Follow the sunlight.",
  // The button beside the chosen place that clears it. {place} is the place's name.
  "landing.hero.clearChosen": "Clear {place}",
  // Above three street names offered as places to start from
  "landing.hero.tryStreet": "Try a street",
  "landing.hero.exploreSunlight": "Explore sunlight",
  // Said when "Explore sunlight" is pressed before a place is chosen
  "landing.hero.chooseFirst": "Search for an address above, then choose it from the list.",
  "landing.hero.enterVr": "Enter in VR",
  "landing.hero.justExplore": "Just explore the map",

  // The three steps along the bottom, in the order the app is used
  "landing.steps.label": "How it works",
  "landing.steps.findTitle": "Find a place",
  "landing.steps.findBody": "Search for an address or explore the map.",
  "landing.steps.selectTitle": "Select any building",
  "landing.steps.selectBody": "Double-click a building to open its page.",
  "landing.steps.compareTitle": "Compare sunlight",
  "landing.steps.compareBody": "See how planned developments could affect sunlight on your street.",

  // The city's download, shown in the map's window
  "landing.loading.failed": "The city model did not load",
  "landing.loading.building": "Building the city model",
  "landing.loading.unreadable": "The snapshot could not be read.",
  "landing.loading.progressLabel": "Loading the city model",
  // the share downloaded so far, after the step being done
  "landing.loading.percent": "{percent}%",

  // ── Under the first screen: the city in three numbers
  "landing.numbers.pill": "The city behind the map",
  "landing.numbers.title": "Big changes. Everyday places.",
  "landing.numbers.lead": "A closer look at the streets we share — and the future we’re shaping.",
  "landing.numbers.walkKicker": "A city on foot",
  // Shown under a large "89%"; the sentence continues from the number.
  "landing.numbers.walkWords": "of trips within the Hoddle Grid are made on foot.",
  // Shown under a large "26%"; the sentence continues from the number.
  "landing.numbers.streetWords": "of street space is allocated to footpaths.",
  "landing.numbers.streetNote": "Room to move. Room to belong.",
  // Shown under a large "40%"; the sentence continues from the number.
  "landing.numbers.canopyWords": "canopy cover of public streets and parks by 2040, up from 22%.",
  "landing.numbers.canopyNote": "A greener chapter ahead.",
  // A cited source document. {document} is its title, which stays in English; {page} is the page number.
  "landing.numbers.sourcePage": "{document}, p. {page}",
  // Read by screen readers after a link to a source document
  "landing.numbers.pdfNewTab": "(PDF, opens in a new tab)",
  "landing.numbers.scope":
    "Walking: trips within the Hoddle Grid. Street space: across the municipality. Canopy: a 2040 target for public streets and parks across the municipality.",

  // ── About
  "landing.about.kicker": "01 / About us",
  // The heading, drawn on two lines
  "landing.about.titleLine1": "Your city.",
  "landing.about.titleLine2": "A new perspective.",
  "landing.about.lead":
    "My City Twin makes urban change easier to explore. See nearby developments, compare sunlight, and connect the map with the places that matter to you.",
  // A label on the drawing of a city block
  "landing.about.blockLabel": "Melbourne, reimagined",

  // ── Before you explore
  "landing.before.kicker": "02 / Before you explore",
  "landing.before.title": "Curiosity starts here.",
  "landing.before.lead": "A little context for a clearer view.",
  "landing.before.discoverTitle": "What can I discover?",
  "landing.before.discoverBody":
    "Explore buildings and developments. Compare sunlight at a selected date and time. Start with an address, or simply follow your curiosity.",
  "landing.before.readTitle": "How should I read it?",
  "landing.before.readBody":
    "An illustrative model using demo data. Shadow views show possibilities; they are not predictions or a formal planning assessment.",
  "landing.before.numbersTitle": "What’s behind the numbers?",
  "landing.before.numbersBody":
    "City of Melbourne strategies inform the facts above. Source dates and geographic scope help you understand what each number actually represents.",

  // ── Acknowledgement of Country
  "landing.country.kicker": "Acknowledgement of Country",
  "landing.country.title": "A continuing connection to place.",
  "landing.country.words":
    "My City Twin acknowledges the Wurundjeri Woi-wurrung and Bunurong Boon Wurrung peoples of the Eastern Kulin Nation, whose Country includes Melbourne. We honour their enduring relationships with land, waters and community, and respectfully recognise Elders, past and present.",

  // ── Future work: ideas not built yet
  "landing.future.kicker": "Future work",
  "landing.future.title": "The next chapter of My City Twin.",
  "landing.future.lead": "Ideas we want to develop next — proposed features, not available yet.",
  "landing.future.plansKicker": "01 / More plans",
  "landing.future.plansTitle": "Follow the change.",
  "landing.future.plansBody":
    "Bring together approval documents, project stages and source dates, so the status is easier to understand.",
  "landing.future.personalKicker": "02 / Your everyday life",
  "landing.future.personalTitle": "Make it personal.",
  "landing.future.personalBody":
    "Choose what matters to you: walking, access, public space or disruption during construction.",
  "landing.future.evidenceKicker": "03 / Better evidence",
  "landing.future.evidenceTitle": "Compare with confidence.",
  "landing.future.evidenceBody":
    "Add validated before-and-after measures, clear assumptions and visible uncertainty.",
  "landing.future.question": "Built around one question: how will a changing city affect your day?",

  // ── The way back in
  "landing.cta.kicker": "Your next chapter starts here",
  "landing.cta.title": "Find your place in the city’s future.",
  "landing.cta.lead": "A familiar street. Something new to discover.",
  "landing.cta.button": "Explore the city",

  // ── The foot of the page
  "landing.footer.tagline": "Melbourne · An illustrative city model",
  "landing.footer.motto": "Made for a city in motion.",
  "landing.footer.copyright": "© 2026 My City Twin · Prototype",
} as const;
