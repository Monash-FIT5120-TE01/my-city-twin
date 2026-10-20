/* The future words in English (en.ts gathers every section). */
export const future = {
  // Small line above the page title; "Melbourne CBD" is the city centre.
  "future.eyebrow": "Melbourne CBD · Future plans",
  "future.title": "A changing city. Your everyday questions.",
  "future.lede": "Choose a plan. Ask what it could mean for your day.",
  "future.loadingPlans": "Loading the plans…",
  "future.plansError": "The plans could not be loaded. Please try again later.",

  "future.browse.eyebrow": "Explore a plan",
  "future.browse.title": "Which change are you curious about?",
  "future.browse.lead": "Choose a plan, then pick a question to explore what’s changing.",

  // Filter buttons by kind of plan. The "Short" ones are shown on narrow screens.
  "future.kinds.label": "Kind of plan",
  "future.kinds.all": "All plans",
  "future.kinds.allShort": "All",
  "future.kinds.projects": "Projects",
  "future.kinds.projectsShort": "Projects",
  // Work across the whole city (footpath renewal, tree planting…), not one project.
  "future.kinds.programmes": "City-wide programmes",
  "future.kinds.programmesShort": "Programmes",
  "future.themes.label": "Theme",

  // The broad themes plans are grouped into (filter chips).
  "future.family.streets": "Streets & public space",
  "future.family.transport": "Transport & stations",
  "future.family.parks": "Parks & recreation",
  "future.family.water": "Riverfront & waterfront",
  "future.family.trees": "Trees & greening",
  "future.family.bridges": "Bridges",
  "future.family.walking": "Walking & cycling",
  "future.family.tech": "City infrastructure",
  "future.family.planning": "Planning",

  // <b>…</b> is shown in bold: the number of plans left after filtering.
  "future.result.showing": "Showing <b>{shown}</b> of {total} plans",
  "future.result.clear": "Clear filters",
  "future.none.title": "No plans match.",
  "future.none.body": "Clear the filters to see every plan.",

  "future.group.projects": "Projects",
  "future.group.programmes": "City-wide programmes",
  "future.group.programmesNote": "Ongoing work across many streets, and plans still being watched — not single projects.",
  // On each plan card: opens the plan's guided questions.
  "future.card.open": "Open a conversation",

  // One plan's page: questions and saved answers shown like a chat.
  "future.talk.eyebrow": "A little city conversation",
  "future.talk.back": "Choose another plan",
  "future.talk.title": "Your conversation",
  "future.talk.kind": "Guided questions",
  // Label above messages written by the reader.
  "future.talk.you": "You",
  // The app's first message; {plan} is the plan's name.
  "future.talk.greeting": "Let’s explore {plan}. What would you like to know about the plan?",
  "future.talk.openingTitle": "What’s on your mind?",
  "future.talk.openingSub": "Start with what matters to you. Tap a question to ask it.",
  "future.talk.loadingQuestions": "Loading the questions…",
  "future.talk.questionsError": "The questions could not be loaded. Please try again later.",
  "future.talk.noQuestions": "No guided questions for this plan yet.",
  "future.talk.keepExploring": "Choose a question to keep exploring.",
  "future.talk.allAsked": "You have asked every question.",
  "future.talk.askedLabel": "Questions already asked",
  // Hidden, read by screen readers after a question already asked; starts with a dash.
  "future.talk.revisit": " — revisit answer",
  "future.talk.restart": "Start this conversation again",
  // Screen reader announcements.
  "future.talk.opening": "Opening the saved answer",
  // {heading} is the answer's heading.
  "future.talk.answerReady": "Answer ready: {heading}",

  "future.related.title": "Connected topics",
  "future.related.note": "Explore plans that share a theme. These links do not imply a joint delivery schedule.",

  // {basis} is the kind of evidence, e.g. "Published project scope".
  "future.answer.basis": "Based on: {basis}",
  "future.answer.sourceOne": "Supporting source",
  "future.answer.sourceOther": "Supporting sources",
  // Hidden, read by screen readers after a link.
  "future.answer.newTab": " (opens in a new tab)",
  // {date} is when the source was last read, e.g. 2026-10-05.
  "future.answer.checked": "Source checked: {date}.",

  "future.foot.title": "Possible effects, not promises.",
  "future.foot.body": "These guides explain what to consider. They don’t calculate prices, rent, travel times or local conditions.",
  "future.foot.fine": "Project sources · Guided conversations",
} as const;
