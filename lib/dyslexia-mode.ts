export const DYSLEXIA_KEY = "ab-dyslexia";

// Runs in <head> before first paint: a saved choice wins.
export const APPLY_SAVED_SCRIPT = `try{if(localStorage.getItem("${DYSLEXIA_KEY}")==="on")document.documentElement.dataset.dyslexia="true"}catch(e){}`;

// Runs at the top of the page body for a signed-in student, still before first paint.
// With no saved choice (or storage blocked), the profile decides the default.
export const applyDefaultScript = (defaultOn: boolean) =>
  `try{var v=localStorage.getItem("${DYSLEXIA_KEY}");if(v===null){${
    defaultOn
      ? 'document.documentElement.dataset.dyslexia="true"'
      : "delete document.documentElement.dataset.dyslexia"
  }}}catch(e){${defaultOn ? 'document.documentElement.dataset.dyslexia="true"' : ""}}`;
