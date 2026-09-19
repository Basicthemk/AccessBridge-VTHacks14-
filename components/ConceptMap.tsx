import { useTranslations } from "next-intl";
import ConceptLink from "@/components/ConceptLink";
import { relationSentence, type Concept, type ConceptMap } from "@/lib/study-material";

// The concept map as real headings and lists. There is no diagram: every connection is a
// sentence ("Photosynthesis produces glucose."), and the order is the order a reader should
// meet the ideas, so screen reader and keyboard order follow the meaning. The target of each
// sentence is a link that jumps to that idea's entry.

const h3 = "text-xl font-semibold";

export default function ConceptMapView({ map, unavailable }: { map: ConceptMap | undefined; unavailable?: boolean }) {
  const t = useTranslations("Concept");
  return (
    <section aria-labelledby="concept-map">
      <h3 id="concept-map" className={h3}>{t("title")}</h3>

      {!map && unavailable ? (
        <p className="mt-3">
          {t("unavailable")}
        </p>
      ) : !map ? (
        <p className="mt-3">
          {t("old")}
        </p>
      ) : (
        <Body map={map} />
      )}
    </section>
  );
}

function Body({ map }: { map: ConceptMap }) {
  const t = useTranslations("Concept");
  const byId = new Map<string, Concept>();
  for (const t of map.themes) for (const c of t.concepts) byId.set(c.id, c);

  return (
    <>
      <p className="mt-3">
        {t("intro")}
      </p>
      <div className="flow-lg mt-4">
        {map.themes.map((theme, i) => (
          <section key={i} aria-labelledby={`theme-${i}`}>
            <h4 id={`theme-${i}`} className="text-lg font-semibold">{theme.name}</h4>
            <ul className="flow mt-2">
              {theme.concepts.map((c) => (
                <li key={c.id} id={`concept-${c.id}`} tabIndex={-1} className="concept-target border-l-4 border-accent pl-3">
                  <h5 className="font-bold">{c.name}</h5>
                  <p className="mt-1">{c.explanation}</p>
                  {c.relations.length > 0 && (
                    <ul aria-label={t("connections", { name: c.name })} className="mt-2 list-disc pl-4">
                      {c.relations.map((r) => {
                        const to = byId.get(r.to)!;
                        // Same sentence as relationSentence(); the target name is a link.
                        const sentence = relationSentence(c, r.verb, to);
                        const head = sentence.slice(0, sentence.length - to.name.length - 1);
                        return (
                          <li key={r.to}>
                            {head}
                            <ConceptLink id={to.id}>{to.name}</ConceptLink>
                            .
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
