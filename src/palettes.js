import {
  schemeTableau10, schemePastel1, schemeSet1, schemeSet2, schemeSet3,
  schemeAccent, schemeDark2, schemePaired,
} from 'd3';

const PALETTES = {
  Tableau10: schemeTableau10,
  Pastel1: schemePastel1,
  Set1: schemeSet1,
  Set2: schemeSet2,
  Set3: schemeSet3,
  Accent: schemeAccent,
  Dark2: schemeDark2,
  Paired: schemePaired,
};

export const PALETTE_NAMES = Object.keys(PALETTES);

export function getPalette(name) {
  return PALETTES[name] || schemeTableau10;
}

/** Genome ring colours: Dark2-first on white, Tableau10-first on the dark canvas. */
export function genomeColorScheme(theme) {
  return theme === 'light'
    ? schemeDark2.concat(schemeTableau10)
    : schemeTableau10.concat(schemePastel1);
}
