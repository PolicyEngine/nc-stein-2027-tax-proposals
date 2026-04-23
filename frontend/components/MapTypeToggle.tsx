'use client';

// The NC Stein FY2026-27 tax proposals dashboard uses a single inline SVG
// map of North Carolina's 14 congressional districts, so a geographic/hex
// map-type toggle is not meaningful. This stub is kept only to preserve the
// import path used by legacy callers; it renders nothing.

interface Props {
  mapType?: 'geographic' | 'hex';
  onChange?: (type: 'geographic' | 'hex') => void;
}

export default function MapTypeToggle(_props: Props) {
  void _props;
  return null;
}
