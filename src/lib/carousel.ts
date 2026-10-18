export type AutoplayState = {
  enabled: boolean;
  reducedMotion: boolean;
  paused: boolean;
  hovered: boolean;
  focused: boolean;
  touched: boolean;
  slideCount: number;
};

/** Moving content must stop whenever the person is reading or interacting with it (WCAG 2.2.2). */
export function shouldAutoplay(s: AutoplayState): boolean {
  return s.enabled && !s.reducedMotion && !s.paused && !s.hovered && !s.focused && !s.touched && s.slideCount > 1;
}
