export type DisabilityProfile = "dyslexia" | "deaf_hoh";

export const PROFILES: {
  value: DisabilityProfile;
  label: string;
  blurb: string;
}[] = [
  {
    value: "dyslexia",
    label: "Dyslexia",
    blurb:
      "Short chunks, simpler sentences, a key-term glossary, and a read-aloud button.",
  },
  {
    value: "deaf_hoh",
    label: "Deaf or hard of hearing",
    blurb: "Timestamped captions and a concept map of the lecture.",
  },
];
