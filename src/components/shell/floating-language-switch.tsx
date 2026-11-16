import { LanguageSwitch } from "./language-switch";

// The customer pages' language switch (customer layout): the same ID | EN toggle, floating at the
// bottom-left of the viewport on every page. Fixed, so it stays while the page scrolls; it sits above the
// phone's bottom bar (never over it) and clears the home indicator and the side insets (float-corner,
// globals.css). The shell leaves room for it under the page (pb-clear-float), so it never covers the last
// content. It sits under the account menu (z-sticky against the bar's z-nav), which opens over it. The
// white track, its edge and the raised shadow keep it readable over any page content.
export function FloatingLanguageSwitch() {
  return (
    <div className="float-corner z-(--z-sticky) rounded-full shadow-raised">
      <LanguageSwitch palette="forest" />
    </div>
  );
}
