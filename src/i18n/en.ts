/*
 * The interface's words in English: the source every other language is translated from (i18n.ts).
 * A key names where the words are used; {name} is filled in when they are said.
 */
import { parts } from './sections/parts';
import { pages } from './sections/pages';
import { landing } from './sections/landing';
import { solar } from './sections/solar';
import { activity } from './sections/activity';
import { future } from './sections/future';
import { sentences } from './sections/sentences';
import { sunlight } from './sections/sunlight';

export const en = {
  "header.home": "My City Twin — home",
  "header.enterVr": "Enter VR",
  "header.mapLayers": "Map layers",
  "header.layersHidden": "layers hidden",
  "header.language": "Language",
  "nav.futurePlans": "Future plans",
  "nav.streetActivity": "Street activity",
  "nav.explore": "Explore the city",
  "nav.howItWorks": "How it works",
  "search.placeholder": "Search a street or address",
  "search.label": "Search for a street or address",
  "search.clear": "Clear the search",
  "search.landingPlaceholder": "Search a landmark, street or address",
  "search.loading": "The city is loading…",
  "search.results": "Search results",
  "search.none": "Nothing matches that. {buildings} buildings and {projects} approved projects can be searched by address, and {landmarks} landmarks by name; some older buildings have no address on record.",
  "search.noneNoLandmarks": "Nothing matches that. {buildings} buildings and {projects} approved projects can be searched by address; some older buildings have no address on record.",
  ...sunlight,
  ...parts,
  ...pages,
  ...landing,
  ...solar,
  ...activity,
  ...future,
  ...sentences,
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
