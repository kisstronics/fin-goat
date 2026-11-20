import { InfoLayout } from '../components/InfoLayout';

export function AboutPage() {
  return (
    <InfoLayout title="Who we are">
      <section className="content-page">
        <p className="eyebrow">About</p>
        <h1>Who we are</h1>
        <div className="prose-block">
          <p>
            Fin Goat is an Indian personal wealth and market intelligence app —
            track investments and loans in one place, run stock screeners, and
            get alerts when conditions change.
          </p>
          <p>
            Screeners and insights are analytical tools based on historical
            market data. They are not buy or sell recommendations.
          </p>
          <p className="muted">Built by Knics.</p>
        </div>
      </section>
    </InfoLayout>
  );
}
