/* The solar words in English (en.ts gathers every section). */
export const solar = {
  // The colour key for the roof: how much of a year's light each part keeps. {pct} is like "90%".
  "solar.levels.best": "{pct}+ of the light",
  // a range, like "80%–90%"
  "solar.levels.range": "{from}–{to}",
  "solar.levels.under": "Under {pct}",
  "solar.levels.label": "How much of a year's light the roof keeps",

  // A change in a year's kWh too small to show after rounding to the nearest hundred.
  "solar.change.under100": "under 100",

  // The card about the approved developments (planned buildings).
  "solar.plans.label": "Approved developments",
  "solar.plans.switch": "Include approved developments",
  "solar.plans.switchNote": "Built, with the buildings they replace taken down",
  "solar.plans.replaced": "An approved development replaces this building.",
  "solar.plans.noneNearby": "None rises 2° or more above this roof, so none is counted as shading it.",
  // {pct} is a whole number: the progress, out of 100
  "solar.plans.measuring": "Calculating the roof with them built… {pct}%",
  "solar.plans.noChange": "No change to the panels or their generation.",
  "solar.plans.tinyChange": "The same panels, and less than 0.5% change in their generation.",
  // where today the roof takes no panels, the developments would make room for some; <b> is shown bold
  "solar.plans.newRoom": "<b>New</b> room for panels, where today there is none",
  // {change} is a signed percentage, like "−12%", shown bold
  "solar.plans.generationChange": "<b>{change}</b> generation",
  "solar.plans.panels": "Panels",
  "solar.plans.kwhYear": "kWh / year",
  // the number of homes whose electricity it would cover
  "solar.plans.homes": "Homes",
  // {names}: up to three addresses, separated by semicolons
  "solar.plans.highest": "Rising highest over the roof on the sun's side: {names}.",
  // {count}: how many approved developments could shade the roof
  "solar.plans.notHighEnough": "{count} could reach the roof, none more than 5° above it on the sun's side.",
  "solar.plans.hatched": "Hatched on the roof: light enough today, not with them built.",

  // Progress, read out to screen readers and shown while the check runs.
  "solar.status.finding": "Finding the roof…",
  "solar.status.measured": "Modelled estimate",
  "solar.status.measuringPct": "Calculating the shade… {pct}%",
  "solar.status.measuring": "Calculating the shade",
  "solar.status.measuringLabel": "Calculating",
  "solar.status.measuringNote": "The sun from every point of the roof through a year, against every building in the model.",

  "solar.sheet.back": "Explore the city",
  "solar.sheet.title": "Solar panels",
  "solar.sheet.noRoof": "This building has no roof that a panel fits on.",

  // The large figure: "About 120 panels", or "Room for 0 panels".
  "solar.hero.label": "Panels",
  "solar.hero.about": "About",
  "solar.hero.roomFor": "Room for",
  // {count} is shown large; the words around it stay small
  "solar.hero.panelsOne": "<b>{count}</b> panel",
  "solar.hero.panelsOther": "<b>{count}</b> panels",
  "solar.hero.where": "Where they keep {pct}+ of the light",
  // {metres}: the distance kept clear from the roof's edges
  "solar.hero.noPair": "No pair fits: too little roof keeps {pct}+ of the light, {metres} m in from the edges",
  // ≈ means "about"; kW is the panels' peak power
  "solar.hero.power": "Power ≈{kw} kW",

  "solar.energy.label": "Generation",
  // {kwh} is shown large
  "solar.energy.figure": "<b>{kwh}</b> kWh / year",
  "solar.energy.note": "With the shade counted, panel by panel.",
  // how many homes' electricity a year it equals
  "solar.energy.homes": "Homes' electricity",
  "solar.energy.co2": "Grid CO₂ for the same power",
  // tonnes per year
  "solar.energy.tonnes": "t / year",

  "solar.roof.heading": "Roof space",
  // the switch for what is drawn on the roof: the panels, or the light each part keeps
  "solar.roof.showLabel": "On the roof",
  "solar.roof.showPanels": "Panels",
  "solar.roof.showLight": "Light",
  "solar.roof.whole": "Whole roof",
  "solar.roof.space": "Space for panels",

  "solar.details.show": "See details",
  "solar.details.hide": "Hide details",
  "solar.details.beforeHeading": "Before you install",
  "solar.details.plant": "Air-conditioning, hot water and other plant the model does not show, and what the roof's structure can carry, still need checking on site.",
  // NCC J9D5 is the Australian building code's clause; keep it as is
  "solar.details.byRuleOne": "By the building code's shade test instead (NCC J9D5: shaded no more than a quarter of daylight hours), {count} panel.",
  "solar.details.byRuleOther": "By the building code's shade test instead (NCC J9D5: shaded no more than a quarter of daylight hours), {count} panels.",
  "solar.details.howHeading": "How we counted",
  // {watts}: one panel's power; {length} × {width}: its size in millimetres; {metres}: the distance from the edges
  "solar.details.panels": "Panels: {watts} W, {length} × {width} mm, in pairs facing east and west at 10°, {metres} m in from the roof's edges.",
  // ballast: concrete blocks that hold the frame down by weight
  "solar.details.frameAnchored": "Frame: fixed to the slab with anchors (buildings over {metres} m, too high for ballast).",
  "solar.details.frameBallast": "Frame: held down by concrete blocks (buildings up to {metres} m).",
  "solar.details.light": "Light: the sun's direct light where it reaches each part of the roof, and the sky's by how much of it is seen, against the same panel with nothing around it; a pair goes only where every part of it keeps {pct} (75% of the best a panel facing north could get).",
  // PVGIS is the name of a solar dataset; keep it as is
  "solar.details.generation": "Generation: {kwh} kWh per kW a year unshaded (PVGIS), times the light each panel keeps.",
  "solar.details.sunPlans": "Sun: the 21st of each month, every ten minutes. Shade: every building in the model, with the approved developments built and the buildings they replace removed. Trees are not included.",
  "solar.details.sunToday": "Sun: the 21st of each month, every ten minutes. Shade: every building in the model, as it stands today. Trees are not included.",
  // the sources are named in English: Essential Services Commission, Victorian Default Offer, National Greenhouse Accounts Factors
  "solar.details.home": "A home: {kwh} kWh a year (Essential Services Commission, Victorian Default Offer 2026–27). Grid CO₂: {kg} kg CO₂-e per kWh (National Greenhouse Accounts Factors 2026) — an equivalent, not a measured cut.",
  "solar.details.last": "Check the roof on site before installing.",
} as const;
