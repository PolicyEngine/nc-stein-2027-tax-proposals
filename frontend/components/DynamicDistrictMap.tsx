'use client';

// The North Carolina map is a simple inline SVG — no browser-only deps — so
// we can re-export the component directly instead of loading it dynamically.
// The NCDistrictData type is re-exported so consumers that previously
// imported from this module continue to compile.
export { default } from './USDistrictChoroplethMap';
export type { NCDistrictData } from './USDistrictChoroplethMap';
