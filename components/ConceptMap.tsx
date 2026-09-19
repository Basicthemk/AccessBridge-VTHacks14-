import ConceptLink from "@/components/ConceptLink";
import { relationSentence, type Concept, type ConceptMap } from "@/lib/study-material";

// The concept map as real headings and lists. There is no diagram: every connection is a
// sentence ("Photosynthesis produces glucose."), and the order is the order a reader should
// meet the ideas, so screen reader and keyboard order follow the meaning. The target of each
// sentence is a link that jumps to that idea's entry.

const h3 = "text-2xl font-semibold";

export default function ConceptMapView({ map, unavailable }: { map: ConceptMap | undefined; unavailable?: boolean }) {
  return (
    <section aria-labelledby="concept-map">
      <h3 id="concept-map" className={h3}>Concept map</h3>

      {!map && unavailable ? (
        <p className="mt-3">
          The concept map couldn’t be made this time because the study-material service was busy or out of its daily limit.
          Your captions and glossary below are complete. Choose “Make study material again” under Progress to try the map again later.
        </p>
      ) : !map ? (
        <p className="mt-3">
          This study material was made before concept maps existed. Choose “Make study material again” under Progress to add one.
        </p>
      ) : (
        <Body map={map} />
      )}
    </section>
  );
}

function Body({ map }: { map: ConceptMap }) {
  const byId = new Map<string, Concept>();
  for (const t of map.themes) for (const c of t.concepts) byId.set(c.id, c);

  return (
    <>
      <p className="mt-3">
        How the ideas in this lecture connect. Each idea is listed with what it links to, written as a sentence. The
        last word of each sentence is a link to that idea.
      </p>
      <div className="flow-lg mt-4">
        {map.themes.map((theme, i) => (
          <section key={i} aria-labelledby={`theme-${i}`}>
            <h4 id={`theme-${i}`} className="text-xl font-semibold">{theme.name}</h4>
            <ul className="flow mt-2">
              {theme.concepts.map((c) => (
                <li key={c.id} id={`concept-${c.id}`} tabIndex={-1} className="concept-target border-l-4 border-accent pl-3">
                  <h5 className="font-bold">{c.name}</h5>
                  <p className="mt-1">{c.explanation}</p>
                  {c.relations.length > 0 && (
                    <ul aria-label={`Connections from ${c.name}`} className="mt-2 list-disc pl-4">
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
