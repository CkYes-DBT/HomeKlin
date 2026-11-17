import { LanguageSwitch } from "./language-switch";

type FloatingLanguageSwitchProps = {
  /**
   * app: the customer app, above the phone's bottom bar. flow: the booking flow, which has no bottom
   * bar: over the bottom edge, lifted above the phone's booking bar while it shows. There the switch
   * keeps the page's query (the choice, the order), so a new language stays on the same step.
   */
  place?: "app" | "flow";
};

// The customer pages' language switch (the customer app's and the booking flow's layouts): the same
// ID | EN toggle, floating at the bottom-left of the viewport on every page. Fixed, so it stays while
// the page scrolls; it sits above the phone's bottom bar (never over it) and clears the home indicator
// and the side insets (float-corner and float-corner-flow, globals.css). The shells leave room for it
// under the page (pb-clear-float, pb-clear-switch), so it never covers the last content. It sits under
// the account menu (z-sticky against the bar's z-nav), which opens over it. The white track, its edge
// and the raised shadow keep it readable over any page content.
export function FloatingLanguageSwitch({ place = "app" }: FloatingLanguageSwitchProps) {
  const corner = place === "flow" ? "float-corner-flow transition-[bottom] duration-200 ease-out-quart" : "float-corner";
  return (
    <div className={`${corner} z-(--z-sticky) rounded-full shadow-raised`}>
      <LanguageSwitch palette="forest" keepQuery={place === "flow"} />
    </div>
  );
}
