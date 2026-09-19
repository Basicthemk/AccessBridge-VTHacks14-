import ReadAloud from "@/components/ReadAloud";
import ConceptMapView from "@/components/ConceptMap";
import type { DeafHohMaterial, DyslexiaMaterial, StudyMaterial } from "@/lib/study-material";

// Section headings inside the material. Structure comes from real headings and
// lists so screen readers and the browser's outline both work.
const h3 = "text-xl font-semibold";

function Terms({ items }: { items: { term: string; definition: string }[] }) {
  return (
    <dl className="flow">
      {items.map((t) => (
        <div key={t.term}>
          <dt className="font-bold">{t.term}</dt>
          <dd>{t.definition}</dd>
        </div>
      ))}
    </dl>
  );
}

function Dyslexia({ m, lectureId }: { m: DyslexiaMaterial; lectureId: string }) {
  return (
    <div className="reading reading-relaxed flow-lg">
      <section aria-labelledby="summary">
        <h3 id="summary" className={h3}>Summary</h3>
        <div className="mt-2"><ReadAloud lectureId={lectureId} section="summary" label="summary" /></div>
        <div className="flow-lg mt-3">
          {m.summary_chunks.map((c, i) => (
            <section key={i} className="border-l-4 border-accent pl-3">
              <h4 className="text-lg font-semibold">{c.heading}</h4>
              <p className="mt-1">{c.text}</p>
            </section>
          ))}
        </div>
      </section>

      {m.key_terms.length > 0 && (
        <section aria-labelledby="terms">
          <h3 id="terms" className={h3}>Key terms</h3>
          <div className="mt-2"><ReadAloud lectureId={lectureId} section="terms" label="key terms" /></div>
          <div className="mt-3">
            <Terms items={m.key_terms} />
          </div>
        </section>
      )}

      <section aria-labelledby="outline">
        <h3 id="outline" className={h3}>Outline</h3>
        <div className="mt-2"><ReadAloud lectureId={lectureId} section="outline" label="outline" /></div>
        <ul className="flow mt-3 list-disc pl-4">
          {m.outline.map((p, i) => (
            <li key={i}>
              {p.text}
              {p.children.length > 0 && (
                <ul className="flow mt-2 list-disc pl-4">
                  {p.children.map((c, j) => (
                    <li key={j}>{c}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function DeafHoh({ m }: { m: DeafHohMaterial }) {
  return (
    <div className="reading flow-lg">
      <ConceptMapView map={m.concept_map} unavailable={m.concept_map_unavailable} />

      <section aria-labelledby="captions">
        <h3 id="captions" className={h3}>Captioned transcript</h3>
        <div className="flow-lg mt-3">
          {m.sections.map((s, i) => (
            <section key={i} aria-labelledby={`sec-${i}`}>
              <h4 id={`sec-${i}`} className="text-lg font-semibold">{s.heading}</h4>
              <div className="flow mt-2">
                {s.paragraphs.map((lines, j) => (
                  <p key={j}>
                    {lines.map((l, k) => (
                      <span key={k} className="block">{l}</span>
                    ))}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      {m.glossary.length > 0 && (
        <section aria-labelledby="glossary">
          <h3 id="glossary" className={h3}>Glossary</h3>
          <div className="mt-3">
            <Terms items={m.glossary} />
          </div>
        </section>
      )}

      <section aria-labelledby="emphasised">
        <h3 id="emphasised" className={h3}>What was emphasised</h3>
        {m.emphasised.length === 0 ? (
          <p className="mt-3">The transcript shows nothing the lecturer stressed in words.</p>
        ) : (
          <ul className="flow mt-3 list-disc pl-4">
            {m.emphasised.map((e, i) => (
              <li key={i}>
                <strong>{e.point}</strong>
                <span className="block">How we know: {e.cue}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function StudyMaterialView({ material, lectureId }: { material: StudyMaterial; lectureId: string }) {
  return material.profile === "dyslexia" ? <Dyslexia m={material} lectureId={lectureId} /> : <DeafHoh m={material} />;
}
